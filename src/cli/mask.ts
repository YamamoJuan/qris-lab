/**
 * Masking for output that may be shared (docs, issues, chat).
 * Masks values that identify a merchant or a transaction; keeps structural
 * values (tags, lengths, GUIs, MCC, currency, country, POI, amount).
 */

const KEEP_PREFIX = 4;

export function maskValue(value: string, keep = KEEP_PREFIX): string {
  const chars = Array.from(value);
  if (chars.length <= keep) return 'X'.repeat(chars.length);
  return chars.slice(0, keep).join('') + 'X'.repeat(chars.length - keep);
}

/** Whether the value at this dotted/array tag path identifies a merchant or transaction. */
export function isSensitivePath(path: readonly string[]): boolean {
  const [top, sub] = path.map((p) => Number(p.split('#')[0]));
  if (top === undefined || Number.isNaN(top)) return false;
  if (path.length === 1) {
    // Primitive network accounts 02–25, name, city, postal code.
    return (top >= 2 && top <= 25) || top === 59 || top === 60 || top === 61;
  }
  if (sub === undefined) return false;
  if (top >= 26 && top <= 51) return sub !== 0 && sub !== 3; // keep GUI and criteria
  if (top === 62) return sub !== 7 && sub !== 9; // keep terminal label and consumer-data request
  if (top === 64) return sub === 1 || sub === 2;
  return path.length > 2;
}

export function maybeMask(path: readonly string[], value: string, mask: boolean): string {
  return mask && isSensitivePath(path) ? maskValue(value) : value;
}
