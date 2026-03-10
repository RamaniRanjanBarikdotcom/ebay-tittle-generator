/**
 * ElementExtractor - Extracts all title components from original product titles
 *
 * Extracts:
 * - Cartridge Models (TN-230BK, CF294X, MLT-D111L, etc.)
 * - Category Type (Toner/Tinte/Bildtrommel)
 * - Brand (HP, Brother, Samsung, Canon, etc.)
 * - Printer Series (Laserjet Pro, Xpress, etc.)
 * - Printer Models (M506dh, HL-3070CN, etc.)
 * - Quantity (1x, 2x, 3er Set, etc.)
 * - Color (Schwarz, Cyan, Magenta, Gelb, etc.)
 */

import { isCartridgeModel, CARTRIDGE_PREFIXES } from './CartridgeModels.js';

// Known printer brands
const BRANDS = [
  'HP', 'Brother', 'Samsung', 'Canon', 'Epson', 'Kyocera', 'Lexmark',
  'OKI', 'Ricoh', 'Xerox', 'Dell', 'Konica Minolta', 'Panasonic',
  'Sharp', 'Toshiba', 'Olivetti', 'Utax', 'Triumph-Adler'
];

// Category keywords
const CATEGORY_KEYWORDS = {
  toner: ['toner', 'tonerkartusche', 'tonerkassette', 'laser'],
  ink: ['tinte', 'tintenpatrone', 'ink', 'druckerpatrone', 'patrone'],
  drum: ['trommel', 'bildtrommel', 'drum', 'opc', 'fotoleiter', 'imaging']
};

// Color keywords (German and English)
const COLOR_KEYWORDS = {
  'Schwarz': ['schwarz', 'black', 'bk', 'blk', 'noir'],
  'Cyan': ['cyan', 'cy', 'blau'],
  'Magenta': ['magenta', 'mg', 'pink', 'rot'],
  'Gelb': ['gelb', 'yellow', 'yl', 'yel'],
  'Multipack': ['multipack', 'set', 'kombi', 'rainbow', 'cmyk', '4er', '3er', '5er']
};

// Quantity patterns
const QTY_PATTERNS = [
  /\b(\d+)\s*(?:x|er|stück|stk|pack|set)\b/i,
  /\b(\d+)\s*(?:er)?\s*(?:set|pack)\b/i,
  /\bxxl\b/i,
  /\bxl\b/i,
  /\bdoppelpack\b/i,
  /\btriple\b/i
];

// Printer series patterns
const SERIES_PATTERNS = [
  // HP
  { pattern: /\bColor\s+Laserjet\s+Pro\s+MFP\b/i, series: 'Color Laserjet Pro MFP' },
  { pattern: /\bColor\s+Laserjet\s+Enterprise\b/i, series: 'Color Laserjet Enterprise' },
  { pattern: /\bColor\s+Laserjet\s+Pro\b/i, series: 'Color Laserjet Pro' },
  { pattern: /\bColor\s+Laserjet\s+MFP\b/i, series: 'Color Laserjet MFP' },
  { pattern: /\bColor\s+Laserjet\b/i, series: 'Color Laserjet' },
  { pattern: /\bLaserjet\s+Pro\s+MFP\b/i, series: 'Laserjet Pro MFP' },
  { pattern: /\bLaserjet\s+Enterprise\s+MFP\b/i, series: 'Laserjet Enterprise MFP' },
  { pattern: /\bLaserjet\s+Enterprise\b/i, series: 'Laserjet Enterprise' },
  { pattern: /\bLaserjet\s+Pro\b/i, series: 'Laserjet Pro' },
  { pattern: /\bLaserjet\s+MFP\b/i, series: 'Laserjet MFP' },
  { pattern: /\bLaserjet\b/i, series: 'Laserjet' },
  // HP Inkjet
  { pattern: /\bOfficeJet\s+Pro\b/i, series: 'OfficeJet Pro' },
  { pattern: /\bOfficeJet\b/i, series: 'OfficeJet' },
  { pattern: /\bDeskJet\s+Plus\b/i, series: 'DeskJet Plus' },
  { pattern: /\bDeskJet\b/i, series: 'DeskJet' },
  { pattern: /\bEnvy\b/i, series: 'Envy' },
  // Samsung
  { pattern: /\bXpress\s+Color\b/i, series: 'Xpress Color' },
  { pattern: /\bXpress\b/i, series: 'Xpress' },
  // Epson
  { pattern: /\bEcoTank\b/i, series: 'EcoTank' },
  { pattern: /\bWorkForce\s+Pro\b/i, series: 'WorkForce Pro' },
  { pattern: /\bWorkForce\b/i, series: 'WorkForce' },
  { pattern: /\bExpression\b/i, series: 'Expression' },
  // Kyocera
  { pattern: /\bEcosys\b/i, series: 'Ecosys' },
  { pattern: /\bTaskalfa\b/i, series: 'Taskalfa' },
  // Canon
  { pattern: /\bi-SENSYS\b/i, series: 'i-SENSYS' },
  { pattern: /\bPixma\b/i, series: 'Pixma' },
  { pattern: /\bMaxify\b/i, series: 'Maxify' }
];

