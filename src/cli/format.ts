import type { AnalyzedField, PayloadAnalysis } from '../analyzers/payload-analyzer.js';
import type { PayloadComparison, DiffEntry } from '../analyzers/payload-comparator.js';
import type { GeneratedPayload } from '../generators/payload-generator.js';
import type { TlvParseIssue } from '../types/qris.js';
import type { CrcValidationResult } from '../validators/crc-validator.js';
import type { PayloadValidationResult } from '../validators/payload-validator.js';
import { maybeMask } from './mask.js';

export interface FormatOptions {
  mask: boolean;
}

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

export function formatPayloadLine(payload: string, opts: FormatOptions): string {
  return opts.mask
    ? `Payload: (hidden with --mask, ${Array.from(payload).length} chars)`
    : `Payload: ${payload}`;
}

export function formatTree(
  fields: readonly AnalyzedField[],
  opts: FormatOptions,
  depth = 0,
): string[] {
  const lines: string[] = [];
  for (const f of fields) {
    const indent = '  '.repeat(depth);
    const head = `${indent}${f.tag} [${String(f.length).padStart(2, '0')}] ${f.name}`;
    if (f.children) {
      lines.push(head);
      lines.push(...formatTree(f.children, opts, depth + 1));
      continue;
    }
    const value = maybeMask(f.path, f.value, opts.mask);
    lines.push(`${pad(head, 52)} ${JSON.stringify(value)}`);
    if (f.interpretation) lines.push(`${indent}     ↳ ${f.interpretation}`);
  }
  return lines;
}

export function formatIssues(issues: readonly TlvParseIssue[]): string[] {
  return issues.map((i) => `  ${i.severity.toUpperCase()} ${i.code} @${i.offset}: ${i.message}`);
}

export function formatCrc(crc: CrcValidationResult, label = 'CRC'): string {
  const detail =
    crc.status === 'valid' || crc.status === 'invalid'
      ? ` (payload ${crc.actual}, computed ${crc.expected})`
      : '';
  return `${label}: ${crc.status.toUpperCase()}${detail} — ${crc.message}`;
}

export function formatDecode(analysis: PayloadAnalysis, opts: FormatOptions): string {
  const lines = [
    formatPayloadLine(analysis.payload, opts),
    '',
    ...formatTree(analysis.fields, opts),
    '',
  ];
  if (analysis.parseIssues.length)
    lines.push('Parse issues:', ...formatIssues(analysis.parseIssues), '');
  lines.push(formatCrc(analysis.crc));
  return lines.join('\n');
}

export function formatAnalysis(a: PayloadAnalysis, opts: FormatOptions): string {
  const s = a.summary;
  const lines = [
    formatPayloadLine(a.payload, opts),
    '',
    'Summary',
    `  Initiation method : ${s.initiationMethod}`,
    `  Amount            : ${s.amount ?? '(not set — payer enters amount)'}`,
    `  Currency          : ${s.currency ?? '-'}`,
    `  Country           : ${s.countryCode ?? '-'}`,
    `  MCC               : ${s.merchantCategoryCode ?? '-'}`,
    `  Merchant name     : ${s.merchantName === undefined ? '-' : maybeMask(['59'], s.merchantName, opts.mask)}`,
    `  Merchant city     : ${s.merchantCity === undefined ? '-' : maybeMask(['60'], s.merchantCity, opts.mask)}`,
    '',
    'Merchant accounts',
  ];
  for (const m of a.merchantAccounts) {
    const parts = [`  ${m.tag} (${m.kind}${m.network ? `, ${m.network}` : ''})`];
    if (m.gui) parts.push(`GUI ${m.gui}${m.guiLabel ? ` = ${m.guiLabel} [${m.guiSource}]` : ''}`);
    if (m.pan) parts.push(`PAN ${maybeMask([m.tag, '01'], m.pan, opts.mask)}`);
    if (m.nns) parts.push(`NNS ${m.nns}`);
    if (m.merchantId) parts.push(`MID ${maybeMask([m.tag, '02'], m.merchantId, opts.mask)}`);
    if (m.nmid) parts.push(`NMID ${maybeMask([m.tag, '02'], m.nmid, opts.mask)}`);
    if (m.criteria)
      parts.push(`criteria ${m.criteria}${m.criteriaLabel ? ` (${m.criteriaLabel})` : ''}`);
    if (m.raw !== undefined)
      parts.push(`raw ${JSON.stringify(maybeMask([m.tag, '99'], m.raw, opts.mask))}`);
    lines.push(parts.join(' · '));
  }
  if (!a.merchantAccounts.length) lines.push('  (none)');
  lines.push('', 'Fields', ...formatTree(a.fields, opts), '');
  if (a.parseIssues.length) lines.push('Parse issues:', ...formatIssues(a.parseIssues), '');
  lines.push(formatCrc(a.crc), '', 'Notes', ...a.notes.map((n) => `  - ${n}`));
  return lines.join('\n');
}

