/**
 * EMVCo MPM data object dictionary.
 *
 * Source: EMV QR Code Specification for Payment Systems — Merchant-Presented
 * Mode v1.1 (see docs/EMVCO_REFERENCE.md). QRIS-specific entries are marked
 * `source: 'qris-unverified'` until checked against the ASPI QRIS standard.
 */

export type ValueFormat = 'N' | 'ans' | 'S';
export type Presence = 'M' | 'O' | 'C';
export type DefinitionSource = 'emvco' | 'qris-unverified' | 'observed';

export interface TagDefinition {
  name: string;
  format?: ValueFormat;
  presence?: Presence;
  /** Exact length, if fixed. */
  fixedLength?: number;
  /** Maximum length, if variable. */
  maxLength?: number;
  template?: boolean;
  source: DefinitionSource;
  description?: string;
}

const NETWORK_RANGES: readonly [number, number, string][] = [
  [2, 3, 'Visa'],
  [4, 5, 'Mastercard'],
  [6, 8, 'EMVCo'],
  [9, 10, 'Discover'],
  [11, 12, 'Amex'],
  [13, 14, 'JCB'],
  [15, 16, 'UnionPay'],
  [17, 25, 'EMVCo (RFU)'],
];

/** Payment network reserved for primitive merchant account tags 02–25. */
export function reservedNetwork(tag: string): string | undefined {
  const id = Number(tag);
  return NETWORK_RANGES.find(([lo, hi]) => id >= lo && id <= hi)?.[2];
}

export function isMerchantAccountTag(tag: string): boolean {
  const id = Number(tag);
  return id >= 2 && id <= 51;
}

const ROOT: Record<string, TagDefinition> = {
  '00': {
    name: 'Payload Format Indicator',
    format: 'N',
    presence: 'M',
    fixedLength: 2,
    source: 'emvco',
  },
  '01': {
    name: 'Point of Initiation Method',
    format: 'N',
    presence: 'O',
    fixedLength: 2,
    source: 'emvco',
    description: '11 = static (reusable), 12 = dynamic (single transaction)',
  },
  '52': {
    name: 'Merchant Category Code',
    format: 'N',
    presence: 'M',
    fixedLength: 4,
    source: 'emvco',
  },
  '53': {
    name: 'Transaction Currency',
    format: 'N',
    presence: 'M',
    fixedLength: 3,
    source: 'emvco',
    description: 'ISO 4217 numeric',
  },
  '54': {
    name: 'Transaction Amount',
    format: 'ans',
    presence: 'C',
    maxLength: 13,
    source: 'emvco',
    description: 'Absent: the payer enters the amount',
  },
  '55': {
    name: 'Tip or Convenience Indicator',
    format: 'N',
    presence: 'O',
    fixedLength: 2,
    source: 'emvco',
  },
  '56': {
    name: 'Value of Convenience Fee Fixed',
    format: 'ans',
    presence: 'C',
    maxLength: 13,
    source: 'emvco',
  },
  '57': {
    name: 'Value of Convenience Fee Percentage',
    format: 'ans',
    presence: 'C',
    maxLength: 5,
    source: 'emvco',
  },
  '58': { name: 'Country Code', format: 'ans', presence: 'M', fixedLength: 2, source: 'emvco' },
  '59': { name: 'Merchant Name', format: 'ans', presence: 'M', maxLength: 25, source: 'emvco' },
  '60': { name: 'Merchant City', format: 'ans', presence: 'M', maxLength: 15, source: 'emvco' },
  '61': { name: 'Postal Code', format: 'ans', presence: 'O', maxLength: 10, source: 'emvco' },
  '62': {
    name: 'Additional Data Field Template',
    format: 'S',
    presence: 'O',
    maxLength: 99,
    template: true,
    source: 'emvco',
  },
  '63': { name: 'CRC', format: 'ans', presence: 'M', fixedLength: 4, source: 'emvco' },
  '64': {
    name: 'Merchant Information — Language Template',
    format: 'S',
    presence: 'O',
    maxLength: 99,
    template: true,
    source: 'emvco',
  },
};

const ADDITIONAL_DATA: Record<string, TagDefinition> = {
  '01': { name: 'Bill Number', format: 'ans', maxLength: 25, source: 'emvco' },
  '02': { name: 'Mobile Number', format: 'ans', maxLength: 25, source: 'emvco' },
  '03': { name: 'Store Label', format: 'ans', maxLength: 25, source: 'emvco' },
  '04': { name: 'Loyalty Number', format: 'ans', maxLength: 25, source: 'emvco' },
  '05': { name: 'Reference Label', format: 'ans', maxLength: 25, source: 'emvco' },
  '06': { name: 'Customer Label', format: 'ans', maxLength: 25, source: 'emvco' },
  '07': { name: 'Terminal Label', format: 'ans', maxLength: 25, source: 'emvco' },
  '08': { name: 'Purpose of Transaction', format: 'ans', maxLength: 25, source: 'emvco' },
  '09': {
    name: 'Additional Consumer Data Request',
    format: 'ans',
    maxLength: 3,
    source: 'emvco',
    description: 'A = address, M = mobile, E = email',
  },
};

