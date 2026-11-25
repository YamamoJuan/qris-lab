import { lookupTag } from '../core/emv-tags.js';
import { parseTlv } from '../core/tlv-parser.js';
import type { TlvNode, TlvParseIssue } from '../types/qris.js';
import { validateCrc, type CrcValidationResult } from '../validators/crc-validator.js';

export type DiffStatus = 'same' | 'changed' | 'onlyA' | 'onlyB';

export interface DiffEntry {
  /** Dotted tag path, e.g. "62.07". Repeated tags get a suffix: "62.07#2". */
  key: string;
  path: string[];
  name: string;
  status: DiffStatus;
  isTemplate: boolean;
  valueA?: string;
  valueB?: string;
  lengthA?: number;
  lengthB?: number;
}

export interface PayloadComparison {
  entries: DiffEntry[];
  counts: Record<DiffStatus, number>;
  crcA: CrcValidationResult;
  crcB: CrcValidationResult;
  parseIssuesA: TlvParseIssue[];
  parseIssuesB: TlvParseIssue[];
  /** True if both payloads list their common top-level tags in the same order. */
  sameTopLevelOrder: boolean;
}

interface FlatNode {
  key: string;
  path: string[];
  node: TlvNode;
}

function flatten(
  nodes: readonly TlvNode[],
  parent: string[] = [],
  out: FlatNode[] = [],
): FlatNode[] {
  const seen = new Map<string, number>();
  for (const node of nodes) {
    const n = (seen.get(node.tag) ?? 0) + 1;
    seen.set(node.tag, n);
    const segment = n === 1 ? node.tag : `${node.tag}#${n}`;
    const path = [...parent, segment];
    out.push({ key: path.join('.'), path, node });
    if (node.children) flatten(node.children, path, out);
  }
  return out;
}

/**
 * Structural diff of two payloads. Reports what differs; deliberately does not
 * interpret why (a difference is not evidence of an authorisation mechanism).
 *
 * Entries are ordered by first appearance in A, then entries only in B.
 */
export function comparePayloads(payloadA: string, payloadB: string): PayloadComparison {
  const a = parseTlv(payloadA);
  const b = parseTlv(payloadB);
  const flatA = flatten(a.nodes);
  const flatB = flatten(b.nodes);
  const mapB = new Map(flatB.map((f) => [f.key, f]));
  const keysA = new Set(flatA.map((f) => f.key));

  const entries: DiffEntry[] = [];
  for (const fa of flatA) {
    const fb = mapB.get(fa.key);
    entries.push(makeEntry(fa, fb));
  }
  for (const fb of flatB) {
    if (!keysA.has(fb.key)) entries.push(makeEntry(undefined, fb));
  }

  const counts: Record<DiffStatus, number> = { same: 0, changed: 0, onlyA: 0, onlyB: 0 };
  for (const e of entries) counts[e.status]++;

  const topB = new Set(b.nodes.map((n) => n.tag));
  const topA = new Set(a.nodes.map((n) => n.tag));
  const commonA = a.nodes.map((n) => n.tag).filter((t) => topB.has(t));
  const commonB = b.nodes.map((n) => n.tag).filter((t) => topA.has(t));

  return {
    entries,
    counts,
    crcA: validateCrc(payloadA),
    crcB: validateCrc(payloadB),
    parseIssuesA: a.issues,
    parseIssuesB: b.issues,
    sameTopLevelOrder: commonA.join() === commonB.join(),
  };
}

function makeEntry(fa: FlatNode | undefined, fb: FlatNode | undefined): DiffEntry {
  const ref = (fa ?? fb) as FlatNode;
  const tags = ref.path.map((s) => s.split('#')[0] as string);
  const tag = tags[tags.length - 1] as string;
  const entry: DiffEntry = {
    key: ref.key,
    path: ref.path,
    name: lookupTag(tags.slice(0, -1), tag)?.name ?? 'Unknown',
    status: !fa ? 'onlyB' : !fb ? 'onlyA' : fa.node.value === fb.node.value ? 'same' : 'changed',
    isTemplate: Boolean(fa?.node.children ?? fb?.node.children),
  };
  if (fa) {
    entry.valueA = fa.node.value;
    entry.lengthA = fa.node.length;
  }
  if (fb) {
    entry.valueB = fb.node.value;
    entry.lengthB = fb.node.length;
  }
  return entry;
}
