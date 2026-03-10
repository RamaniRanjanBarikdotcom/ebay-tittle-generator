const PRICE_DECREASE_WHEN_ZERO_SOLD = 0.02;
const ZERO_SOLD_INCREASE = 0.02;

function parseFlexibleNumber(input) {
  if (input === null || input === undefined) return NaN;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;

  let text = String(input).trim();
  if (!text) return NaN;

  // Remove currency text/symbols and keep digits/separators/signs only.
  text = text.replace(/[^\d.,\-+]/g, '');
  if (!text) return NaN;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');

  if (hasComma && hasDot) {
    // Assume the last separator is decimal marker and normalize.
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      // 1.234,56 -> 1234.56
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // 1,234.56 -> 1234.56
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    // 14,99 or 1.234,00
    const parts = text.split(',');
    if (parts.length === 2 && parts[1].length <= 3) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasDot) {
    // 1.234 (thousands) vs 14.99 (decimal)
    const parts = text.split('.');
    if (parts.length > 2) {
      const last = parts.pop();
      text = `${parts.join('')}.${last}`;
    }
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function normalizeAdjustment(value) {
  return String(value || '').trim().toLowerCase();
}

export function calculatePriceAdjustment(priceInput, soldCountInput, options = {}) {
  const soldCount = parseFlexibleNumber(soldCountInput);
  const price = parseFlexibleNumber(priceInput);
  const previousAdjustment = normalizeAdjustment(options.previousAdjustment);

  if (Number.isNaN(price)) {
    return {
      price: null,
      soldCount: Number.isNaN(soldCount) ? null : soldCount,
      suggestedPrice: null,
      adjustment: 'no-price',
      updateStatus: 'not-required'
    };
  }

  if (!Number.isNaN(soldCount) && soldCount === 0) {
    const shouldIncrease = previousAdjustment.startsWith('decrease-0-sold');
    const shouldDecreaseAgain = previousAdjustment.startsWith('increase-0-sold');
    const suggestedPrice = shouldIncrease
      ? Number((price + ZERO_SOLD_INCREASE).toFixed(2))
      : Math.max(0, Number((price - PRICE_DECREASE_WHEN_ZERO_SOLD).toFixed(2)));
    const adjustment = shouldIncrease
      ? 'increase-0-sold-repeat'
      : shouldDecreaseAgain
        ? 'decrease-0-sold-repeat'
        : 'decrease-0-sold';
    return {
      price,
      soldCount,
      suggestedPrice,
      adjustment: suggestedPrice !== price ? adjustment : 'unchanged',
      updateStatus: suggestedPrice !== price ? 'pending' : 'not-required'
    };
  }

  return {
    price,
    soldCount: Number.isNaN(soldCount) ? null : soldCount,
    suggestedPrice: price,
    adjustment: 'unchanged',
    updateStatus: 'not-required'
  };
}
