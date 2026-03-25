const DE_PRICE_FORMATTER = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function normalizeNumberText(input) {
  if (input === null || input === undefined) return '';
  let text = String(input).trim();
  if (!text) return '';
  text = text.replace(/[^\d.,\-+]/g, '');
  if (!text) return '';

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = text.split(',');
    if (parts.length === 2 && parts[1].length <= 3) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = text.split('.');
    if (parts.length > 2) {
      const last = parts.pop();
      text = `${parts.join('')}.${last}`;
    }
  }

  return text;
}

export function parseLooseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = normalizeNumberText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDecimalDE(value, options = {}) {
  const { fallback = '-', formatter = DE_PRICE_FORMATTER } = options;
  const num = parseLooseNumber(value);
  if (num === null) return fallback;
  return formatter.format(num);
}

export function formatPriceDE(value, options = {}) {
  const formatted = formatDecimalDE(value, options);
  if (formatted === options.fallback) return formatted;
  return `€${formatted}`;
}
