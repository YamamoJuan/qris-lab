import { CRC_PREFIX, computePayloadCrc } from './crc16.js';

/**
 * Input for encoding. If `children` is present it takes precedence over
 * `value` and the length is recomputed from the encoded children — so a parsed
 * TlvNode can be edited and re-encoded directly.
 */
export interface TlvInput {
  tag: string;
  value?: string;
  children?: readonly TlvInput[];
}

export class TlvEncodeError extends Error {
  constructor(
    message: string,
    readonly path: readonly string[],
  ) {
    super(path.length ? `${message} (at ${path.join(' > ')})` : message);
    this.name = 'TlvEncodeError';
  }
}

const TWO_DIGITS = /^\d{2}$/;
export const MAX_LENGTH = 99;

/**
 * Encode TLV nodes in the given order.
 *
 * Enforces only the generic EMVCo constraints: two-digit tags and lengths of
 * 01–99 characters. Tag-specific limits (e.g. merchant name ≤ 25) are the job
 * of the payload validator.
 */
export function encodeTlv(nodes: readonly TlvInput[], path: readonly string[] = []): string {
  return nodes.map((node) => encodeNode(node, path)).join('');
}

function encodeNode(node: TlvInput, parentPath: readonly string[]): string {
  const path = [...parentPath, node.tag];
  if (!TWO_DIGITS.test(node.tag)) {
    throw new TlvEncodeError(`Tag must be two digits, got ${JSON.stringify(node.tag)}`, parentPath);
  }

  let value: string;
  if (node.children !== undefined) {
    value = encodeTlv(node.children, path);
  } else if (node.value !== undefined) {
    value = node.value;
  } else {
    throw new TlvEncodeError(`Tag ${node.tag} has neither value nor children`, path);
  }

  const length = Array.from(value).length;
  if (length < 1 || length > MAX_LENGTH) {
    throw new TlvEncodeError(
      `Tag ${node.tag} value length ${length} is outside 01–${MAX_LENGTH}`,
      path,
    );
  }
  return `${node.tag}${String(length).padStart(2, '0')}${value}`;
}

/**
 * Encode a complete payload and append tag 63 with a freshly computed CRC.
 * Any tag 63 in the input is dropped. Does not check EMVCo tag ordering or
 * mandatory tags — see the payload validator.
 */
export function encodePayload(nodes: readonly TlvInput[]): string {
  const body = encodeTlv(nodes.filter((n) => n.tag !== '63')) + CRC_PREFIX;
  return body + computePayloadCrc(body);
}