// Printer model patterns (alphanumeric codes that are NOT cartridge models)
const PRINTER_MODEL_PATTERNS = [
  /\b(HL-[A-Z]?\d{3,4}[A-Z]*(?:DW|DN|CDW|CDN)?)\b/i,      // Brother HL series
  /\b(MFC-[A-Z]?\d{3,4}[A-Z]*(?:DW|DN|CDW|CDN)?)\b/i,     // Brother MFC series
  /\b(DCP-[A-Z]?\d{3,4}[A-Z]*(?:DW|DN|CDW|CDN)?)\b/i,     // Brother DCP series
  /\b(M\d{3}[a-z]*(?:dw|dn|dne|n|x)?)\b/i,                // HP M-series
  /\b(P\d{3,4}[a-z]*(?:dw|dn|dne|n)?)\b/i,                // HP P-series
  /\b(CLX-\d{4}[A-Z]*)\b/i,                                // Samsung CLX
  /\b(CLP-\d{3,4}[A-Z]*)\b/i,                              // Samsung CLP
  /\b(SL-[A-Z]\d{3,4}[A-Z]*)\b/i,                          // Samsung SL series
  /\b(LBP\d{3,4}[A-Z]*)\b/i,                               // Canon LBP
  /\b(MF\d{3,4}[A-Z]*)\b/i,                                // Canon MF
  /\b(ET-\d{4,5})\b/i,                                     // Epson EcoTank
  /\b(WF-\d{4,5})\b/i,                                     // Epson WorkForce
  /\b(XP-\d{3,4})\b/i,                                     // Epson XP
  /\b(P\d{4}[A-Z]*(?:cdn|dn|d|n)?)\b/i,                   // Kyocera P-series
  /\b(M\d{4}[A-Z]*(?:cdn|dn|d)?)\b/i,                     // Kyocera M-series
];

export default class ElementExtractor {
  /**
   * Extract all elements from a product title
   * @param {string} title - Original product title
   * @returns {Object} Extracted elements
   */
  static extract(title) {
    if (!title) {
      return this.getEmptyResult();
    }

    const normalizedTitle = this.normalizeTitle(title);

    // Extract each element type
    const cartridgeModels = this.extractCartridgeModels(normalizedTitle);
    const category = this.extractCategory(normalizedTitle);
    const brand = this.extractBrand(normalizedTitle);
    const series = this.extractSeries(normalizedTitle);
    const printerModels = this.extractPrinterModels(normalizedTitle, cartridgeModels);
    const quantity = this.extractQuantity(normalizedTitle);
    const color = this.extractColor(normalizedTitle);

    return {
      cartridgeModels,
      category,
      categoryType: this.getCategoryType(category),
      brand,
      series,
      printerModels,
      quantity,
      color,
      original: title
    };
  }

  /**
   * Get empty result structure
   */
  static getEmptyResult() {
    return {
      cartridgeModels: [],
      category: 'toner',
      categoryType: 'Toner',
      brand: '',
      series: '',
      printerModels: [],
      quantity: '',
      color: '',
      original: ''
    };
  }

  /**
   * Normalize title for analysis
   */
  static normalizeTitle(title) {
    return title
      .replace(/[<>!*@]/g, '')  // Remove forbidden chars
      .replace(/\s+/g, ' ')     // Normalize spaces
      .trim();
  }

  /**
   * Extract cartridge model numbers
   * IMPORTANT: Only extracts actual cartridge models, NOT category words like "Toner"
   */
  static extractCartridgeModels(title) {
    const models = [];

    // Words that are NOT cartridge models (category words)
    const NON_CARTRIDGE_WORDS = ['TONER', 'TINTE', 'DRUM', 'BILDTROMMEL', 'INK', 'PATRONE', 'KARTUSCHE'];

    // Pattern 1: Standard cartridge codes with prefixes (must have digits)
    const prefixPattern = /\b([A-Z]{1,4}[-]?[A-Z]*\d{1,}[A-Z0-9-]*)\b/gi;
    const matches = title.match(prefixPattern) || [];

    for (const match of matches) {
      const upper = match.toUpperCase();

      // Skip if it's a category word (not a cartridge model)
      if (NON_CARTRIDGE_WORDS.includes(upper)) {
        continue;
      }

      // Check against known cartridge models
      if (isCartridgeModel(upper)) {
        if (!models.includes(upper)) {
          models.push(upper);
        }
      } else {
        // Check prefix patterns - must also have digits
        const hasNumber = /\d/.test(upper);
        if (hasNumber) {
          for (const prefix of CARTRIDGE_PREFIXES) {
            if (upper.startsWith(prefix) && !models.includes(upper)) {
              models.push(upper);
              break;
            }
          }
        }
      }
    }

    // Pattern 2: HP short codes (94X, 83A, 26A, etc.)
    const hpCodes = title.match(/\b(\d{2,3}[AX])\b/gi) || [];
    for (const code of hpCodes) {
      const upper = code.toUpperCase();
      if (!models.includes(upper)) {
        models.push(upper);
      }
    }

    return models.slice(0, 3); // Max 3 cartridge models
  }

