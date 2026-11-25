import { describe, expect, it } from 'vitest';
import { encodePayload, encodeTlv, TlvEncodeError } from '../src/core/tlv-encoder.js';
import { findNode, parseTlvStrict } from '../src/core/tlv-parser.js';
import { SYNTH_DYNAMIC, SYNTH_NON_ASCII, SYNTH_STATIC } from './fixtures.js';

describe('encodeTlv', () => {
  it('computes two-digit lengths automatically', () => {
    expect(
      encodeTlv([
        { tag: '00', value: '01' },
        { tag: '59', value: 'TOKO CONTOH' },
      ]),
    ).toBe('0002015911TOKO CONTOH');
  });

  it('encodes nested templates and computes the parent length', () => {
    expect(encodeTlv([{ tag: '62', children: [{ tag: '07', value: 'TERM0001' }] }])).toBe(
      '62120708TERM0001',
    );
  });

  it('preserves input order', () => {
    expect(
      encodeTlv([
        { tag: '59', value: 'A' },
        { tag: '00', value: '01' },
      ]),
    ).toBe('5901A000201');
  });

  it('counts length in characters for non-ASCII values', () => {
    expect(encodeTlv([{ tag: '59', value: 'KAFÉ' }])).toBe('5904KAFÉ');
  });

  it('round-trips parsed payloads exactly', () => {
    for (const payload of [SYNTH_STATIC, SYNTH_DYNAMIC, SYNTH_NON_ASCII]) {
      expect(encodeTlv(parseTlvStrict(payload))).toBe(payload);
    }
  });

  it('recomputes the parent length when a child is edited', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC);
    const terminal = findNode(nodes, '62', '07');
    if (!terminal) throw new Error('fixture missing 62/07');
    terminal.value = 'T1';
    expect(encodeTlv(nodes)).toContain('62060702T1');
  });

  it.each([
    [{ tag: '5', value: 'x' }, /two digits/],
    [{ tag: 'AB', value: 'x' }, /two digits/],
    [{ tag: '59', value: '' }, /outside 01–99/],
    [{ tag: '59', value: 'x'.repeat(100) }, /length 100/],
    [{ tag: '59' }, /neither value nor children/],
  ])('rejects malformed node %#', (node, pattern) => {
    expect(() => encodeTlv([node])).toThrow(TlvEncodeError);
    expect(() => encodeTlv([node])).toThrow(pattern);
  });

  it('rejects a template whose encoded children exceed 99 characters', () => {
    const children = Array.from({ length: 10 }, (_, i) => ({
      tag: String(i).padStart(2, '0'),
      value: 'x'.repeat(8),
    }));
    expect(() => encodeTlv([{ tag: '62', children }])).toThrow(/Tag 62 value length 120/);
  });

  it('reports the path of a nested error', () => {
    expect(() => encodeTlv([{ tag: '62', children: [{ tag: '07', value: '' }] }])).toThrow(
      /at 62 > 07/,
    );
  });

  it('accepts the maximum length of 99', () => {
    expect(encodeTlv([{ tag: '80', value: 'x'.repeat(99) }])).toHaveLength(103);
  });
});

describe('encodePayload', () => {
  it('appends a correct CRC', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC);
    expect(encodePayload(nodes)).toBe(SYNTH_STATIC);
  });

  it('replaces a stale CRC after modification', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC).map((n) =>
      n.tag === '59' ? { tag: '59', value: 'TOKO LAIN' } : n,
    );
    const out = encodePayload(nodes);
    expect(out).toContain('5909TOKO LAIN');
    expect(out.endsWith('E7AD')).toBe(false);
    expect(out.slice(-8, -4)).toBe('6304');
  });
});
