import { describe, expect, it } from 'vitest';
import { findNode, parseTlv, parseTlvStrict, TlvParseError } from '../src/core/tlv-parser.js';
import { SYNTH_DYNAMIC, SYNTH_NON_ASCII, SYNTH_STATIC } from './fixtures.js';

const codes = (input: string) => parseTlv(input).issues.map((i) => i.code);

describe('parseTlv — valid payloads', () => {
  it('parses top-level tags in original order', () => {
    const { nodes, issues } = parseTlv(SYNTH_STATIC);
    expect(issues).toEqual([]);
    expect(nodes.map((n) => n.tag)).toEqual([
      '00',
      '01',
      '26',
      '51',
      '52',
      '53',
      '58',
      '59',
      '60',
      '61',
      '62',
      '63',
    ]);
  });

  it('extracts values and lengths', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC);
    expect(findNode(nodes, '00')?.value).toBe('01');
    expect(findNode(nodes, '01')?.value).toBe('11');
    expect(findNode(nodes, '59')).toMatchObject({ length: 11, value: 'TOKO CONTOH' });
    expect(findNode(nodes, '63')?.value).toBe('E7AD');
  });

  it('parses nested merchant account templates', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC);
    const mai = findNode(nodes, '26');
    expect(mai?.children?.map((c) => [c.tag, c.value])).toEqual([
      ['00', 'COM.EXAMPLE.WWW'],
      ['01', '999900000000000001'],
      ['02', '1234567890'],
      ['03', 'UMI'],
    ]);
    expect(findNode(nodes, '51', '02')?.value).toBe('ID0000000000001');
  });

  it('parses the additional data template (62)', () => {
    const nodes = parseTlvStrict(SYNTH_DYNAMIC);
    expect(findNode(nodes, '62', '01')?.value).toBe('INV-0001');
    expect(findNode(nodes, '62', '07')?.value).toBe('TERM0001');
    expect(findNode(nodes, '54')?.value).toBe('2000');
  });

  it('records absolute offsets for nested nodes', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC);
    const child = findNode(nodes, '26', '00');
    expect(child?.offset).toBe(SYNTH_STATIC.indexOf('0015COM.EXAMPLE'));
    const crc = findNode(nodes, '63');
    expect(crc?.offset).toBe(SYNTH_STATIC.length - 8);
  });

  it('does not nest non-template tags even if they look like TLV', () => {
    // Tag 59 value "0102AB" is valid TLV syntax but 59 is not a template.
    const nodes = parseTlvStrict('00020159060102AB');
    expect(findNode(nodes, '59')?.children).toBeUndefined();
  });

  it('can disable nested parsing', () => {
    const { nodes } = parseTlv(SYNTH_STATIC, { nested: false });
    expect(findNode(nodes, '26')?.children).toBeUndefined();
  });

  it('nests payment-system templates 50–99 inside tag 62', () => {
    const nodes = parseTlvStrict('621050060002XY');
    expect(findNode(nodes, '62', '50', '00')?.value).toBe('XY');
  });

  it('counts length in characters for non-ASCII values', () => {
    const { nodes, issues } = parseTlv(SYNTH_NON_ASCII);
    expect(findNode(nodes, '59')).toMatchObject({ length: 4, value: 'KAFÉ' });
    expect(issues.map((i) => i.code)).toEqual(['NON_ASCII']);
    expect(issues[0]?.severity).toBe('warning');
  });
});

describe('parseTlv — malformed payloads', () => {
  it('reports empty input', () => {
    expect(codes('')).toEqual(['EMPTY']);
  });

  it('reports a truncated header with position', () => {
    const { nodes, issues } = parseTlv('000201590');
    expect(nodes).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'TRUNCATED_HEADER', offset: 6, severity: 'error' });
  });

  it('reports a non-digit tag', () => {
    expect(parseTlv('000201AB02xx').issues[0]).toMatchObject({ code: 'INVALID_TAG', offset: 6 });
  });

  it('reports a non-digit length', () => {
    expect(parseTlv('00020159 9XY').issues[0]).toMatchObject({
      code: 'INVALID_LENGTH',
      offset: 8,
    });
    expect(codes('0002015A02xx')).toEqual(['INVALID_TAG']);
    expect(codes('00020159A2xx')).toEqual(['INVALID_LENGTH']);
  });

  it('reports a value shorter than its declared length', () => {
    const { nodes, issues } = parseTlv('0002015910ABC');
    expect(nodes.map((n) => n.tag)).toEqual(['00']);
    expect(issues[0]).toMatchObject({ code: 'TRUNCATED_VALUE', offset: 6 });
    expect(issues[0]?.message).toMatch(/declares length 10 but only 3/);
  });

  it('reports zero-length values but keeps parsing', () => {
    const { nodes, issues } = parseTlv('00020159005802ID');
    expect(nodes.map((n) => n.tag)).toEqual(['00', '59', '58']);
    expect(issues[0]).toMatchObject({ code: 'ZERO_LENGTH', offset: 8 });
  });

  it('warns on duplicate tags without discarding them', () => {
    const { nodes, issues } = parseTlv('000201000201');
    expect(nodes).toHaveLength(2);
    expect(issues[0]).toMatchObject({ code: 'DUPLICATE_TAG', severity: 'warning', offset: 6 });
  });

  it('keeps a template raw when its value is not valid TLV', () => {
    const { nodes, issues } = parseTlv('0002012605HELLO');
    const mai = findNode(nodes, '26');
    expect(mai?.value).toBe('HELLO');
    expect(mai?.children).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'TEMPLATE_NOT_TLV', severity: 'warning' });
    // Points at the position inside the payload where nested parsing failed.
    expect(issues[0]?.offset).toBe(10);
  });

  it('propagates nested warnings when the template is valid', () => {
    const { issues } = parseTlv('26100001A0001B');
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'DUPLICATE_TAG',
        offset: 9,
        message: expect.stringMatching(/26/),
      }),
    ]);
  });
});

describe('parseTlvStrict', () => {
  it('throws TlvParseError with issues and position', () => {
    try {
      parseTlvStrict('0002015910ABC');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TlvParseError);
      expect((e as TlvParseError).message).toMatch(/^TRUNCATED_VALUE at offset 6/);
      expect((e as TlvParseError).issues).toHaveLength(1);
    }
  });

  it('does not throw on warnings only', () => {
    expect(() => parseTlvStrict('000201000201')).not.toThrow();
  });
});

describe('findNode', () => {
  it('returns undefined for missing paths', () => {
    const nodes = parseTlvStrict(SYNTH_STATIC);
    expect(findNode(nodes, '54')).toBeUndefined();
    expect(findNode(nodes, '26', '99')).toBeUndefined();
    expect(findNode(nodes, '59', '00')).toBeUndefined();
  });
});
