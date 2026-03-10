import { describe, it, expect } from 'vitest';
import { calculatePriceAdjustment } from '../PriceAdjuster.js';

describe('calculatePriceAdjustment', () => {
  it('decreases by 0.02 when sold count is numeric 0', () => {
    const result = calculatePriceAdjustment(14.99, 0);
    expect(result.adjustment).toBe('decrease-0-sold');
    expect(result.suggestedPrice).toBe(14.97);
    expect(result.updateStatus).toBe('pending');
  });

  it('decreases 20.00 to 19.98 when sold count is 0', () => {
    const result = calculatePriceAdjustment(20, 0);
    expect(result.adjustment).toBe('decrease-0-sold');
    expect(result.suggestedPrice).toBe(19.98);
    expect(result.updateStatus).toBe('pending');
  });

  it('decreases by 0.02 when price/sold are localized strings', () => {
    const result = calculatePriceAdjustment('14,99', '0');
    expect(result.adjustment).toBe('decrease-0-sold');
    expect(result.suggestedPrice).toBe(14.97);
  });

  it('decreases by 0.02 when values contain currency text', () => {
    const result = calculatePriceAdjustment('EUR 14,99', '0,00');
    expect(result.adjustment).toBe('decrease-0-sold');
    expect(result.suggestedPrice).toBe(14.97);
  });

  it('does not change price when sold count is greater than 0', () => {
    const result = calculatePriceAdjustment('19.99', '12');
    expect(result.adjustment).toBe('unchanged');
    expect(result.suggestedPrice).toBe(19.99);
    expect(result.updateStatus).toBe('not-required');
  });

  it('increases by 0.02 when previous zero-sold action was decrease', () => {
    const result = calculatePriceAdjustment(14.99, 0, { previousAdjustment: 'decrease-0-sold' });
    expect(result.adjustment).toBe('increase-0-sold-repeat');
    expect(result.suggestedPrice).toBe(15.01);
    expect(result.updateStatus).toBe('pending');
  });

  it('decreases again when previous zero-sold action was increase', () => {
    const result = calculatePriceAdjustment(20, 0, { previousAdjustment: 'increase-0-sold-repeat' });
    expect(result.adjustment).toBe('decrease-0-sold-repeat');
    expect(result.suggestedPrice).toBe(19.98);
    expect(result.updateStatus).toBe('pending');
  });
});