export function formatValidation(r: PayloadValidationResult): string {
  const lines = [r.valid ? 'STRUCTURALLY VALID' : 'INVALID'];
  for (const e of r.errors)
    lines.push(`  ERROR   ${e.code}${e.path ? ` [${e.path}]` : ''}: ${e.message}`);
  for (const w of r.warnings)
    lines.push(`  WARNING ${w.code}${w.path ? ` [${w.path}]` : ''}: ${w.message}`);
  lines.push(
    '',
    'Note: structural validity is not proof that any issuer or acquirer issued or will authorise this payload.',
  );
  return lines.join('\n');
}

const STATUS_LABEL: Record<DiffEntry['status'], string> = {
  same: '=',
  changed: '~',
  onlyA: '-',
  onlyB: '+',
};

export function formatComparison(
  c: PayloadComparison,
  opts: FormatOptions & { all: boolean },
): string {
  const lines = [
    'Legend: = same, ~ changed, - only in A, + only in B',
    '',
    `${pad('', 2)}${pad('Tag', 8)}${pad('Name', 36)}${pad('Len A→B', 10)}Values`,
  ];
  for (const e of c.entries) {
    if (!opts.all && e.status === 'same') continue;
    const len = `${e.lengthA ?? '-'}→${e.lengthB ?? '-'}`;
    const show = (v: string | undefined) =>
      v === undefined ? '-' : JSON.stringify(maybeMask(e.path, v, opts.mask));
    const values = e.isTemplate ? '(template)' : `${show(e.valueA)} → ${show(e.valueB)}`;
    lines.push(
      `${STATUS_LABEL[e.status]} ${pad(e.key, 8)}${pad(e.name.slice(0, 34), 36)}${pad(len, 10)}${values}`,
    );
  }
  const k = c.counts;
  lines.push(
    '',
    `Counts: ${k.same} same, ${k.changed} changed, ${k.onlyA} only in A, ${k.onlyB} only in B`,
    `Top-level order of common tags: ${c.sameTopLevelOrder ? 'same' : 'DIFFERENT'}`,
    formatCrc(c.crcA, 'CRC A'),
    formatCrc(c.crcB, 'CRC B'),
  );
  if (c.parseIssuesA.length) lines.push('Parse issues A:', ...formatIssues(c.parseIssuesA));
  if (c.parseIssuesB.length) lines.push('Parse issues B:', ...formatIssues(c.parseIssuesB));
  lines.push(
    '',
    'Differences are structural only and are not interpreted as authorisation mechanisms.',
  );
  return lines.join('\n');
}

export function formatGeneration(g: GeneratedPayload, opts: FormatOptions): string {
  const lines = [g.label, '', 'Changes:'];
  for (const c of g.changes)
    lines.push(`  ${pad(c.path, 4)} ${c.from ?? '(absent)'} → ${c.to ?? '(removed)'}`);
  lines.push('', 'Limitations:', ...g.limitations.map((l) => `  - ${l}`), '');
  lines.push(formatPayloadLine(g.payload, opts));
  return lines.join('\n');
}
