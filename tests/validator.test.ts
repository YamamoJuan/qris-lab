import { describe, expect, it } from 'vitest';
import { extractCrc, recalculateCrc, validateCrc } from '../src/validators/crc-validator.js';
import { SYNTH_DYNAMIC, SYNTH_NON_ASCII, SYNTH_STATIC } from './fixtures.js';

describe('extractCrc', () => {
  it('extracts the covered portion and value', () => {
    const crc = extractCrc(SYNTH_STATIC);
    expect(crc?.value).toBe('E7AD');
    expect(crc?.covered).toBe(SYNTH_STATIC.slice(0, -4));
    expect(crc?.offset).toBe(SYNTH_STATIC.length - 8);
  });

  it('returns undefined when tag 63 is not last', () => {
    expect(extractCrc('0002016304ABCD5802ID')).toBeUndefined();
    expect(extractCrc('abc')).toBeUndefined();
  });
});

describe('validateCrc', () => {
  it.each([SYNTH_STATIC, SYNTH_DYNAMIC, SYNTH_NON_ASCII])('accepts a valid CRC %#', (p) => {
    const r = validateCrc(p);
    expect(r.status).toBe('valid');
    expect(r.message).toMatch(/not proof of authenticity/);
  });

  it('detects a corrupted payload', () => {
    const corrupted = SYNTH_STATIC.replace('TOKO CONTOH', 'TOKO CONTOX');
    const r = validateCrc(corrupted);
    expect(r.status).toBe('invalid');
    expect(r.actual).toBe('E7AD');
    expect(r.expected).not.toBe('E7AD');
  });

  it('detects a wrong CRC value', () => {
    expect(validateCrc(SYNTH_STATIC.slice(0, -4) + '0000').status).toBe('invalid');
  });

  it('reports missing tag 63', () => {
    expect(validateCrc('000201').status).toBe('missing');
  });

  it('reports tag 63 that is not the last data object', () => {
    const r = validateCrc('0002016304ABCD5802ID');
    expect(r.status).toBe('missing');
    expect(r.message).toMatch(/offset 6/);
  });

  it('reports non-hex CRC values', () => {
    expect(validateCrc(SYNTH_STATIC.slice(0, -4) + 'ZZZZ').status).toBe('malformed');
  });

  it('accepts lowercase hex but warns', () => {
    const r = validateCrc(SYNTH_STATIC.slice(0, -4) + 'e7ad');
    expect(r.status).toBe('valid');
    expect(r.warnings).toHaveLength(1);
  });
});

describe('recalculateCrc', () => {
  it('fixes a stale CRC', () => {
    expect(recalculateCrc(SYNTH_STATIC.slice(0, -4) + '0000')).toBe(SYNTH_STATIC);
  });

  it('appends tag 63 when missing', () => {
    expect(recalculateCrc(SYNTH_STATIC.slice(0, -8))).toBe(SYNTH_STATIC);
  });
});
