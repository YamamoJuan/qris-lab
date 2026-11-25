import jpeg from 'jpeg-js';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import {
  decodeImage,
  decodeQrFromBytes,
  detectImageFormat,
  normalizePayloadText,
  QrDecodeError,
} from '../src/core/qr-parser.js';
import { SYNTH_DYNAMIC, SYNTH_STATIC } from './fixtures.js';

describe('qr-parser', () => {
  it('round-trips a payload through a PNG QR image', async () => {
    const png = await QRCode.toBuffer(SYNTH_STATIC, { type: 'png', errorCorrectionLevel: 'M' });
    expect(detectImageFormat(png)).toBe('png');
    expect(decodeQrFromBytes(png)).toBe(SYNTH_STATIC);
  });

  it('round-trips a payload through a JPEG QR image', async () => {
    const png = await QRCode.toBuffer(SYNTH_DYNAMIC, { type: 'png', scale: 6 });
    const { data, width, height } = decodeImage(png);
    const jpg = jpeg.encode({ data: Buffer.from(data), width, height }, 90).data;
    expect(detectImageFormat(jpg)).toBe('jpeg');
    expect(decodeQrFromBytes(jpg)).toBe(SYNTH_DYNAMIC);
  });

  it('rejects unsupported formats', () => {
    expect(() => decodeQrFromBytes(new TextEncoder().encode('GIF89a...'))).toThrow(QrDecodeError);
  });

  it('reports images without a QR code', () => {
    const blank = { data: Buffer.alloc(64 * 64 * 4, 255), width: 64, height: 64 };
    const jpg = jpeg.encode(blank, 90).data;
    expect(() => decodeQrFromBytes(jpg)).toThrow(/No QR code found/);
  });

  it('normalises copied payload text', () => {
    expect(normalizePayloadText('﻿  000201\n')).toBe('000201');
  });
});
