import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT_INVALID, EXIT_OK, EXIT_USAGE, main } from '../src/cli/program.js';
import { isSensitivePath, maskValue } from '../src/cli/mask.js';
import { decodeQrFromBytes } from '../src/core/qr-parser.js';
import { PNG_COMMENT, readPngTextChunks } from '../src/generators/qr-generator.js';
import {
  SYNTH_DYNAMIC,
  SYNTH_DYNAMIC_OPAQUE_REF,
  SYNTH_STATIC,
  SYNTH_STATIC_TO_DYNAMIC_15000,
} from './fixtures.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'qris-lab-test-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(args: string[], stdin?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: (async function* () {
      if (stdin !== undefined) yield Buffer.from(stdin);
    })(),
  });
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

describe('input resolution', () => {
  it('accepts the payload as an argument', async () => {
    const r = await run(['decode', SYNTH_STATIC]);
    expect(r.code).toBe(EXIT_OK);
    expect(r.stdout).toContain('Merchant Name');
  });

  it('accepts a text file (trimmed)', async () => {
    const f = join(dir, 'p.txt');
    await writeFile(f, `${SYNTH_STATIC}\n`);
    expect((await run(['validate', f])).code).toBe(EXIT_OK);
  });

  it('accepts a PNG QR image', async () => {
    const f = join(dir, 'p.png');
    await writeFile(f, await QRCode.toBuffer(SYNTH_DYNAMIC, { type: 'png' }));
    const r = await run(['analyze', f, '--json']);
    expect(JSON.parse(r.stdout).summary.amount).toBe('2000');
  });

  it('accepts stdin', async () => {
    const r = await run(['validate', '-'], `${SYNTH_STATIC}\n`);
    expect(r.code).toBe(EXIT_OK);
  });
});

describe('decode', () => {
  it('prints a nested tree with lengths and CRC status', async () => {
    const r = await run(['decode', SYNTH_STATIC]);
    expect(r.stdout).toMatch(/^26 \[62\] Merchant Account Information Template$/m);
    expect(r.stdout).toMatch(/^ {2}00 \[15\] Globally Unique Identifier\s+"COM.EXAMPLE.WWW"$/m);
    expect(r.stdout).toMatch(/CRC: VALID \(payload E7AD, computed E7AD\)/);
  });

  it('exits 1 and reports position on malformed input', async () => {
    const r = await run(['decode', '0002015910ABC']);
    expect(r.code).toBe(EXIT_INVALID);
    expect(r.stdout).toContain('ERROR TRUNCATED_VALUE @6');
  });
});

describe('analyze', () => {
  it('summarises and always includes the structural disclaimer', async () => {
    const r = await run(['analyze', SYNTH_DYNAMIC_OPAQUE_REF]);
    expect(r.stdout).toContain('Initiation method : dynamic');
    expect(r.stdout).toContain('Amount            : 2000');
    expect(r.stdout).toContain('62.50');
    expect(r.stdout).toContain('Structural analysis only');
  });

  it('--mask hides merchant and transaction identifiers but keeps structure', async () => {
    const r = await run(['analyze', SYNTH_DYNAMIC_OPAQUE_REF, '--mask']);
    expect(r.stdout).not.toContain(SYNTH_DYNAMIC_OPAQUE_REF);
    expect(r.stdout).not.toContain('TOKO CONTOH');
    expect(r.stdout).not.toContain('999900000000000001');
    expect(r.stdout).not.toContain('ID0000000000001');
    expect(r.stdout).not.toContain('X120990101000000ABCD');
    expect(r.stdout).toContain('TOKOXXXXXXX');
    expect(r.stdout).toContain('COM.EXAMPLE.WWW');
    expect(r.stdout).toContain('Amount            : 2000');
  });
});

describe('validate', () => {
  it('exits 0 for valid and 1 for invalid payloads', async () => {
    expect((await run(['validate', SYNTH_STATIC])).code).toBe(EXIT_OK);
    const bad = await run(['validate', SYNTH_STATIC.slice(0, -4) + '0000']);
    expect(bad.code).toBe(EXIT_INVALID);
    expect(bad.stdout).toContain('CRC_INVALID');
  });

  it('supports JSON output', async () => {
    const r = await run(['validate', SYNTH_STATIC, '--json']);
    expect(JSON.parse(r.stdout)).toEqual({ valid: true, errors: [], warnings: [] });
  });
});

describe('compare', () => {
  it('lists only differences by default', async () => {
    const r = await run(['compare', SYNTH_STATIC, SYNTH_DYNAMIC]);
    expect(r.stdout).toMatch(/^~ 01\s+Point of Initiation Method\s+2→2\s+"11" → "12"$/m);
    expect(r.stdout).toMatch(/^\+ 54\s+Transaction Amount\s+-→4\s+- → "2000"$/m);
    expect(r.stdout).not.toMatch(/^= 59/m);
    expect(r.stdout).toContain('Counts:');
  });

  it('--all includes unchanged tags', async () => {
    const r = await run(['compare', SYNTH_STATIC, SYNTH_DYNAMIC, '--all']);
    expect(r.stdout).toMatch(/^= 59/m);
  });
});

