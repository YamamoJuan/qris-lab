import {
  KNOWN_GUIS,
  MERCHANT_CRITERIA,
  isMerchantAccountTag,
  reservedNetwork,
  type DefinitionSource,
} from '../core/emv-tags.js';
import { findNode } from '../core/tlv-parser.js';
import type { TlvNode } from '../types/qris.js';

export interface MerchantAccount {
  tag: string;
  /** 'primitive' for reserved network tags 02–25, 'template' for 26–51. */
  kind: 'primitive' | 'template';
  /** Network reserved for tags 02–25 by EMVCo. */
  network?: string;
  /** Raw value (primitive tags, or templates that were not nested TLV). */
  raw?: string;
  gui?: string;
  guiLabel?: string;
  guiSource?: DefinitionSource;
  /** True for the QRIS national repository template (GUI ID.CO.QRIS.WWW). */
  nationalRepository: boolean;
  pan?: string;
  /** First 8 digits of a numeric PAN — the provider's NNS (QRIS, unverified). */
  nns?: string;
  merchantId?: string;
  /** National Merchant ID — sub-tag 02 of the national repository template. */
  nmid?: string;
  criteria?: string;
  criteriaLabel?: string;
  /** Sub-tags not covered above. */
  otherFields: { tag: string; value: string }[];
}

const KNOWN_SUBTAGS = new Set(['00', '01', '02', '03']);

/** Extract and interpret merchant account information (tags 02–51). */
export function analyzeMerchantAccounts(nodes: readonly TlvNode[]): MerchantAccount[] {
  return nodes.filter((n) => isMerchantAccountTag(n.tag)).map(analyzeOne);
}

function analyzeOne(node: TlvNode): MerchantAccount {
  const network = reservedNetwork(node.tag);
  if (network) {
    return {
      tag: node.tag,
      kind: 'primitive',
      network,
      raw: node.value,
      nationalRepository: false,
      otherFields: [],
    };
  }

  const account: MerchantAccount = {
    tag: node.tag,
    kind: 'template',
    nationalRepository: false,
    otherFields: [],
  };
  if (!node.children) {
    account.raw = node.value;
    return account;
  }

  const sub = (tag: string) => findNode(node.children ?? [], tag)?.value;
  const gui = sub('00');
  if (gui !== undefined) {
    account.gui = gui;
    const known = KNOWN_GUIS[gui.toUpperCase()];
    if (known) {
      account.guiLabel = known.label;
      account.guiSource = known.source;
    }
    account.nationalRepository = gui.toUpperCase() === 'ID.CO.QRIS.WWW';
  }

  const pan = sub('01');
  if (pan !== undefined) {
    account.pan = pan;
    if (/^\d{8,}$/.test(pan)) account.nns = pan.slice(0, 8);
  }

  const id = sub('02');
  if (id !== undefined) {
    if (account.nationalRepository) account.nmid = id;
    else account.merchantId = id;
  }

  const criteria = sub('03');
  if (criteria !== undefined) {
    account.criteria = criteria;
    const label = MERCHANT_CRITERIA[criteria.toUpperCase()];
    if (label) account.criteriaLabel = label;
  }

  account.otherFields = node.children
    .filter((c) => !KNOWN_SUBTAGS.has(c.tag))
    .map((c) => ({ tag: c.tag, value: c.value }));
  return account;
}
