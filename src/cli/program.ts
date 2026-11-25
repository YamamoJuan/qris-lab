import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import { analyzePayload } from '../analyzers/payload-analyzer.js';
import { comparePayloads } from '../analyzers/payload-comparator.js';
import { encodePayload, encodeTlv, type TlvInput } from '../core/tlv-encoder.js';
import { staticToDynamic } from '../generators/payload-generator.js';
import { generateTestQrPng, type ErrorCorrectionLevel } from '../generators/qr-generator.js';
import { validatePayload } from '../validators/payload-validator.js';
import {
  formatAnalysis,
  formatComparison,
  formatDecode,
  formatGeneration,
  formatValidation,
} from './format.js';
import { resolveInput } from './input.js';

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin?: AsyncIterable<Buffer | string>;
}

export const EXIT_OK = 0;
/** Payload is invalid / validation failed. */
export const EXIT_INVALID = 1;
/** Usage or I/O error. */
export const EXIT_USAGE = 2;

class CliFailure extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError('must be a positive integer');
  return n;
}

function parseTlvInputs(value: unknown, path = '$'): TlvInput[] {
  if (!Array.isArray(value))
    throw new CliFailure(`${path} must be an array of {tag, value|children}`, EXIT_USAGE);
  return value.map((item: unknown, i) => {
    const at = `${path}[${i}]`;
    if (typeof item !== 'object' || item === null)
      throw new CliFailure(`${at} must be an object`, EXIT_USAGE);
    const { tag, value: v, children } = item as Record<string, unknown>;
    if (typeof tag !== 'string') throw new CliFailure(`${at}.tag must be a string`, EXIT_USAGE);
    if (children !== undefined)
      return { tag, children: parseTlvInputs(children, `${at}.children`) };
    if (typeof v !== 'string') throw new CliFailure(`${at}.value must be a string`, EXIT_USAGE);
    return { tag, value: v };
  });
}