  /**
   * Extract category (toner, ink, drum)
   */
  static extractCategory(title) {
    const lower = title.toLowerCase();

    // Check drum first (more specific)
    for (const keyword of CATEGORY_KEYWORDS.drum) {
      if (lower.includes(keyword)) {
        return 'drum';
      }
    }

    // Check ink
    for (const keyword of CATEGORY_KEYWORDS.ink) {
      if (lower.includes(keyword)) {
        return 'ink';
      }
    }

    // Check toner
    for (const keyword of CATEGORY_KEYWORDS.toner) {
      if (lower.includes(keyword)) {
        return 'toner';
      }
    }

    // Default to toner
    return 'toner';
  }

  /**
   * Get category type word in German
   */
  static getCategoryType(category) {
    switch (category) {
      case 'toner': return 'Toner';
      case 'ink': return 'Tinte';
      case 'drum': return 'Bildtrommel';
      default: return 'Toner';
    }
  }

  /**
   * Extract brand name
   */
  static extractBrand(title) {
    const upper = title.toUpperCase();

    for (const brand of BRANDS) {
      const brandUpper = brand.toUpperCase();
      // Match whole word only
      const regex = new RegExp(`\\b${brandUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (regex.test(upper)) {
        return brand;
      }
    }

    return '';
  }

  /**
   * Extract printer series
   */
  static extractSeries(title) {
    for (const { pattern, series } of SERIES_PATTERNS) {
      if (pattern.test(title)) {
        return series;
      }
    }
    return '';
  }

  /**
   * Extract printer model numbers
   */
  static extractPrinterModels(title, cartridgeModels) {
    const models = [];
    const cartridgeSet = new Set(cartridgeModels.map(m => m.toUpperCase()));

    // Try each printer model pattern
    for (const pattern of PRINTER_MODEL_PATTERNS) {
      const matches = title.match(new RegExp(pattern, 'gi')) || [];
      for (const match of matches) {
        const upper = match.toUpperCase();
        // Exclude if it's a cartridge model
        if (!cartridgeSet.has(upper) && !models.includes(upper)) {
          models.push(upper);
        }
      }
    }

    // Also try to find generic alphanumeric model codes
    const genericPattern = /\b([A-Z]{1,3}\d{3,5}[A-Z]{0,3}(?:dw|dn|dne|cdw|cdn|n|w)?)\b/gi;
    const genericMatches = title.match(genericPattern) || [];
    for (const match of genericMatches) {
      const upper = match.toUpperCase();
      // Exclude cartridge models and already found models
      if (!cartridgeSet.has(upper) && !isCartridgeModel(upper) && !models.includes(upper)) {
        // Check it's not a cartridge prefix
        let isCartridge = false;
        for (const prefix of CARTRIDGE_PREFIXES) {
          if (upper.startsWith(prefix)) {
            isCartridge = true;
            break;
          }
        }
        if (!isCartridge) {
          models.push(upper);
        }
      }
    }

    return models.slice(0, 5); // Max 5 printer models
  }

  /**
   * Extract quantity
   */
  static extractQuantity(title) {
    // Check for special quantity words
    if (/\bdoppelpack\b/i.test(title)) return '2x';
    if (/\btriple\b/i.test(title)) return '3x';

    // Check numeric patterns
    for (const pattern of QTY_PATTERNS) {
      const match = title.match(pattern);
      if (match) {
        if (match[1]) {
          return `${match[1]}x`;
        }
        // XXL/XL
        if (/xxl/i.test(match[0])) return 'XXL';
        if (/xl/i.test(match[0])) return 'XL';
      }
    }

    return '';
  }

  /**
   * Extract color
   */
  static extractColor(title) {
    const lower = title.toLowerCase();

    for (const [germanColor, keywords] of Object.entries(COLOR_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          return germanColor;
        }
      }
    }

    return '';
  }
}
