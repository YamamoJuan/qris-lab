import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { decodeQrFromBytes, detectImageFormat, normalizePayloadText } from '../core/qr-parser.js';

export type InputSource = 'image' | 'text-file' | 'stdin' | 'argument';

export interface ResolvedInput {
  payload: string;
  source: InputSource;
}

async function readStdin(stdin: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

function fromBytes(bytes: Buffer, textSource: InputSource): ResolvedInput {
  if (detectImageFormat(bytes)) return { payload: decodeQrFromBytes(bytes), source: 'image' };
  return { payload: normalizePayloadText(bytes.toString('utf8')), source: textSource };
}

/**
 * Resolve a CLI input argument to a payload string:
 * - "-"                → stdin (image bytes or text)
 * - path to PNG/JPEG   → decoded QR payload
 * - path to other file → file text (trimmed)
 * - anything else      → the argument itself is the payload
 */
export async function resolveInput(
  arg: string,
  stdin: AsyncIterable<Buffer | string> = process.stdin,
): Promise<ResolvedInput> {
  if (arg === '-') return fromBytes(await readStdin(stdin), 'stdin');
  if (existsSync(arg) && statSync(arg).isFile()) return fromBytes(await readFile(arg), 'text-file');
  return { payload: normalizePayloadText(arg), source: 'argument' };
}