const LANGUAGE: Record<string, TagDefinition> = {
  '00': { name: 'Language Preference', format: 'ans', fixedLength: 2, source: 'emvco' },
  '01': { name: 'Merchant Name — Alternate Language', format: 'S', maxLength: 25, source: 'emvco' },
  '02': { name: 'Merchant City — Alternate Language', format: 'S', maxLength: 15, source: 'emvco' },
};

/** Sub-tags of domestic merchant account templates (26–45) and tag 51. */
const MERCHANT_ACCOUNT: Record<string, TagDefinition> = {
  '00': {
    name: 'Globally Unique Identifier',
    format: 'ans',
    maxLength: 32,
    source: 'emvco',
    description: 'Reverse domain name or AID identifying the account owner',
  },
  '01': {
    name: 'Merchant PAN',
    format: 'N',
    maxLength: 19,
    source: 'qris-unverified',
    description: 'Starts with the 8-digit NNS of the payment provider',
  },
  '02': { name: 'Merchant ID', format: 'ans', maxLength: 15, source: 'qris-unverified' },
  '03': {
    name: 'Merchant Criteria',
    format: 'ans',
    fixedLength: 3,
    source: 'qris-unverified',
  },
};

/** Look up the definition for a tag at a given path (ancestor tags). */
export function lookupTag(path: readonly string[], tag: string): TagDefinition | undefined {
  const id = Number(tag);
  if (path.length === 0) {
    if (ROOT[tag]) return ROOT[tag];
    const network = reservedNetwork(tag);
    if (network) return { name: `Merchant Account Information (${network})`, source: 'emvco' };
    if (id >= 26 && id <= 51) {
      return {
        name: 'Merchant Account Information Template',
        format: 'ans',
        presence: 'M',
        maxLength: 99,
        template: true,
        source: 'emvco',
      };
    }
    if (id >= 65 && id <= 79) return { name: 'RFU for EMVCo (template)', source: 'emvco' };
    if (id >= 80) return { name: 'Unreserved Template', template: true, source: 'emvco' };
    return undefined;
  }

  const parent = path[path.length - 1] as string;
  const parentId = Number(parent);
  if (path.length === 1 && parent === '62') {
    if (ADDITIONAL_DATA[tag]) return ADDITIONAL_DATA[tag];
    if (id >= 10 && id <= 49) return { name: 'RFU for EMVCo', source: 'emvco' };
    if (id >= 50) {
      return { name: 'Payment System Specific Template', template: true, source: 'emvco' };
    }
  }
  if (path.length === 1 && parent === '64') return LANGUAGE[tag];
  if (path.length === 1 && parentId >= 26 && parentId <= 51) {
    if (parent === '51' && tag === '02') {
      return { ...MERCHANT_ACCOUNT['02'], name: 'National Merchant ID (NMID)' } as TagDefinition;
    }
    if (MERCHANT_ACCOUNT[tag]) return MERCHANT_ACCOUNT[tag];
    return { name: 'Payment network specific', source: 'emvco' };
  }
  return undefined;
}

/** ISO 4217 numeric codes likely to appear in QRIS research. */
export const CURRENCIES: Record<string, string> = {
  '360': 'IDR (Indonesian Rupiah)',
  '458': 'MYR (Malaysian Ringgit)',
  '702': 'SGD (Singapore Dollar)',
  '764': 'THB (Thai Baht)',
  '840': 'USD (US Dollar)',
};

/** QRIS merchant criteria codes. Source: QRIS public material; unverified. */
export const MERCHANT_CRITERIA: Record<string, string> = {
  UMI: 'Usaha Mikro',
  UKE: 'Usaha Kecil',
  UME: 'Usaha Menengah',
  UBE: 'Usaha Besar',
  URE: 'Regular (lihat Standar QRIS)',
};

/**
 * Globally Unique Identifiers seen in the wild. These are not merchant data —
 * they identify the provider. `observed` = seen in samples, not documented.
 */
export const KNOWN_GUIS: Record<string, { label: string; source: DefinitionSource }> = {
  'ID.CO.QRIS.WWW': { label: 'QRIS national merchant repository', source: 'qris-unverified' },
  'COM.GO-JEK.WWW': { label: 'GoPay (Gojek)', source: 'observed' },
};
