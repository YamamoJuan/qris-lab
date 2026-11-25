import { encodePayload, type TlvInput } from '../core/tlv-encoder.js';
import { parseTlvStrict } from '../core/tlv-parser.js';
import type { TlvNode } from '../types/qris.js';
import { validatePayload, type PayloadValidationResult } from '../validators/payload-validator.js';

/** Label attached to every payload produced by local modification. */
export const LOCAL_MODIFICATION_LABEL =
  'LOCALLY MODIFIED TEST PAYLOAD — not issued by GoPay or any payment provider';

export interface FieldChange {
  path: string;
  from?: string;
  to?: string;
}

export interface GeneratedPayload {
  payload: string;
  label: typeof LOCAL_MODIFICATION_LABEL;
  changes: FieldChange[];
  validation: PayloadValidationResult;
  /** Things this local transformation cannot reproduce. */
  limitations: string[];
}

export class PayloadGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadGenerationError';
  }
}

/** Plain decimal, ≤ 13 chars, > 0, at most 2 decimal places. */
const AMOUNT = /^(?:\d{1,13}|\d{1,10}\.\d{1,2})$/;

export interface ToDynamicOptions {
  /** Transaction amount as a plain decimal string, e.g. "15000". */
  amount: string;
}

/**
 * Research transformation: derive a payload with Point of Initiation 12 and a
 * Transaction Amount from a static payload.
 *
 * Only tags 01, 54 and 63 are touched; merchant identity is never altered.
 * The result is a *pre-filled-amount* payload, NOT a provider-issued dynamic
 * QRIS: it has no provider transaction reference (e.g. GoPay's 62.50), so it
 * carries no expiry, single-use, cancellation or per-bill reconciliation.
 *
 * Refuses payloads that already carry a provider reference (62.50–99): a
 * provider-issued dynamic QR is a live payment request and must not be altered.
 */
export function staticToDynamic(source: string, options: ToDynamicOptions): GeneratedPayload {
  const { amount } = options;
  if (!AMOUNT.test(amount) || Number(amount) <= 0) {
    throw new PayloadGenerationError(
      `Invalid amount "${amount}": use a positive plain decimal (e.g. 15000 or 15000.50), max 13 characters`,
    );
  }

  const sourceCheck = validatePayload(source);
  if (!sourceCheck.valid) {
    const first = sourceCheck.errors[0];
    throw new PayloadGenerationError(
      `Source payload is not structurally valid: ${first?.code} ${first?.message}`,
    );
  }

  const nodes = parseTlvStrict(source);
  const additional = nodes.find((n) => n.tag === '62');
  const providerRef = additional?.children?.find((c) => Number(c.tag) >= 50);
  if (providerRef) {
    throw new PayloadGenerationError(
      `Source contains a payment-system-specific value at 62.${providerRef.tag}, which indicates ` +
        'a provider-issued payload. Modifying an issued dynamic QR is not supported.',
    );
  }

  const changes: FieldChange[] = [];
  const out: TlvInput[] = [];
  const poi = nodes.find((n) => n.tag === '01');
  const oldAmount = nodes.find((n) => n.tag === '54');
  let amountInserted = false;

  for (const node of nodes) {
    if (node.tag === '01') {
      out.push({ tag: '01', value: '12' });
      continue;
    }
    if (node.tag === '54') continue; // re-inserted below at its ordered position
    if (!amountInserted && Number(node.tag) > 54) {
      out.push({ tag: '54', value: amount });
      amountInserted = true;
    }
    out.push(toInput(node));
    if (node.tag === '00' && !poi) out.push({ tag: '01', value: '12' });
  }

  if (poi?.value !== '12') changes.push(change('01', poi?.value, '12'));
  if (oldAmount?.value !== amount) changes.push(change('54', oldAmount?.value, amount));

  const payload = encodePayload(out);
  const oldCrc = nodes.find((n) => n.tag === '63')?.value;
  const newCrc = payload.slice(-4);
  if (oldCrc !== newCrc) changes.push(change('63', oldCrc, newCrc));

  return {
    payload,
    label: LOCAL_MODIFICATION_LABEL,
    changes,
    validation: validatePayload(payload),
    limitations: [
      'No provider transaction reference (e.g. 62.50 in GoPay dynamic QRIS): the provider cannot link a payment to a specific bill.',
      'No server-side expiry, single-use enforcement or cancellation.',
      'Whether payer apps and the acquirer accept this payload cannot be determined from its structure.',
    ],
  };
}

function toInput(node: TlvNode): TlvInput {
  return node.children ? { tag: node.tag, children: node.children.map(toInput) } : node;
}

function change(path: string, from: string | undefined, to: string | undefined): FieldChange {
  const c: FieldChange = { path };
  if (from !== undefined) c.from = from;
  if (to !== undefined) c.to = to;
  return c;
}
