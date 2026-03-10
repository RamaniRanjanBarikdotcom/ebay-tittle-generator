/**
 * VariantExtractor - Extracts variant information from product titles
 * Handles colors, sizes, quantities, conditions, and other attributes
 * Optimized for German eBay.de listings
 */
export default class VariantExtractor {
  // German and English color names
  static COLORS = {
    // German colors -> normalized German
    'schwarz': 'Schwarz',
    'weiss': 'Weiß',
    'weiß': 'Weiß',
    'rot': 'Rot',
    'blau': 'Blau',
    'grün': 'Grün',
    'gruen': 'Grün',
    'gelb': 'Gelb',
    'orange': 'Orange',
    'rosa': 'Rosa',
    'pink': 'Pink',
    'lila': 'Lila',
    'violett': 'Violett',
    'braun': 'Braun',
    'grau': 'Grau',
    'silber': 'Silber',
    'gold': 'Gold',
    'beige': 'Beige',
    'türkis': 'Türkis',
    'cyan': 'Cyan',
    'magenta': 'Magenta',
    // English colors -> German equivalent
    'black': 'Schwarz',
    'white': 'Weiß',
    'red': 'Rot',
    'blue': 'Blau',
    'green': 'Grün',
    'yellow': 'Gelb',
    'purple': 'Lila',
    'brown': 'Braun',
    'gray': 'Grau',
    'grey': 'Grau',
    'silver': 'Silber',
    'multicolor': 'Mehrfarbig',
    'multicolour': 'Mehrfarbig'
  };

  // Size patterns (German and international)
  static SIZES = {
    clothing: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL'],
    numeric: /\b(\d{2,3})\s*(cm|mm|m|zoll|inch|")\b/i,
    paper: ['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal'],
    volume: /\b(\d+)\s*(ml|l|liter|cl)\b/i,
    weight: /\b(\d+)\s*(g|kg|gramm|kilogramm)\b/i
  };

  // Condition terms (German)
  static CONDITIONS = {
    'neu': 'Neu',
    'new': 'Neu',
    'ovp': 'OVP',
    'originalverpackt': 'OVP',
    'gebraucht': 'Gebraucht',
    'used': 'Gebraucht',
    'defekt': 'Defekt',
    'defective': 'Defekt',
    'refurbished': 'Refurbished',
    'generalüberholt': 'Generalüberholt'
  };

  // Quantity patterns
  static QUANTITY_PATTERN = /\b(\d+)\s*(stück|stk|st|pack|set|paar|er[-\s]?pack|er[-\s]?set)\b/i;
  static QUANTITY_X_PATTERN = /\b(\d+)\s*x\b/i;

  /**
   * Extract all variants from a title
   * Returns object with color, size, condition, quantity
   */
  static extract(title = '') {
    if (!title) return {};

    return {
      color: this.extractColor(title),
      size: this.extractSize(title),
      condition: this.extractCondition(title),
      quantity: this.extractQuantity(title),
      capacity: this.extractCapacity(title)
    };
  }

  /**
   * Extract color from title
   */
  static extractColor(title) {
    const lower = title.toLowerCase();

    for (const [color, normalized] of Object.entries(this.COLORS)) {
      const regex = new RegExp(`\\b${color}\\b`, 'i');
      if (regex.test(lower)) {
        return normalized;
      }
    }

    return '';
  }

  /**
   * Extract size from title
   */
  static extractSize(title) {
    const upper = title.toUpperCase();

    // Check clothing sizes
    for (const size of this.SIZES.clothing) {
      const regex = new RegExp(`\\b${size}\\b`);
      if (regex.test(upper)) {
        return size;
      }
    }

    // Check paper sizes
    for (const size of this.SIZES.paper) {
      const regex = new RegExp(`\\b${size}\\b`, 'i');
      if (regex.test(title)) {
        return size.toUpperCase();
      }
    }

    // Check numeric sizes (e.g., "42cm", "15 Zoll")
    const numericMatch = title.match(this.SIZES.numeric);
    if (numericMatch) {
      return numericMatch[0];
    }

    return '';
  }

  /**
   * Extract condition from title
   */
  static extractCondition(title) {
    const lower = title.toLowerCase();

    for (const [term, normalized] of Object.entries(this.CONDITIONS)) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(lower)) {
        return normalized;
      }
    }

    return '';
  }

  /**
   * Extract quantity from title (e.g., "3er Pack", "5 Stück")
   */
  static extractQuantity(title) {
    const match = title.match(this.QUANTITY_PATTERN);
    if (match) {
      const num = match[1];
      const unit = match[2].toLowerCase();

      // Normalize unit
      if (unit.includes('pack') || unit.includes('set')) {
        return `${num}er Set`;
      }
      if (unit === 'paar') {
        return `${num} Paar`;
      }
      return `${num} Stück`;
    }

    const xMatch = title.match(this.QUANTITY_X_PATTERN);
    if (xMatch) {
      return `${xMatch[1]}x`;
    }

    return '';
  }

  /**
   * Extract capacity (for printer cartridges, batteries, etc.)
   * e.g., "2000 Seiten", "3000mAh"
   */
  static extractCapacity(title) {
    // Page yield for printer supplies
    const pageMatch = title.match(/\b(\d+)\s*(seiten|pages)\b/i);
    if (pageMatch) {
      return `${pageMatch[1]} Seiten`;
    }

    // Battery capacity
    const batteryMatch = title.match(/\b(\d+)\s*(mah)\b/i);
    if (batteryMatch) {
      return `${batteryMatch[1]}mAh`;
    }

    // Volume for ink/toner
    const volumeMatch = title.match(this.SIZES.volume);
    if (volumeMatch) {
      return volumeMatch[0];
    }

    return '';
  }

  /**
   * Build variant string for title
   * Combines extracted variants into a formatted string
   */
  static buildVariantString(variants) {
    const parts = [];

    if (variants.color) parts.push(variants.color);
    if (variants.size) parts.push(variants.size);
    if (variants.quantity) parts.push(variants.quantity);
    if (variants.capacity) parts.push(variants.capacity);
    if (variants.condition && variants.condition !== 'Neu') {
      parts.push(variants.condition);
    }

    return parts.join(' ');
  }
}
