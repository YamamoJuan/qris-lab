import { describe, expect, it } from 'vitest';
import { computePayloadCrc, crc16, formatCrc } from '../src/core/crc16.js';
import { SYNTH_DYNAMIC, SYNTH_NON_ASCII, SYNTH_STATIC } from './fixtures.js';

describe('crc16 (CRC-16/CCITT-FALSE)', () => {
  it('matches the standard check value', () => {
    expect(crc16('123456789')).toBe(0x29b1);
  });

  it('returns the init value for empty input', () => {
    expect(crc16('')).toBe(0xffff);
  });

  it('matches independently computed vectors', () => {
    expect(crc16('A')).toBe(0xb915);
  });

  it('accepts bytes and strings equivalently', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });

  it('hashes strings as UTF-8 bytes', () => {
    expect(computePayloadCrc(SYNTH_NON_ASCII.slice(0, -4))).toBe('5DD0');
  });

  it('formats as 4 uppercase hex chars with zero padding', () => {
    expect(formatCrc(0x29b1)).toBe('29B1');
    expect(formatCrc(0x000a)).toBe('000A');
  });

  it('computes payload CRC over everything up to and including 6304', () => {
    expect(computePayloadCrc(SYNTH_STATIC.slice(0, -4))).toBe('E7AD');
    expect(computePayloadCrc(SYNTH_DYNAMIC.slice(0, -4))).toBe('F9EB');
  });

  it('rejects CRC input that does not end with 6304', () => {
    expect(() => computePayloadCrc('000201')).toThrow(/6304/);
  });
});