export function createProgram(io: CliIo): Command {
  const program = new Command()
    .name('qris-lab')
    .description(
      'Research tool for EMVCo MPM / QRIS payloads.\n' +
        'INPUT may be a PNG/JPEG QR image, a text file containing a payload, "-" for stdin, or the payload itself.\n' +
        'Structural validity is never proof of payment authorisation.',
    )
    .version('0.1.0')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  const resolve = async (input: string) => (await resolveInput(input, io.stdin)).payload;
  const maskOpt = () => new Option('--mask', 'mask merchant/transaction identifiers in output');
  const jsonOpt = () => new Option('--json', 'machine-readable JSON output (never masked)');

  program
    .command('decode')
    .description('Decode TLV structure (nested templates, lengths, offsets) and check CRC')
    .argument('<input>')
    .addOption(maskOpt())
    .addOption(jsonOpt())
    .action(async (input: string, opts: { mask?: boolean; json?: boolean }) => {
      const a = analyzePayload(await resolve(input));
      io.stdout(
        opts.json
          ? json({ payload: a.payload, fields: a.fields, parseIssues: a.parseIssues, crc: a.crc })
          : formatDecode(a, { mask: Boolean(opts.mask) }),
      );
      if (a.parseIssues.some((i) => i.severity === 'error')) throw new CliFailure('', EXIT_INVALID);
    });

  program
    .command('analyze')
    .description('Explain tags, merchant accounts, initiation method, amount and CRC')
    .argument('<input>')
    .addOption(maskOpt())
    .addOption(jsonOpt())
    .action(async (input: string, opts: { mask?: boolean; json?: boolean }) => {
      const a = analyzePayload(await resolve(input));
      io.stdout(opts.json ? json(a) : formatAnalysis(a, { mask: Boolean(opts.mask) }));
    });

  program
    .command('validate')
    .description('Validate structure against EMVCo rules (exit code 1 if invalid)')
    .argument('<input>')
    .addOption(jsonOpt())
    .action(async (input: string, opts: { json?: boolean }) => {
      const r = validatePayload(await resolve(input));
      io.stdout(opts.json ? json(r) : formatValidation(r));
      if (!r.valid) throw new CliFailure('', EXIT_INVALID);
    });

  program
    .command('compare')
    .description('Structural diff of two payloads (A vs B)')
    .argument('<a>')
    .argument('<b>')
    .option('--all', 'also list unchanged tags')
    .addOption(maskOpt())
    .addOption(jsonOpt())
    .action(
      async (a: string, b: string, opts: { all?: boolean; mask?: boolean; json?: boolean }) => {
        const c = comparePayloads(await resolve(a), await resolve(b));
        io.stdout(
          opts.json
            ? json(c)
            : formatComparison(c, { all: Boolean(opts.all), mask: Boolean(opts.mask) }),
        );
      },
    );

  program
    .command('encode')
    .description('Encode a JSON array of {tag, value} / {tag, children} into a payload')
    .argument('<json-file>', 'path to JSON file, or "-" for stdin')
    .option('--no-crc', 'do not append tag 63')
    .action(async (file: string, opts: { crc: boolean }) => {
      let text: string;
      if (file === '-') {
        const chunks: Buffer[] = [];
        for await (const c of io.stdin ?? process.stdin) chunks.push(Buffer.from(c));
        text = Buffer.concat(chunks).toString('utf8');
      } else {
        text = await readFile(file, 'utf8');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new CliFailure(`Invalid JSON: ${(e as Error).message}`, EXIT_USAGE);
      }
      const nodes = parseTlvInputs(parsed);
      const payload = opts.crc ? encodePayload(nodes) : encodeTlv(nodes);
      io.stdout(payload);
      if (opts.crc) {
        const r = validatePayload(payload);
        for (const e of r.errors)
          io.stderr(`warning: ${e.code}${e.path ? ` [${e.path}]` : ''}: ${e.message}`);
      }
    });

  program
    .command('generate')
    .description(
      'Generate a TEST QR PNG (red "TEST" banner, never a provider-issued QRIS).\n' +
        'With --amount, first derives a pre-filled-amount payload from a static payload\n' +
        '(changes only tags 01, 54, 63; refuses provider-issued dynamic payloads).',
    )
    .argument('<input>')
    .requiredOption('-o, --output <file>', 'PNG output path')
    .option('--amount <amount>', 'convert static → dynamic with this amount (e.g. 15000)')
    .addOption(
      new Option('--ecl <level>', 'error correction level')
        .choices(['L', 'M', 'Q', 'H'])
        .default('M'),
    )
    .option('--scale <px>', 'pixels per module', parsePositiveInt, 8)
    .option('--force', 'overwrite the output file if it exists')
    .addOption(maskOpt())
    .action(
      async (
        input: string,
        opts: {
          output: string;
          amount?: string;
          ecl: ErrorCorrectionLevel;
          scale: number;
          force?: boolean;
          mask?: boolean;
        },
      ) => {
        if (existsSync(opts.output) && !opts.force) {
          throw new CliFailure(
            `${opts.output} already exists (use --force to overwrite)`,
            EXIT_USAGE,
          );
        }
        let payload = await resolve(input);
        if (opts.amount !== undefined) {
          const g = staticToDynamic(payload, { amount: opts.amount });
          io.stdout(formatGeneration(g, { mask: Boolean(opts.mask) }));
          payload = g.payload;
        }
        const png = await generateTestQrPng(payload, {
          errorCorrectionLevel: opts.ecl,
          scale: opts.scale,
        });
        await mkdir(dirname(opts.output), { recursive: true });
        await writeFile(opts.output, png);
        io.stdout(`\nWrote TEST QR (${png.length} bytes, ECC ${opts.ecl}) to ${opts.output}`);
      },
    );

  return program;
}

/** Run the CLI and return the process exit code. */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    await createProgram(io).parseAsync([...argv], { from: 'user' });
    return EXIT_OK;
  } catch (e) {
    if (e instanceof CommanderError) {
      return e.exitCode === 0 ? EXIT_OK : EXIT_USAGE;
    }
    if (e instanceof CliFailure) {
      if (e.message) io.stderr(`error: ${e.message}`);
      return e.exitCode;
    }
    io.stderr(`error: ${(e as Error).message}`);
    return EXIT_USAGE;
  }
}
