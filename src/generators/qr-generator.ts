import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { validatePayload } from '../validators/payload-validator.js';
import { drawText, textWidth } from './bitmap-font.js';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface TestQrOptions {
  errorCorrectionLevel?: ErrorCorrectionLevel;
  /** Pixels per QR module. Default 8. */
  scale?: number;
  /** Quiet zone in modules. Default 4 (the QR spec minimum). */
  margin?: number;
}

export class QrGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrGenerationError';
  }
}

export const TEST_LABEL_LINES = ['TEST QR - RESEARCH ONLY', 'NOT ISSUED BY ANY PROVIDER'] as const;
export const PNG_COMMENT =
  'QRIS Lab test QR. Not issued by GoPay or any payment provider. Do not use for real payments.';

const BANNER_RGB = [200, 30, 30] as const;

/**
 * Render a structurally valid payload as a PNG QR code with a mandatory red
 * "TEST" banner and a PNG tEXt comment. The banner sits outside the quiet zone
 * so the code remains scannable for analysis — the label is there so the image
 * cannot be mistaken for a provider-issued QRIS.
 */
export async function generateTestQrPng(
  payload: string,
  options: TestQrOptions = {},
): Promise<Buffer> {
  const validation = validatePayload(payload);
  if (!validation.valid) {
    const list = validation.errors.map(
      (e) => `${e.code}${e.path ? ` [${e.path}]` : ''}: ${e.message}`,
    );
    throw new QrGenerationError(
      `Refusing to generate QR for an invalid payload:\n  ${list.join('\n  ')}`,
    );
  }

  const qrPng = await QRCode.toBuffer(payload, {
    type: 'png',
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
    scale: options.scale ?? 8,
    margin: options.margin ?? 4,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  const qr = PNG.sync.read(qrPng);

  const longest = Math.max(...TEST_LABEL_LINES.map((l) => textWidth(l, 1)));
  const textScale = Math.max(1, Math.floor((qr.width - 16) / longest));
  const lineHeight = 8 * textScale;
  const pad = 2 * textScale;
  const bannerHeight = pad * 2 + lineHeight * TEST_LABEL_LINES.length;

  const out = new PNG({ width: qr.width, height: qr.height + bannerHeight });
  qr.data.copy(out.data, 0);

  for (let y = qr.height; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      out.data[i] = BANNER_RGB[0];
      out.data[i + 1] = BANNER_RGB[1];
      out.data[i + 2] = BANNER_RGB[2];
      out.data[i + 3] = 255;
    }
  }
  TEST_LABEL_LINES.forEach((line, row) => {
    const w = textWidth(line, textScale);
    drawText(
      out,
      line,
      Math.floor((out.width - w) / 2),
      qr.height + pad + row * lineHeight,
      textScale,
    );
  });

  return insertPngTextChunk(PNG.sync.write(out), 'Comment', PNG_COMMENT);
}

// --- PNG tEXt chunk -------------------------------------------------------

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC32_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insert a tEXt chunk right after IHDR. Keyword and text must be Latin-1. */
export function insertPngTextChunk(png: Buffer, keyword: string, text: string): Buffer {
  const data = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(text, 'latin1'),
  ]);
  const type = Buffer.from('tEXt', 'latin1');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length);
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8); // signature + IHDR chunk
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

/** Read all tEXt chunks from a PNG (used by tests and `validate`). */
export function readPngTextChunks(png: Buffer): Record<string, string> {
  const result: Record<string, string> = {};
  let pos = 8;
  while (pos + 8 <= png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('latin1', pos + 4, pos + 8);
    if (type === 'tEXt') {
      const body = png.subarray(pos + 8, pos + 8 + len);
      const sep = body.indexOf(0);
      result[body.toString('latin1', 0, sep)] = body.toString('latin1', sep + 1);
    }
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  return result;
}
