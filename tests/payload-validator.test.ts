import { describe, expect, it } from 'vitest';
import { encodePayload } from '../src/core/tlv-encoder.js';
import { parseTlvStrict } from '../src/core/tlv-parser.js';
import { validatePayload } from '../src/validators/payload-validator.js';
import {
  SYNTH_DYNAMIC,
  SYNTH_DYNAMIC_OPAQUE_REF,
  SYNTH_NO_POI_NO_ACCOUNT,
  SYNTH_STATIC,
} from './fixtures.js';

/** Re-encode SYNTH_STATIC with one top-level tag replaced / added / removed. */
function withTag(tag: string, value: string | null, base = SYNTH_STATIC): string {
  const nodes = parseTlvStrict(base).filter((n) => n.tag !== tag);
  if (value !== null) {
    const idx = nodes.findIndex((n) => Number(n.tag) > Number(tag));
    nodes.splice(idx < 0 ? nodes.length : idx, 0, { tag, value, length: 0, offset: 0 });
  }
  return encodePayload(nodes);
}
const codes = (p: string) => validatePayload(p).errors.map((e) => e.code);
const warnCodes = (p: string) => validatePayload(p).warnings.map((e) => e.code);

describe('validatePayload', () => {
  it.each([SYNTH_STATIC, SYNTH_DYNAMIC])('accepts valid payload %#', (p) => {
    expect(validatePayload(p)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('accepts an opaque provider value in 62.50 with a warning only', () => {
    const r = validatePayload(SYNTH_DYNAMIC_OPAQUE_REF);
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['TEMPLATE_NOT_TLV']);
  });

  it('reports parse errors and stops', () => {
    const r = validatePayload('0002015910ABC');
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['TRUNCATED_VALUE']);
  });

  it('requires a merchant account tag', () => {
    expect(codes(SYNTH_NO_POI_NO_ACCOUNT)).toEqual(['MISSING_MERCHANT_ACCOUNT']);
  });

  it('requires mandatory tags', () => {
    expect(codes(withTag('59', null))).toEqual(['MISSING_TAG']);
    expect(validatePayload(withTag('59', null)).errors[0]?.path).toBe('59');
  });

  it('requires 00 first and 63 last', () => {
    const swapped = encodePayload([
      { tag: '01', value: '11' },
      ...parseTlvStrict(SYNTH_STATIC).filter((n) => n.tag !== '01'),
    ]);
    expect(codes(swapped)).toContain('FIRST_TAG');
    expect(codes('0002016304ABCD5802ID')).toContain('LAST_TAG');
  });

  it('enforces per-tag length limits, including nested tags', () => {
    expect(codes(withTag('59', 'X'.repeat(26)))).toEqual(['LENGTH']);
    expect(codes(withTag('53', '36'))).toEqual(['LENGTH']);
    const longTerminal = encodePayload(
      parseTlvStrict(SYNTH_STATIC).map((n) =>
        n.tag === '62' ? { tag: '62', children: [{ tag: '07', value: 'T'.repeat(26) }] } : n,
      ),
    );
    expect(validatePayload(longTerminal).errors[0]).toMatchObject({
      code: 'LENGTH',
      path: '62.07',
    });
  });

  it('enforces numeric formats', () => {
    expect(codes(withTag('52', '58A4'))).toEqual(['FORMAT']);
  });

  it('detects CRC problems', () => {
    expect(codes(SYNTH_STATIC.slice(0, -4) + '0000')).toEqual(['CRC_INVALID']);
  });

  it('validates the point of initiation method', () => {
    expect(codes(withTag('01', '13'))).toEqual(['POI_VALUE']);
  });

  it('validates amounts', () => {
    expect(codes(withTag('54', '1,000'))).toEqual(['AMOUNT_FORMAT']);
    expect(codes(withTag('54', '0'))).toEqual(['AMOUNT_ZERO']);
    expect(codes(withTag('54', '1000.50', withTag('01', '12')))).toEqual([]);
  });

  it('warns on POI / amount inconsistencies without failing', () => {
    const staticWithAmount = withTag('54', '1000');
    expect(validatePayload(staticWithAmount).valid).toBe(true);
    expect(warnCodes(staticWithAmount)).toEqual(['STATIC_WITH_AMOUNT']);
    expect(warnCodes(withTag('01', '12'))).toEqual(['DYNAMIC_WITHOUT_AMOUNT']);
  });

  it('checks tip / convenience fee rules', () => {
    expect(codes(withTag('55', '02'))).toEqual(['MISSING_TAG']);
    expect(codes(withTag('56', '500', withTag('55', '02')))).toEqual([]);
    expect(codes(withTag('55', '09'))).toEqual(['TIP_VALUE']);
    expect(warnCodes(withTag('57', '5'))).toEqual(['UNUSED_TAG']);
  });

  it('validates country code format', () => {
    expect(codes(withTag('58', 'id'))).toEqual(['COUNTRY_FORMAT']);
  });

  it('rejects duplicate top-level tags', () => {
    const dup = encodePayload([
      ...parseTlvStrict(SYNTH_STATIC).slice(0, -1),
      { tag: '61', value: '1' },
    ]);
    expect(codes(dup)).toContain('DUPLICATE_TAG');
  });
});
