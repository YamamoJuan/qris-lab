import { CRC_PREFIX, crc16, formatCrc } from '../core/crc16.js';

export type CrcStatus = 'valid' | 'invalid' | 'missing' | 'malformed';

export interface CrcValidationResult {
  status: CrcStatus;
  /** CRC value found in the payload (as written). */
  actual?: string;
  /** CRC computed over the payload up to and including "6304". */
  expected?: string;
  /** Character offset of the "6304" tag. */
  offset?: number;
  message: string;
  warnings: string[];
}

export interface ExtractedCrc {
  /** Everything the CRC covers: payload up to and including "6304". */
  covered: string;
  /** The 4-character CRC value. */
  value: string;
  offset: number;
}

/**
 * Locate tag 63 by position: EMVCo requires it to be the last data object, so
 * the payload must end with "6304" + 4 characters.
 */
export function extractCrc(payload: string): ExtractedCrc | undefined {
  const chars = Array.from(payload);
  const offset = chars.length - 8;
  if (offset < 0 || chars.slice(offset, offset + 4).join('') !== CRC_PREFIX) {
    return undefined;
  }
  return {
    covered: chars.slice(0, offset + 4).join(''),
    value: chars.slice(offset + 4).join(''),
    offset,
  };
}

/**
 * Validate the tag-63 CRC.
 *
 * A valid CRC only means the payload was not corrupted in transit. Anyone can
 * recompute it; it is NOT evidence that the payload is authentic or authorised.
 */
export function validateCrc(payload: string): CrcValidationResult {
  const warnings: string[] = [];
  const extracted = extractCrc(payload);

  if (!extracted) {
    const idx = payload.lastIndexOf(CRC_PREFIX);
    return {
      status: 'missing',
      message:
        idx >= 0
          ? `"${CRC_PREFIX}" found at offset ${idx} but not as the final data object`
          : `Payload does not end with tag 63 ("${CRC_PREFIX}" + 4 hex characters)`,
      warnings,
    };
  }

  const { covered, value, offset } = extracted;
  const expected = formatCrc(crc16(covered));

  if (!/^[0-9A-Fa-f]{4}$/.test(value)) {
    return {
      status: 'malformed',
      actual: value,
      expected,
      offset,
      message: `CRC value ${JSON.stringify(value)} is not 4 hexadecimal characters`,
      warnings,
    };
  }

  if (value !== value.toUpperCase()) {
    warnings.push('CRC uses lowercase hex; EMVCo specifies uppercase');
  }

  const ok = value.toUpperCase() === expected;
  return {
    status: ok ? 'valid' : 'invalid',
    actual: value,
    expected,
    offset,
    message: ok
      ? 'CRC matches (integrity only — not proof of authenticity)'
      : `CRC mismatch: payload has ${value}, computed ${expected}`,
    warnings,
  };
}

/** Replace (or append) tag 63 with a freshly computed CRC. */
export function recalculateCrc(payload: string): string {
  const extracted = extractCrc(payload);
  const covered = extracted ? extracted.covered : payload + CRC_PREFIX;
  return covered + formatCrc(crc16(covered));
}
