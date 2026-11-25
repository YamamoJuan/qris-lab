import { readFile } from 'node:fs/promises';
import jpeg from 'jpeg-js';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';

// jsqr ships CJS typings with `export default`; under NodeNext the default
// import is the module object, so unwrap it (the runtime value works both ways).
const jsQR = (jsQRModule as unknown as { default: typeof jsQRModule.default }).default;

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ImageFormat = 'png' | 'jpeg';

export class QrDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrDecodeError';
  }
}

/** Detect PNG / JPEG from magic bytes (file extensions are not trusted). */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  return undefined;
}

/** Decode PNG or JPEG bytes into RGBA pixels. */
export function decodeImage(bytes: Uint8Array): RgbaImage {
  const format = detectImageFormat(bytes);
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'png') {
    const png = PNG.sync.read(buffer);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  }
  if (format === 'jpeg') {
    const img = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  }
  throw new QrDecodeError('Unsupported image format (expected PNG or JPEG)');
}

/** Read the QR payload from RGBA pixels. */
export function decodeQrFromPixels(image: RgbaImage): string {
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  if (!result) {
    throw new QrDecodeError(
      'No QR code found in image (try a sharper image or a tighter crop around the code)',
    );
  }
  return result.data;
}

/** Read the QR payload from PNG/JPEG bytes. */
export function decodeQrFromBytes(bytes: Uint8Array): string {
  return decodeQrFromPixels(decodeImage(bytes));
}

/** Read the QR payload from a PNG/JPEG file. */
export async function decodeQrFile(path: string): Promise<string> {
  return decodeQrFromBytes(await readFile(path));
}

/**
 * Normalise text input: trims surrounding whitespace and a trailing newline,
 * which commonly sneak in when payloads are copied or piped.
 */
export function normalizePayloadText(text: string): string {
  return text.replace(/^\uFEFF/, '').trim();
}
