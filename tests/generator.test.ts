import { describe, expect, it } from 'vitest';
import { comparePayloads } from '../src/analyzers/payload-comparator.js';
import { decodeQrFromBytes } from '../src/core/qr-parser.js';
import {
  LOCAL_MODIFICATION_LABEL,
  PayloadGenerationError,
  staticToDynamic,
} from '../src/generators/payload-generator.js';
import {
  generateTestQrPng,
  PNG_COMMENT,
  QrGenerationError,
  readPngTextChunks,
} from '../src/generators/qr-generator.js';
import { decodeImage } from '../src/core/qr-parser.js';
import { encodePayload } from '../src/core/tlv-encoder.js';
import { parseTlvStrict } from '../src/core/tlv-parser.js';
import {
  SYNTH_DYNAMIC,
  SYNTH_DYNAMIC_OPAQUE_REF,
  SYNTH_STATIC,
  SYNTH_STATIC_TO_DYNAMIC_15000,
} from './fixtures.js';

describe('staticToDynamic', () => {
  it('sets POI 12, inserts the amount in order and recomputes the CRC', () => {
    const r = staticToDynamic(SYNTH_STATIC, { amount: '15000' });
    expect(r.payload).toBe(SYNTH_STATIC_TO_DYNAMIC_15000);
    expect(r.changes).toEqual([
      { path: '01', from: '11', to: '12' },
      { path: '54', to: '15000' },
      { path: '63', from: 'E7AD', to: '61B2' },
    ]);
    expect(r.validation).toEqual({ valid: true, errors: [], warnings: [] });
    expect(r.label).toBe(LOCAL_MODIFICATION_LABEL);
    expect(r.limitations[0]).toMatch(/No provider transaction reference/);
  });

  it('never changes anything other than 01, 54 and 63', () => {
    const r = staticToDynamic(SYNTH_STATIC, { amount: '2000' });
    const changed = comparePayloads(SYNTH_STATIC, r.payload)
      .entries.filter((e) => e.status !== 'same')
      .map((e) => e.key);
    expect(changed).toEqual(['01', '63', '54']);
  });

  it('adds tag 01 right after 00 if the source has none', () => {
    const noPoi = encodePayload(parseTlvStrict(SYNTH_STATIC).filter((n) => n.tag !== '01'));
    const r = staticToDynamic(noPoi, { amount: '1000' });
    expect(r.payload.startsWith('000201010212')).toBe(true);
    expect(r.changes[0]).toEqual({ path: '01', to: '12' });
    expect(r.validation.valid).toBe(true);
  });

  it('replaces an existing amount on a structurally dynamic payload without provider reference', () => {
    const r = staticToDynamic(SYNTH_DYNAMIC, { amount: '5000' });
    expect(r.changes.map((c) => c.path)).toEqual(['54', '63']);
    expect(r.payload).toContain('54045000');
  });

  it('refuses payloads carrying a provider reference (62.50–99)', () => {
    expect(() => staticToDynamic(SYNTH_DYNAMIC_OPAQUE_REF, { amount: '1000' })).toThrow(
      /62\.50.*provider-issued/,
    );
  });

  it.each(['0', '-5', '1,000', '1e3', '12345678901234', '10.123', ''])(
    'rejects invalid amount %j',
    (amount) => {
      expect(() => staticToDynamic(SYNTH_STATIC, { amount })).toThrow(PayloadGenerationError);
    },
  );

  it('accepts two decimal places', () => {
    expect(staticToDynamic(SYNTH_STATIC, { amount: '1500.50' }).payload).toContain('54071500.50');
  });

  it('refuses structurally invalid sources', () => {
    expect(() => staticToDynamic(SYNTH_STATIC.slice(0, -4) + '0000', { amount: '1' })).toThrow(
      /CRC_INVALID/,
    );
  });
});

describe('generateTestQrPng', () => {
  it('produces a scannable PNG that decodes to the exact payload', async () => {
    const png = await generateTestQrPng(SYNTH_STATIC_TO_DYNAMIC_15000);
    expect(decodeQrFromBytes(png)).toBe(SYNTH_STATIC_TO_DYNAMIC_15000);
  });

  it('adds a visible red TEST banner below the code', async () => {
    const png = await generateTestQrPng(SYNTH_STATIC);
    const img = decodeImage(png);
    expect(img.height).toBeGreaterThan(img.width);
    const i = ((img.height - 1) * img.width + 0) * 4; // bottom-left pixel
    expect([img.data[i], img.data[i + 1], img.data[i + 2]]).toEqual([200, 30, 30]);
    // Banner contains white text pixels.
    let white = 0;
    for (let y = img.width; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4] === 255) white++;
    }
    expect(white).toBeGreaterThan(100);
  });

  it('embeds a PNG comment identifying it as a test QR', async () => {
    const png = await generateTestQrPng(SYNTH_STATIC);
    expect(readPngTextChunks(png)).toEqual({ Comment: PNG_COMMENT });
  });

  it.each(['L', 'M', 'Q', 'H'] as const)('supports error correction level %s', async (ecl) => {
    const png = await generateTestQrPng(SYNTH_STATIC, { errorCorrectionLevel: ecl, scale: 4 });
    expect(decodeQrFromBytes(png)).toBe(SYNTH_STATIC);
  });

  it('refuses invalid payloads', async () => {
    await expect(generateTestQrPng(SYNTH_STATIC.slice(0, -4) + '0000')).rejects.toThrow(
      QrGenerationError,
    );
    await expect(generateTestQrPng('hello')).rejects.toThrow(/invalid payload/);
  });
});
