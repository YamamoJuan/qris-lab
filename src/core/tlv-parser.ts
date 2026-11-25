import type { TlvNode, TlvParseIssue, TlvParseResult } from '../types/qris.js';

/**
 * Decides whether a tag's value should be parsed as nested TLV.
 * `path` is the list of ancestor tags ([] at the root level).
 */
export type TemplatePredicate = (tag: string, path: readonly string[]) => boolean;

/**
 * Default EMVCo MPM template rules:
 * - root: 26–51 (merchant account info), 62 (additional data), 64–99 (language,
 *   RFU and unreserved templates);
 * - inside 62: 50–99 (payment-system specific templates).
 */
export const defaultIsTemplate: TemplatePredicate = (tag, path) => {
  const id = Number(tag);
  if (path.length === 0) {
    return (id >= 26 && id <= 51) || id === 62 || id >= 64;
  }
  if (path.length === 1 && path[0] === '62') {
    return id >= 50;
  }
  return false;
};

export interface ParseOptions {
  /** Parse template values as nested TLV. Default: true. */
  nested?: boolean;
  /** Override which tags are treated as templates. */
  isTemplate?: TemplatePredicate;
}

const TWO_DIGITS = /^\d{2}$/;

/**
 * Parse an EMVCo TLV string.
 *
 * Tolerant: returns every node read before the first fatal error, plus a list
 * of issues with absolute character offsets. Lengths and offsets are counted
 * in Unicode code points (EMVCo defines length in characters).
 *
 * Template values are parsed as nested TLV only if the whole value parses
 * without errors; otherwise the raw value is kept and a TEMPLATE_NOT_TLV
 * warning is reported.
 */
export function parseTlv(input: string, options: ParseOptions = {}): TlvParseResult {
  const chars = Array.from(input);
  const issues: TlvParseIssue[] = [];

  if (chars.length === 0) {
    issues.push({ severity: 'error', code: 'EMPTY', message: 'Payload is empty', offset: 0 });
    return { nodes: [], issues };
  }

  if (chars.some((c) => c.charCodeAt(0) > 0x7f)) {
    issues.push({
      severity: 'warning',
      code: 'NON_ASCII',
      message:
        'Payload contains non-ASCII characters; lengths are counted in characters ' +
        'but the CRC is computed over UTF-8 bytes',
      offset: chars.findIndex((c) => c.charCodeAt(0) > 0x7f),
    });
  }

  const nodes = parseLevel(
    chars,
    0,
    [],
    {
      nested: options.nested ?? true,
      isTemplate: options.isTemplate ?? defaultIsTemplate,
    },
    issues,
  );
  return { nodes, issues };
}

function parseLevel(
  chars: readonly string[],
  baseOffset: number,
  path: readonly string[],
  opts: Required<ParseOptions>,
  issues: TlvParseIssue[],
): TlvNode[] {
  const nodes: TlvNode[] = [];
  const seen = new Set<string>();
  const where = path.length ? ` (inside template ${path.join(' > ')})` : '';
  let pos = 0;

  while (pos < chars.length) {
    const offset = baseOffset + pos;
    const remaining = chars.length - pos;

    if (remaining < 4) {
      issues.push({
        severity: 'error',
        code: 'TRUNCATED_HEADER',
        message: `Expected a 4-character tag+length header but only ${remaining} character(s) remain${where}`,
        offset,
      });
      break;
    }

    const tag = chars.slice(pos, pos + 2).join('');
    if (!TWO_DIGITS.test(tag)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_TAG',
        message: `Tag ID must be two digits, got ${JSON.stringify(tag)}${where}`,
        offset,
      });
      break;
    }

    const lengthStr = chars.slice(pos + 2, pos + 4).join('');
    if (!TWO_DIGITS.test(lengthStr)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_LENGTH',
        message: `Length of tag ${tag} must be two digits, got ${JSON.stringify(lengthStr)}${where}`,
        offset: offset + 2,
      });
      break;
    }

    const length = Number(lengthStr);
    const valueStart = pos + 4;
    if (valueStart + length > chars.length) {
      issues.push({
        severity: 'error',
        code: 'TRUNCATED_VALUE',
        message:
          `Tag ${tag} declares length ${length} but only ${chars.length - valueStart} ` +
          `character(s) remain${where}`,
        offset,
      });
      break;
    }

    if (length === 0) {
      issues.push({
        severity: 'error',
        code: 'ZERO_LENGTH',
        message: `Tag ${tag} has length 00; EMVCo lengths must be 01–99${where}`,
        offset: offset + 2,
      });
    }

    if (seen.has(tag)) {
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_TAG',
        message: `Tag ${tag} appears more than once${where}`,
        offset,
      });
    }
    seen.add(tag);

    const valueChars = chars.slice(valueStart, valueStart + length);
    const node: TlvNode = { tag, length, value: valueChars.join(''), offset };

    if (opts.nested && length > 0 && opts.isTemplate(tag, path)) {
      const childIssues: TlvParseIssue[] = [];
      const children = parseLevel(
        valueChars,
        baseOffset + valueStart,
        [...path, tag],
        opts,
        childIssues,
      );
      const firstError = childIssues.find((i) => i.severity === 'error');
      if (firstError) {
        issues.push({
          severity: 'warning',
          code: 'TEMPLATE_NOT_TLV',
          message: `Value of template tag ${tag} is not valid nested TLV; kept as raw value (${firstError.message})`,
          offset: firstError.offset,
        });
      } else {
        node.children = children;
        issues.push(...childIssues);
      }
    }

    nodes.push(node);
    pos = valueStart + length;
  }

  return nodes;
}

export class TlvParseError extends Error {
  constructor(readonly issues: TlvParseIssue[]) {
    const first = issues.find((i) => i.severity === 'error') ?? issues[0];
    super(first ? `${first.code} at offset ${first.offset}: ${first.message}` : 'TLV parse error');
    this.name = 'TlvParseError';
  }
}

/** Parse and throw TlvParseError if any error-severity issue is found. */
export function parseTlvStrict(input: string, options: ParseOptions = {}): TlvNode[] {
  const result = parseTlv(input, options);
  if (result.issues.some((i) => i.severity === 'error')) {
    throw new TlvParseError(result.issues);
  }
  return result.nodes;
}

/** Find a node by tag path, e.g. findNode(nodes, '62', '07'). */
export function findNode(nodes: readonly TlvNode[], ...path: string[]): TlvNode | undefined {
  let level: readonly TlvNode[] | undefined = nodes;
  let found: TlvNode | undefined;
  for (const tag of path) {
    found = level?.find((n) => n.tag === tag);
    if (!found) return undefined;
    level = found.children;
  }
  return found;
}
