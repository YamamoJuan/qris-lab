/**
 * CRC-16/CCITT-FALSE as required by EMVCo MPM tag 63.
 *
 * poly 0x1021, init 0xFFFF, refin false, refout false, xorout 0x0000.
 * Check value: crc16("123456789") === 0x29B1.
 */

const POLY = 0x1021;
const INIT = 0xffff;

const TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ POLY) & 0xffff : (crc << 1) & 0xffff;
    }
    table[i] = crc;
  }
  return table;
})();

const encoder = new TextEncoder();

/** Compute CRC-16/CCITT-FALSE. Strings are hashed as their UTF-8 bytes. */
export function crc16(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let crc = INIT;
  for (const byte of bytes) {
    crc = ((crc << 8) & 0xffff) ^ (TABLE[((crc >> 8) ^ byte) & 0xff] as number);
  }
  return crc;
}

/** Format a CRC as the 4-character uppercase hex string used in tag 63. */
export function formatCrc(crc: number): string {
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** The tag + length prefix that precedes the CRC value ("63" + "04"). */
export const CRC_PREFIX = '6304';

/**
 * Compute the tag-63 value for a payload.
 *
 * `payloadWithoutCrcValue` must end with "6304" — the CRC covers the tag and
 * length of tag 63, but not its 4-character value.
 */
export function computePayloadCrc(payloadWithoutCrcValue: string): string {
  if (!payloadWithoutCrcValue.endsWith(CRC_PREFIX)) {
    throw new Error(`CRC input must end with "${CRC_PREFIX}" (tag 63 + length 04)`);
  }
  return formatCrc(crc16(payloadWithoutCrcValue));
}
