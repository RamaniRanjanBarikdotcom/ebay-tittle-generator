/**
 * TitleSanitizer - Cleans titles according to eBay.de guidelines
 * - Removes forbidden special characters
 * - Removes promotional words
 * - Converts to proper Title Case
 * - Removes keyword stuffing/repetition
 */
export default class TitleSanitizer {
  // Forbidden special characters per eBay.de guidelines
  // Includes: < > ! * @ + ~ ( )
  static FORBIDDEN_CHARS = /[<>!*@+~()]/g;

  // Promotional words that are not allowed
  static PROMO_WORDS = [
    'wow', 'look', 'best', 'top', 'beautiful', 'amazing', 'great', 'super',
    'toll', 'wunderbar', 'fantastisch', 'genial', 'perfekt', 'hammer',
    'mega', 'krass', 'geil', 'billig', 'guenstig', 'schnäppchen'
  ];

  // Words that should stay uppercase (abbreviations, brands)
  static UPPERCASE_WORDS = [
    'HP', 'USB', 'LED', 'LCD', 'DVD', 'CD', 'PC', 'TV', 'HD', 'XL', 'XXL',
    'EU', 'DE', 'NEU', 'OVP', 'OEM', 'RGB', 'SSD', 'HDD', 'RAM', 'CPU',
    'A4', 'A3', 'A5', 'DIN', 'ISO', 'CE', 'TÜV', 'GS', 'VDE', 'IP44', 'IP65',
    'HL', 'MFC', 'DCP', 'SL', 'MFP', 'OKI'
  ];

  /**
   * Main sanitize function - cleans title according to eBay.de rules
   */
  static sanitize(title) {
    if (!title) return '';

    let cleaned = title;

    // Step 1: Remove forbidden special characters
    cleaned = this.removeForbiddenChars(cleaned);

    // Step 2: Remove promotional words
    cleaned = this.removePromoWords(cleaned);

    // Step 3: Remove duplicate words (keyword stuffing)
    cleaned = this.removeDuplicateWords(cleaned);

    // Step 4: Convert to proper Title Case
    cleaned = this.toTitleCase(cleaned);

    // Step 5: Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Sanitize for analysis only (preserve original casing for model detection)
   */
  static sanitizeForAnalysis(title) {
    if (!title) return '';

    let cleaned = title;
    cleaned = this.removeForbiddenChars(cleaned);
    cleaned = this.removePromoWords(cleaned);
    cleaned = this.removeDuplicateWords(cleaned);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  /**
   * Remove forbidden special characters
   */
  static removeForbiddenChars(title) {
    return title
      .replace(this.FORBIDDEN_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Remove promotional/subjective words
   */
  static removePromoWords(title) {
    const words = title.split(/\s+/);
    const filtered = words.filter(word => {
      const lower = word.toLowerCase().replace(/[^a-zäöüß]/g, '');
      return !this.PROMO_WORDS.includes(lower);
    });
    return filtered.join(' ');
  }

  /**
   * Remove duplicate words (case-insensitive)
   */
  static removeDuplicateWords(title) {
    const words = title.split(/\s+/);
    const seen = new Set();
    const unique = [];

    for (const word of words) {
      const key = word.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(word);
      }
    }

    return unique.join(' ');
  }

  /**
   * Convert to Title Case (first letter of each word capitalized)
   * Preserves known abbreviations and brand names
   */
  static toTitleCase(title) {
    const words = title.split(/\s+/);

    return words.map(word => {
      // Preserve model-like tokens with digits or hyphens
      if (/[A-Za-z].*\d|\d.*[A-Za-z]/.test(word)) {
        return word.toUpperCase();
      }

      // Check if it's a known uppercase word
      const upper = word.toUpperCase();
      if (this.UPPERCASE_WORDS.includes(upper)) {
        return upper;
      }

      // Check if it looks like a model number (e.g., CF217A)
      if (/^[A-Z]{2,}\d+/.test(word) || /^\d+[A-Z]+/.test(word)) {
        return word.toUpperCase();
      }

      // Standard title case: first letter uppercase, rest lowercase
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }

      return word;
    }).join(' ');
  }

  /**
   * Check if title contains forbidden elements
   * Returns array of issues found
   */
  static validate(title) {
    const issues = [];

    // Check length - eBay.de requires > 70 and < 80 characters (71-79 range)
    if (title.length >= 80) {
      issues.push(`Title must be less than 80 characters (currently ${title.length})`);
    }
    if (title.length <= 70) {
      issues.push(`Title must be more than 70 characters (currently ${title.length})`);
    }

    // Check for forbidden chars
    if (this.FORBIDDEN_CHARS.test(title)) {
      issues.push('Contains forbidden special characters');
    }

    // Check for promo words
    const words = title.toLowerCase().split(/\s+/);
    const foundPromo = words.filter(w => this.PROMO_WORDS.includes(w));
    if (foundPromo.length > 0) {
      issues.push(`Contains promotional words: ${foundPromo.join(', ')}`);
    }

    // Check for all-caps (more than 2 consecutive uppercase words)
    const capsWords = title.split(/\s+/).filter(w =>
      w.length > 2 && w === w.toUpperCase() && !this.UPPERCASE_WORDS.includes(w)
    );
    if (capsWords.length > 2) {
      issues.push('Too many ALL-CAPS words');
    }

    return issues;
  }
}
