/** A single EMVCo TLV data object. */
export interface TlvNode {
  /** Two-digit tag ID, "00".."99". */
  tag: string;
  /** Length as written in the payload (characters). */
  length: number;
  /** Raw value string. */
  value: string;
  /** Absolute offset of the tag's first character within the root payload. */
  offset: number;
  /** Present only when the value was successfully parsed as nested TLV. */
  children?: TlvNode[];
}

export type IssueSeverity = 'error' | 'warning';

export interface TlvParseIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Absolute offset within the root payload. */
  offset: number;
}

export interface TlvParseResult {
  nodes: TlvNode[];
  issues: TlvParseIssue[];
}
