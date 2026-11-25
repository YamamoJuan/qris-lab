import { describe, expect, it } from 'vitest';
import { comparePayloads } from '../src/analyzers/payload-comparator.js';
import { SYNTH_DYNAMIC, SYNTH_DYNAMIC_OPAQUE_REF, SYNTH_STATIC } from './fixtures.js';

describe('comparePayloads', () => {
  it('reports identical payloads as all-same', () => {
    const c = comparePayloads(SYNTH_STATIC, SYNTH_STATIC);
    expect(c.counts.changed + c.counts.onlyA + c.counts.onlyB).toBe(0);
    expect(c.sameTopLevelOrder).toBe(true);
  });

  it('identifies static vs dynamic differences', () => {
    const c = comparePayloads(SYNTH_STATIC, SYNTH_DYNAMIC);
    const status = Object.fromEntries(c.entries.map((e) => [e.key, e.status]));
    expect(status['01']).toBe('changed');
    expect(status['54']).toBe('onlyB');
    expect(status['62']).toBe('changed');
    expect(status['62.01']).toBe('onlyB');
    expect(status['62.07']).toBe('same');
    expect(status['63']).toBe('changed');
    expect(status['26']).toBe('same');
    expect(status['26.01']).toBe('same');
    expect(status['59']).toBe('same');
  });

  it('reports values and lengths for both sides', () => {
    const c = comparePayloads(SYNTH_STATIC, SYNTH_DYNAMIC);
    expect(c.entries.find((e) => e.key === '01')).toMatchObject({
      name: 'Point of Initiation Method',
      valueA: '11',
      valueB: '12',
    });
    expect(c.entries.find((e) => e.key === '62')).toMatchObject({
      isTemplate: true,
      lengthA: 12,
      lengthB: 24,
    });
    const amount = c.entries.find((e) => e.key === '54');
    expect(amount?.valueA).toBeUndefined();
    expect(amount).toMatchObject({ valueB: '2000', lengthB: 4, name: 'Transaction Amount' });
  });

  it('reports tags only in A', () => {
    const c = comparePayloads(SYNTH_DYNAMIC, SYNTH_STATIC);
    expect(c.entries.find((e) => e.key === '54')?.status).toBe('onlyA');
    expect(c.counts.onlyA).toBe(2); // 54, 62.01
    expect(c.counts.onlyB).toBe(0);
  });

  it('reports CRC status for both payloads', () => {
    const broken = SYNTH_DYNAMIC.slice(0, -4) + '0000';
    const c = comparePayloads(SYNTH_STATIC, broken);
    expect(c.crcA.status).toBe('valid');
    expect(c.crcB.status).toBe('invalid');
  });

  it('includes opaque provider values as plain entries', () => {
    const c = comparePayloads(SYNTH_STATIC, SYNTH_DYNAMIC_OPAQUE_REF);
    expect(c.entries.find((e) => e.key === '62.50')).toMatchObject({
      status: 'onlyB',
      name: 'Payment System Specific Template',
      isTemplate: false,
    });
  });

  it('distinguishes repeated tags by occurrence', () => {
    const c = comparePayloads('0002015901A5901B', '0002015901A5901C');
    expect(c.entries.map((e) => [e.key, e.status])).toEqual([
      ['00', 'same'],
      ['59', 'same'],
      ['59#2', 'changed'],
    ]);
  });

  it('detects top-level order differences', () => {
    expect(comparePayloads('0002015802ID', '5802ID000201').sameTopLevelOrder).toBe(false);
  });
});
