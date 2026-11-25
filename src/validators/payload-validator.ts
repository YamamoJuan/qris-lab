import { lookupTag } from '../core/emv-tags.js';
import { findNode, parseTlv } from '../core/tlv-parser.js';
import type { TlvNode } from '../types/qris.js';
import { validateCrc } from './crc-validator.js';

export interface ValidationIssue {
  code: string;
  /** Dotted tag path, or '' for payload-level issues. */
  path: string;
  message: string;
}

export interface PayloadValidationResult {
  /** True when there are no errors. Warnings do not affect validity. */
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const MANDATORY_ROOT = ['00', '52', '53', '58', '59', '60', '63'];
const AMOUNT = /^\d+(\.\d+)?$/;

/**
 * Validate a payload against EMVCo MPM structural rules.
 *
 * "valid" means structurally valid. It says nothing about whether any issuer
 * or acquirer issued or will authorise the payment.
 */
export function validatePayload(payload: string): PayloadValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, path: string, message: string) => errors.push({ code, path, message });
  const warn = (code: string, path: string, message: string) =>
    warnings.push({ code, path, message });

  const { nodes, issues } = parseTlv(payload);
  for (const i of issues) {
    (i.severity === 'error' ? err : warn)(i.code, '', `${i.message} (offset ${i.offset})`);
  }
  if (issues.some((i) => i.severity === 'error')) {
    return { valid: false, errors, warnings };
  }

  // Position rules.
  if (nodes[0]?.tag !== '00')
    err('FIRST_TAG', '00', 'Payload Format Indicator (00) must be the first tag');
  if (nodes[nodes.length - 1]?.tag !== '63') err('LAST_TAG', '63', 'CRC (63) must be the last tag');

  // Mandatory tags.
  for (const tag of MANDATORY_ROOT) {
    if (!findNode(nodes, tag)) err('MISSING_TAG', tag, `Mandatory tag ${tag} is missing`);
  }
  if (!nodes.some((n) => Number(n.tag) >= 2 && Number(n.tag) <= 51)) {
    err('MISSING_MERCHANT_ACCOUNT', '', 'At least one merchant account tag (02–51) is required');
  }

  // Duplicate top-level tags.
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.tag)) err('DUPLICATE_TAG', n.tag, `Tag ${n.tag} appears more than once`);
    seen.add(n.tag);
  }

  // Per-field format and length.
  checkFields(nodes, [], err);

  // CRC.
  const crc = validateCrc(payload);
  if (crc.status !== 'valid') err(`CRC_${crc.status.toUpperCase()}`, '63', crc.message);
  for (const w of crc.warnings) warn('CRC_FORMAT', '63', w);

  // Semantic rules.
  const v = (...p: string[]) => findNode(nodes, ...p)?.value;
  if (v('00') !== undefined && v('00') !== '01') {
    err('PAYLOAD_FORMAT', '00', `Payload Format Indicator must be "01", got "${v('00')}"`);
  }

  const poi = v('01');
  if (poi !== undefined && poi !== '11' && poi !== '12') {
    err('POI_VALUE', '01', `Point of Initiation Method must be 11 or 12, got "${poi}"`);
  }

  const amount = v('54');
  if (amount !== undefined) {
    if (!AMOUNT.test(amount)) {
      err('AMOUNT_FORMAT', '54', `Amount "${amount}" is not a plain decimal number`);
    } else if (Number(amount) <= 0) {
      err('AMOUNT_ZERO', '54', 'Amount must be greater than zero');
    }
  }
  if (poi === '12' && amount === undefined) {
    warn('DYNAMIC_WITHOUT_AMOUNT', '01', 'Dynamic (12) payload without Transaction Amount (54)');
  }
  if (poi === '11' && amount !== undefined) {
    warn('STATIC_WITH_AMOUNT', '01', 'Static (11) payload with Transaction Amount (54)');
  }

  const tip = v('55');
  if (tip !== undefined) {
    if (!['01', '02', '03'].includes(tip)) err('TIP_VALUE', '55', `Unknown tip indicator "${tip}"`);
    if (tip === '02' && v('56') === undefined) err('MISSING_TAG', '56', '55=02 requires tag 56');
    if (tip === '03' && v('57') === undefined) err('MISSING_TAG', '57', '55=03 requires tag 57');
  }
  for (const [tag, need] of [
    ['56', '02'],
    ['57', '03'],
  ] as const) {
    if (v(tag) !== undefined && tip !== need) {
      warn('UNUSED_TAG', tag, `Tag ${tag} present but tag 55 is not "${need}"`);
    }
  }

  const country = v('58');
  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) {
    err('COUNTRY_FORMAT', '58', `Country Code must be 2 uppercase letters, got "${country}"`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function checkFields(
  nodes: readonly TlvNode[],
  parent: readonly string[],
  err: (code: string, path: string, message: string) => void,
): void {
  for (const n of nodes) {
    const path = [...parent, n.tag].join('.');
    const def = lookupTag(parent, n.tag);
    if (def?.fixedLength !== undefined && n.length !== def.fixedLength) {
      err('LENGTH', path, `${def.name} must be ${def.fixedLength} characters, got ${n.length}`);
    }
    if (def?.maxLength !== undefined && n.length > def.maxLength) {
      err(
        'LENGTH',
        path,
        `${def.name} must be at most ${def.maxLength} characters, got ${n.length}`,
      );
    }
    if (def?.format === 'N' && !/^\d+$/.test(n.value)) {
      err('FORMAT', path, `${def.name} must be numeric, got "${n.value}"`);
    }
    if (n.children) checkFields(n.children, [...parent, n.tag], err);
  }
}
