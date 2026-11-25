import { CURRENCIES, lookupTag, type DefinitionSource } from '../core/emv-tags.js';
import { findNode, parseTlv } from '../core/tlv-parser.js';
import type { TlvNode, TlvParseIssue } from '../types/qris.js';
import { validateCrc, type CrcValidationResult } from '../validators/crc-validator.js';
import { analyzeMerchantAccounts, type MerchantAccount } from './merchant-analyzer.js';

export interface AnalyzedField {
  tag: string;
  /** Tag path from the root, e.g. ['62', '07']. */
  path: string[];
  name: string;
  source?: DefinitionSource;
  length: number;
  value: string;
  offset: number;
  interpretation?: string;
  /** True for a template whose value is not nested TLV (kept raw). */
  opaque?: boolean;
  children?: AnalyzedField[];
}

export type InitiationMethod = 'static' | 'dynamic' | 'unspecified' | 'unknown';

export interface PayloadAnalysis {
  payload: string;
  parseIssues: TlvParseIssue[];
  crc: CrcValidationResult;
  fields: AnalyzedField[];
  summary: {
    initiationMethod: InitiationMethod;
    amount?: string;
    currency?: string;
    countryCode?: string;
    merchantCategoryCode?: string;
    merchantName?: string;
    merchantCity?: string;
    postalCode?: string;
  };
  merchantAccounts: MerchantAccount[];
  /** Observations worth a human look. Never conclusions about authorisation. */
  notes: string[];
}

export const STRUCTURAL_DISCLAIMER =
  'Structural analysis only: well-formed TLV and a valid CRC do not show that this ' +
  'payload was issued by, or will be authorised by, any issuer or acquirer.';

export function analyzePayload(payload: string): PayloadAnalysis {
  const { nodes, issues } = parseTlv(payload);
  const value = (...path: string[]) => findNode(nodes, ...path)?.value;

  const poi = value('01');
  const initiationMethod: InitiationMethod =
    poi === undefined
      ? 'unspecified'
      : poi === '11'
        ? 'static'
        : poi === '12'
          ? 'dynamic'
          : 'unknown';

  const summary: PayloadAnalysis['summary'] = { initiationMethod };
  const set = <K extends keyof PayloadAnalysis['summary']>(key: K, v: string | undefined) => {
    if (v !== undefined) (summary as Record<string, unknown>)[key] = v;
  };
  set('amount', value('54'));
  set('currency', value('53'));
  set('countryCode', value('58'));
  set('merchantCategoryCode', value('52'));
  set('merchantName', value('59'));
  set('merchantCity', value('60'));
  set('postalCode', value('61'));

  const fields = nodes.map((n) => analyzeField(n, []));
  return {
    payload,
    parseIssues: issues,
    crc: validateCrc(payload),
    fields,
    summary,
    merchantAccounts: analyzeMerchantAccounts(nodes),
    notes: buildNotes(summary, fields),
  };
}

function analyzeField(node: TlvNode, parentPath: readonly string[]): AnalyzedField {
  const path = [...parentPath, node.tag];
  const def = lookupTag(parentPath, node.tag);
  const field: AnalyzedField = {
    tag: node.tag,
    path,
    name: def?.name ?? 'Unknown',
    length: node.length,
    value: node.value,
    offset: node.offset,
  };
  if (def) field.source = def.source;

  const interpretation = interpret(path, node.value);
  if (interpretation) field.interpretation = interpretation;

  if (node.children) {
    field.children = node.children.map((c) => analyzeField(c, path));
  } else if (def?.template) {
    field.opaque = true;
    field.interpretation ??=
      'Not nested TLV — opaque value whose meaning is defined by the provider; cannot be validated locally';
  }
  return field;
}

function interpret(path: readonly string[], value: string): string | undefined {
  switch (path.join('.')) {
    case '00':
      return value === '01'
        ? 'EMVCo MPM payload format version 01'
        : 'Unexpected version (expected 01)';
    case '01':
      if (value === '11')
        return 'Static — reusable, payer enters the amount unless tag 54 is present';
      if (value === '12') return 'Dynamic — intended for a single transaction';
      return 'Unknown value (expected 11 or 12)';
    case '53':
      return CURRENCIES[value] ?? 'Unrecognised ISO 4217 code';
    case '54':
      return /^\d+(\.\d+)?$/.test(value)
        ? `Amount ${value}`
        : 'Not a plain decimal amount (expected digits with optional "." decimal part)';
    case '55':
      return (
        {
          '01': 'Prompt payer for tip',
          '02': 'Fixed convenience fee (tag 56)',
          '03': 'Percentage convenience fee (tag 57)',
        }[value] ?? 'Unknown indicator'
      );
    case '62.09':
      return [...value]
        .map((c) => ({ A: 'address', M: 'mobile', E: 'email' })[c] ?? `unknown "${c}"`)
        .join(', ');
  }
  if (path.length === 2 && path[0] === '62' && value === '***') {
    return 'Payer is prompted to enter this value';
  }
  return undefined;
}

function buildNotes(summary: PayloadAnalysis['summary'], fields: AnalyzedField[]): string[] {
  const notes: string[] = [];
  if (summary.initiationMethod === 'dynamic' && summary.amount === undefined) {
    notes.push('Point of Initiation is dynamic (12) but no Transaction Amount (54) is present.');
  }
  if (summary.initiationMethod === 'static' && summary.amount !== undefined) {
    notes.push('Point of Initiation is static (11) but a Transaction Amount (54) is present.');
  }
  const additional = fields.find((f) => f.tag === '62');
  for (const child of additional?.children ?? []) {
    if (Number(child.tag) >= 50) {
      notes.push(
        `Tag 62.${child.tag} holds ${child.opaque ? 'an opaque' : 'a'} payment-system-specific value ` +
          `(${child.length} chars). Its meaning is provider-defined and cannot be verified locally.`,
      );
    }
  }
  notes.push(STRUCTURAL_DISCLAIMER);
  return notes;
}