describe('encode', () => {
  it('encodes JSON with CRC', async () => {
    const f = join(dir, 'in.json');
    await writeFile(
      f,
      JSON.stringify([
        { tag: '00', value: '01' },
        { tag: '62', children: [{ tag: '07', value: 'T1' }] },
      ]),
    );
    const r = await run(['encode', f]);
    expect(r.stdout).toMatch(/^00020162060702T16304[0-9A-F]{4}$/);
    // Not a complete EMVCo payload → structural warnings on stderr, still exit 0.
    expect(r.code).toBe(EXIT_OK);
    expect(r.stderr).toContain('MISSING_TAG');
  });

  it('--no-crc omits tag 63', async () => {
    const r = await run(['encode', '-', '--no-crc'], '[{"tag":"59","value":"A"}]');
    expect(r.stdout).toBe('5901A');
  });

  it('rejects malformed JSON input', async () => {
    expect((await run(['encode', '-'], '{')).code).toBe(EXIT_USAGE);
    const r = await run(['encode', '-'], '[{"tag":"59"}]');
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.stderr).toContain('$[0].value must be a string');
  });
});

describe('generate', () => {
  it('writes a labelled test PNG for a valid payload', async () => {
    const f = join(dir, 'static.png');
    const r = await run(['generate', SYNTH_STATIC, '-o', f, '--ecl', 'H', '--scale', '4']);
    expect(r.code).toBe(EXIT_OK);
    const png = await readFile(f);
    expect(decodeQrFromBytes(png)).toBe(SYNTH_STATIC);
    expect(readPngTextChunks(png).Comment).toBe(PNG_COMMENT);
  });

  it('--amount converts static → dynamic and reports changes and limitations', async () => {
    const f = join(dir, 'dyn.png');
    const r = await run(['generate', SYNTH_STATIC, '-o', f, '--amount', '15000']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.stdout).toContain('LOCALLY MODIFIED TEST PAYLOAD');
    expect(r.stdout).toMatch(/01 {3}11 → 12/);
    expect(r.stdout).toContain('No provider transaction reference');
    expect(decodeQrFromBytes(await readFile(f))).toBe(SYNTH_STATIC_TO_DYNAMIC_15000);
  });

  it('creates missing output directories', async () => {
    const f = join(dir, 'new', 'nested', 'out.png');
    expect((await run(['generate', SYNTH_STATIC, '-o', f])).code).toBe(EXIT_OK);
    expect(decodeQrFromBytes(await readFile(f))).toBe(SYNTH_STATIC);
  });

  it('refuses to overwrite without --force', async () => {
    const f = join(dir, 'exists.png');
    await writeFile(f, 'x');
    const r = await run(['generate', SYNTH_STATIC, '-o', f]);
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.stderr).toContain('--force');
    expect((await run(['generate', SYNTH_STATIC, '-o', f, '--force'])).code).toBe(EXIT_OK);
  });

  it('refuses provider-issued dynamic payloads with --amount', async () => {
    const r = await run([
      'generate',
      SYNTH_DYNAMIC_OPAQUE_REF,
      '-o',
      join(dir, 'no.png'),
      '--amount',
      '1',
    ]);
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.stderr).toContain('provider-issued');
  });

  it('refuses invalid payloads', async () => {
    const r = await run(['generate', 'hello', '-o', join(dir, 'bad.png')]);
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.stderr).toContain('Refusing to generate');
  });

  it('validates option values', async () => {
    expect(
      (await run(['generate', SYNTH_STATIC, '-o', join(dir, 'e.png'), '--ecl', 'Z'])).code,
    ).toBe(EXIT_USAGE);
    expect(
      (await run(['generate', SYNTH_STATIC, '-o', join(dir, 's.png'), '--scale', '0'])).code,
    ).toBe(EXIT_USAGE);
  });
});

describe('usage', () => {
  it('prints help and exits 0', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(EXIT_OK);
    expect(r.stdout).toContain('Structural validity is never proof');
  });

  it('exits 2 on unknown commands', async () => {
    expect((await run(['explode'])).code).toBe(EXIT_USAGE);
  });
});

describe('mask', () => {
  it('keeps a short prefix and preserves length', () => {
    expect(maskValue('ID0000000000001')).toBe('ID00XXXXXXXXXXX');
    expect(maskValue('ABC')).toBe('XXX');
  });

  it('classifies sensitive paths', () => {
    expect(isSensitivePath(['59'])).toBe(true);
    expect(isSensitivePath(['54'])).toBe(false);
    expect(isSensitivePath(['26', '00'])).toBe(false);
    expect(isSensitivePath(['26', '01'])).toBe(true);
    expect(isSensitivePath(['51', '02'])).toBe(true);
    expect(isSensitivePath(['62', '07'])).toBe(false);
    expect(isSensitivePath(['62', '50'])).toBe(true);
  });
});
