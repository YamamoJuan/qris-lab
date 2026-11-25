import { describe, expect, it } from 'vitest';
import { analyzePayload, STRUCTURAL_DISCLAIMER } from '../src/analyzers/payload-analyzer.js';
import { analyzeMerchantAccounts } from '../src/analyzers/merchant-analyzer.js';
import { parseTlvStrict } from '../src/core/tlv-parser.js';
import { encodePayload } from '../src/core/tlv-encoder.js';
import { SYNTH_DYNAMIC, SYNTH_DYNAMIC_OPAQUE_REF, SYNTH_STATIC } from './fixtures.js';

describe('analyzePayload', () => {
  it('summarises a static payload', () => {
    const a = analyzePayload(SYNTH_STATIC);
    expect(a.summary).toEqual({
      initiationMethod: 'static',
      currency: '360',
      countryCode: 'ID',
      merchantCategoryCode: '5814',
      merchantName: 'TOKO CONTOH',
      merchantCity: 'JAKARTA',
      postalCode: '12345',
    });
    expect(a.crc.status).toBe('valid');
    expect(a.parseIssues).toEqual([]);
  });

  it('summarises a dynamic payload with amount', () => {
    const a = analyzePayload(SYNTH_DYNAMIC);
    expect(a.summary.initiationMethod).toBe('dynamic');
    expect(a.summary.amount).toBe('2000');
  });

  it('names and interprets fields, including nested ones', () => {
    const a = analyzePayload(SYNTH_DYNAMIC);
    const byTag = (t: string) => a.fields.find((f) => f.tag === t);
    expect(byTag('01')?.interpretation).toMatch(/^Dynamic/);
    expect(byTag('53')?.interpretation).toBe('IDR (Indonesian Rupiah)');
    expect(byTag('59')?.name).toBe('Merchant Name');
    const add = byTag('62');
    expect(add?.children?.map((c) => [c.path.join('.'), c.name])).toEqual([
      ['62.01', 'Bill Number'],
      ['62.07', 'Terminal Label'],
    ]);
    expect(byTag('51')?.children?.find((c) => c.tag === '02')?.name).toBe(
      'National Merchant ID (NMID)',
    );
  });

  it('marks opaque payment-system-specific values in tag 62', () => {
    const a = analyzePayload(SYNTH_DYNAMIC_OPAQUE_REF);
    const ref = a.fields.find((f) => f.tag === '62')?.children?.find((c) => c.tag === '50');
    expect(ref).toMatchObject({
      name: 'Payment System Specific Template',
      opaque: true,
      value: 'X120990101000000ABCD',
    });
    expect(a.notes.some((n) => n.includes('62.50') && n.includes('opaque'))).toBe(true);
    expect(a.crc.status).toBe('valid');
  });

  it('always carries the structural disclaimer', () => {
    for (const p of [SYNTH_STATIC, SYNTH_DYNAMIC, 'garbage']) {
      expect(analyzePayload(p).notes).toContain(STRUCTURAL_DISCLAIMER);
    }
  });

  it('flags inconsistent initiation method and amount', () => {
    const staticWithAmount = encodePayload(
      parseTlvStrict(SYNTH_STATIC).flatMap((n) =>
        n.tag === '53' ? [n, { tag: '54', value: '1000' }] : [n],
      ),
    );
    expect(analyzePayload(staticWithAmount).notes[0]).toMatch(/static \(11\).*54/);

    const dynamicNoAmount = encodePayload(
      parseTlvStrict(SYNTH_DYNAMIC).filter((n) => n.tag !== '54'),
    );
    expect(analyzePayload(dynamicNoAmount).notes[0]).toMatch(/dynamic \(12\).*no Transaction/);
  });

  it('reports unspecified and unknown initiation methods', () => {
    expect(analyzePayload('0002015802ID').summary.initiationMethod).toBe('unspecified');
    expect(analyzePayload('0002010102995802ID').summary.initiationMethod).toBe('unknown');
  });

  it('still returns partial results for malformed payloads', () => {
    const a = analyzePayload('0002015910ABC');
    expect(a.fields.map((f) => f.tag)).toEqual(['00']);
    expect(a.parseIssues[0]?.code).toBe('TRUNCATED_VALUE');
    expect(a.crc.status).toBe('missing');
  });
});

describe('analyzeMerchantAccounts', () => {
  it('extracts provider and national repository accounts', () => {
    const accounts = analyzeMerchantAccounts(parseTlvStrict(SYNTH_STATIC));
    expect(accounts).toEqual([
      {
        tag: '26',
        kind: 'template',
        gui: 'COM.EXAMPLE.WWW',
        nationalRepository: false,
        pan: '999900000000000001',
        nns: '99990000',
        merchantId: '1234567890',
        criteria: 'UMI',
        criteriaLabel: 'Usaha Mikro',
        otherFields: [],
      },
      {
        tag: '51',
        kind: 'template',
        gui: 'ID.CO.QRIS.WWW',
        guiLabel: 'QRIS national merchant repository',
        guiSource: 'qris-unverified',
        nationalRepository: true,
        nmid: 'ID0000000000001',
        criteria: 'UMI',
        criteriaLabel: 'Usaha Mikro',
        otherFields: [],
      },
    ]);
  });

  it('handles reserved network primitives and raw templates', () => {
    const accounts = analyzeMerchantAccounts(parseTlvStrict('0002010406ABCDEF2605HELLO'));
    expect(accounts[0]).toMatchObject({
      tag: '04',
      kind: 'primitive',
      network: 'Mastercard',
      raw: 'ABCDEF',
    });
    expect(accounts[1]).toMatchObject({ tag: '26', kind: 'template', raw: 'HELLO' });
  });

  it('collects unknown sub-tags', () => {
    const [acc] = analyzeMerchantAccounts(parseTlvStrict('26180006A.B.CD0504XYZW'));
    expect(acc?.otherFields).toEqual([{ tag: '05', value: 'XYZW' }]);
  });
});
