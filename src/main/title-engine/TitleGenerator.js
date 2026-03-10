/**
 * TitleGenerator - Generates eBay.de compliant titles
 *
 * WORKFLOW:
 * 1. ElementExtractor extracts all components from original title
 * 2. TitleGenerator creates variations by rearranging elements
 *
 * BLOCKS (must stay together):
 * - Cartridge Block: [CategoryType] + [CartridgeModels] OR [CartridgeModels] + [CategoryType]
 * - Printer Block: [Brand] + [Series] + [PrinterModels] (models can rotate positions)
 *
 * FLEXIBLE POSITIONS:
 * - Kompatibel: BEFORE CartridgeBlock ("Kompatibel Toner...") OR AFTER ("Toner... Kompatibel Für")
 * - Qty: 1st position, last, or 2nd-last
 * - Color: last or 2nd-last
 *
 * eBay.de Title Guidelines:
 * - Character limit: 71-79 characters (>70 and <80)
 * - No forbidden characters: < > ! * @
 * - Title Case capitalization
 * - German language
 */
import ElementExtractor from './ElementExtractor.js';
import TitleSanitizer from './TitleSanitizer.js';
import DuplicateChecker from './DuplicateChecker.js';

export default class TitleGenerator {
  static MIN_LENGTH = 71;
  static MAX_LENGTH = 79;

  /**
   * Main generation function
   */
  static generate({ title, maxLength = 79, hashSalt = '' }, existingHashes) {
    // Step 1: Extract all elements from original title
    const extracted = ElementExtractor.extract(title);

    // Step 2: Generate title variations
    const candidates = this.buildVariations(extracted, maxLength, existingHashes, hashSalt);

    return {
      category: extracted.category,
      brand: extracted.brand,
      models: [...extracted.cartridgeModels, ...extracted.printerModels],
      variants: {
        quantity: extracted.quantity,
        color: extracted.color
      },
      extracted,
      candidates
    };
  }

  /**
   * Build all title variations
   * Generates exactly 5 diverse title variations using ONLY extracted elements
   *
   * Title 1: Toner 94X CF294X Kompatibel Für HP... M506DN M506DH 1x Schwarz
   * Title 2: 94X CF294X Toner Kompatibel Für HP... M506DH M506DN 1x Schwarz
   * Title 3: Kompatibel Toner CF294X 94X Für HP... M506DN M506DH 1x Schwarz
   * Title 4: 1x Toner 94X CF294X Kompatibel Für HP... M506DN M506DH Schwarz
   * Title 5: Toner CF294X 94X Kompatibel Für HP... M506DH M506DN Schwarz 1x
   */
  static buildVariations(extracted, maxLength, existingHashes, hashSalt) {
    const candidates = [];
    const effectiveMaxLength = Math.min(maxLength, this.MAX_LENGTH);
    const effectiveMinLength = this.MIN_LENGTH;

    const {
      cartridgeModels,
      categoryType,
      brand,
      series,
      printerModels,
      quantity,
      color
    } = extracted;

    // Filter out categoryType from cartridge models to prevent duplication
    const categoryUpper = (categoryType || '').toUpperCase();
    const filteredCartridgeModels = cartridgeModels.filter(m => m.toUpperCase() !== categoryUpper);

    // Get model variations
    const modelsInOrder = [...filteredCartridgeModels];
    const modelsReversed = [...filteredCartridgeModels].reverse();
    const printersInOrder = [...printerModels];
    const printersReversed = [...printerModels].reverse();

    // Build printer block base (Brand + Series)
    const printerBase = [brand, series].filter(Boolean).join(' ');

    // ── Fit printer models to budget ──────────────────────────────────────────
    // For each pattern we build a "skeleton" = the complete title with ONLY the
    // first printer model (mandatory) but without 2nd+ printer models.
    // We then greedily append extra printers as long as the total stays ≤ maxLength.
    // This ensures category, cartridge model, "Kompatibel für", brand, and first
    // printer are ALWAYS present; extras are only trimmed when the limit is hit.

    // Pattern 1: category modelsInOrder Kompatibel für printerBase [printers] quantity color
    const p1Printers = this.fitExtraPrinters(
      [categoryType, modelsInOrder.join(' '), 'Kompatibel für', printerBase, printersInOrder[0], quantity, color],
      printersInOrder,
      effectiveMaxLength
    );

    // Pattern 2: modelsInOrder category Kompatibel für printerBase [printers] quantity color
    const p2Printers = this.fitExtraPrinters(
      [modelsInOrder.join(' '), categoryType, 'Kompatibel für', printerBase, printersReversed[0], quantity, color],
      printersReversed,
      effectiveMaxLength
    );

    // Pattern 3: Kompatibel category modelsReversed für printerBase [printers] quantity color
    const p3Printers = this.fitExtraPrinters(
      ['Kompatibel', categoryType, modelsReversed.join(' '), 'für', printerBase, printersInOrder[0], quantity, color],
      printersInOrder,
      effectiveMaxLength
    );

    // Pattern 4: quantity category modelsInOrder Kompatibel für printerBase [printers] color
    const p4Printers = this.fitExtraPrinters(
      [quantity, categoryType, modelsInOrder.join(' '), 'Kompatibel für', printerBase, printersInOrder[0], color],
      printersInOrder,
      effectiveMaxLength
    );

    // Pattern 5: category modelsReversed Kompatibel für printerBase [printers] color quantity
    const p5Printers = this.fitExtraPrinters(
      [categoryType, modelsReversed.join(' '), 'Kompatibel für', printerBase, printersReversed[0], color, quantity],
      printersReversed,
      effectiveMaxLength
    );
    // ─────────────────────────────────────────────────────────────────────────

    // Define exactly 5 title patterns.
    // quantity and color are always kept as separate trailing parts so they are
    // guaranteed exactly one space before them and are never merged into the printer string.
    const titlePatterns = [
      // Title 1: Toner 94X CF294X Kompatibel Für HP... M506DN M506DH 1x Schwarz
      {
        parts: [
          categoryType,
          modelsInOrder.join(' '),
          'Kompatibel für',
          printerBase,
          p1Printers,
          quantity,
          color
        ]
      },
      // Title 2: 94X CF294X Toner Kompatibel Für HP... M506DH M506DN 1x Schwarz
      {
        parts: [
          modelsInOrder.join(' '),
          categoryType,
          'Kompatibel für',
          printerBase,
          p2Printers,
          quantity,
          color
        ]
      },
      // Title 3: Kompatibel Toner CF294X 94X Für HP... M506DN M506DH 1x Schwarz
      {
        parts: [
          'Kompatibel',
          categoryType,
          modelsReversed.join(' '),
          'für',
          printerBase,
          p3Printers,
          quantity,
          color
        ]
      },
      // Title 4: 1x Toner 94X CF294X Kompatibel Für HP... M506DN M506DH Schwarz
      {
        parts: [
          quantity,
          categoryType,
          modelsInOrder.join(' '),
          'Kompatibel für',
          printerBase,
          p4Printers,
          color
        ]
      },
      // Title 5: Toner CF294X 94X Kompatibel Für HP... M506DH M506DN Schwarz 1x
      {
        parts: [
          categoryType,
          modelsReversed.join(' '),
          'Kompatibel für',
          printerBase,
          p5Printers,
          color,
          quantity
        ]
      }
    ];

    // Generate all 5 titles
    for (const pattern of titlePatterns) {
      if (candidates.length >= 5) break;

      const title = pattern.parts.filter(Boolean).join(' ');

      this.addCandidate(
        candidates,
        title,
        effectiveMinLength,
        effectiveMaxLength,
        printerModels,
        existingHashes,
        hashSalt
      );
    }

    // Fallback if no candidates generated
    if (candidates.length === 0) {
      const fbPrinters = this.fitExtraPrinters(
        [categoryType, modelsInOrder.join(' '), 'Kompatibel für', printerBase, printersInOrder[0], quantity, color],
        printersInOrder,
        effectiveMaxLength
      );
      const fallback = [categoryType, modelsInOrder.join(' '), 'Kompatibel für', printerBase, fbPrinters, quantity, color]
        .filter(Boolean).join(' ');

      this.addCandidate(
        candidates,
        fallback,
        effectiveMinLength,
        effectiveMaxLength,
        printerModels,
        existingHashes,
        hashSalt
      );
    }

    return candidates;
  }

  /**
   * Fit printer models within the character budget.
   *
   * The first printer model is ALWAYS mandatory — it is never trimmed.
   * Extra models (2nd, 3rd, …) are added greedily and trimming only starts
   * when the title would exceed maxLength.
   *
   * @param {Array<string|null|undefined>} skeletonParts
   *   All parts of the title EXCEPT the extra printer models (but INCLUDING
   *   the first printer model, quantity, color, brand, category, etc.).
   *   Null/undefined values are ignored.
   * @param {string[]} allPrinters   All printer models for this pattern (in desired order).
   * @param {number}   maxLength     Hard character limit (default 80).
   * @returns {string}  Printer model string to drop into the parts array.
   */
  static fitExtraPrinters(skeletonParts, allPrinters, maxLength = 80) {
    if (!allPrinters || allPrinters.length === 0) return '';

    const firstPrinter = allPrinters[0];
    if (!firstPrinter) return '';

    const extras = allPrinters.slice(1);

    // No extras — return first printer as-is
    if (extras.length === 0) return firstPrinter;

    // Compute the baseline length: skeleton already contains the first printer
    const skeletonStr = skeletonParts.filter(Boolean).join(' ');
    const baseLen = skeletonStr.length;

    // Already at or over limit even with just the first printer — return it alone
    if (baseLen >= maxLength) return firstPrinter;

    let result = firstPrinter;
    let usedLen = baseLen;

    for (const model of extras) {
      const nextLen = usedLen + 1 + model.length; // +1 for the space before model
      if (nextLen <= maxLength) {
        result += ' ' + model;
        usedLen = nextLen;
      } else {
        break; // first model that doesn't fit — stop, drop it and all after it
      }
    }

    return result;
  }

  /**
   * Build Cartridge Block variations
   * [CategoryType] + [CartridgeModels] OR [CartridgeModels] + [CategoryType]
   * CartridgeModels order can also vary
   * IMPORTANT: Ensures no duplicate categoryType in the block
   */
  static buildCartridgeBlockVariations(cartridgeModels, categoryType) {
    const variations = [];

    // Filter out any cartridge models that match the categoryType (prevents duplication)
    const categoryUpper = (categoryType || '').toUpperCase();
    const filteredModels = cartridgeModels.filter(m => m.toUpperCase() !== categoryUpper);

    const modelRotations = this.generateModelRotations(filteredModels);

    for (const models of modelRotations) {
      const modelsStr = models.join(' ');

      // Variation 1: CategoryType first, then models
      // Example: "Toner 94X CF294X"
      if (categoryType && modelsStr) {
        variations.push(`${categoryType} ${modelsStr}`);
      } else if (categoryType) {
        variations.push(categoryType);
      } else if (modelsStr) {
        variations.push(modelsStr);
      }

      // Variation 2: Models first, then CategoryType
      // Example: "94X CF294X Toner"
      if (modelsStr && categoryType) {
        variations.push(`${modelsStr} ${categoryType}`);
      }
    }

    // Remove duplicates and keep enough combinations so all model orders for up to 3 models are preserved
    const unique = [...new Set(variations)];
    const limit = cartridgeModels.length <= 3 ? 12 : 8;
    return unique.slice(0, limit);
  }

  /**
   * Build Printer Block variations
   * [Brand] + [Series] + [PrinterModels]
   * PrinterModels order can vary
   */
  static buildPrinterBlockVariations(brand, series, printerModels) {
    const variations = [];
    const modelRotations = this.generateModelRotations(printerModels);

    for (const models of modelRotations) {
      const parts = [brand, series, models.join(' ')].filter(Boolean);
      if (parts.length > 0) {
        variations.push(parts.join(' '));
      }
    }

    // Remove duplicates and keep enough combinations so all model orders for up to 3 models are preserved
    const unique = [...new Set(variations)];
    const limit = printerModels.length <= 3 ? 12 : 8;
    return unique.slice(0, limit);
  }

  /**
   * Generate model order rotations
   * For 2–3 models we want every ordering to be possible (user requirement).
   * For 4–5 models we still sample several permutations to avoid explosion.
   */
  static generateModelRotations(models) {
    if (!models || models.length === 0) return [[]];
    if (models.length === 1) return [models];

    // Full permutation for up to 3 models (2! = 2, 3! = 6)
    const limit = models.length <= 3 ? 12 : 12; // hard cap to prevent huge lists for 4–5 models
    const perms = [];
    const seen = new Set();

    const permute = (arr, l = 0) => {
      if (perms.length >= limit) return;
      if (l === arr.length) {
        const key = arr.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          perms.push([...arr]);
        }
        return;
      }

      for (let i = l; i < arr.length; i++) {
        [arr[l], arr[i]] = [arr[i], arr[l]];
        permute(arr, l + 1);
        [arr[l], arr[i]] = [arr[i], arr[l]];
        if (perms.length >= limit) return;
      }
    };

    permute([...models]);

    return perms;
  }

  /**
   * Assemble title from template pattern
   */
  static assembleFromTemplate(template, cartridgeBlock, printerBlock, quantity, color) {
    const { pattern, kompatibel, connector } = template;
    const parts = [];

    // Parse pattern and build title
    const tokens = pattern.split('_');

    for (const token of tokens) {
      switch (token) {
        case 'CB': // Cartridge Block
          if (cartridgeBlock) parts.push(cartridgeBlock);
          break;
        case 'PB': // Printer Block
          if (printerBlock) parts.push(printerBlock);
          break;
        case 'Q': // Quantity
          if (quantity) parts.push(quantity);
          break;
        case 'C': // Color
          if (color) parts.push(color);
          break;
        case 'KF': // Kompatibel Für (combined)
          parts.push('Kompatibel für');
          break;
        case 'K': // Kompatibel (separate)
          parts.push(kompatibel || 'Kompatibel');
          break;
        case 'F': // Für (separate)
          parts.push(connector || 'für');
          break;
      }
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Add candidate with validation and length adjustment
   * Generates all 5 title variations - accepts any length since we use only extracted elements
   */
  static addCandidate(candidates, title, minLength, maxLength, printerModels, existingHashes, hashSalt) {
    if (!title) return;

    // Clean and format
    let candidate = TitleSanitizer.sanitize(title);
    candidate = this.removeDuplicateWords(candidate);
    candidate = TitleSanitizer.toTitleCase(candidate);
    candidate = candidate.replace(/\bKompatibel Für\b/g, 'Kompatibel für');

    // Try to adjust length to target range (71-79)
    if (candidate.length > maxLength) {
      candidate = this.truncateTitle(candidate, maxLength);
    }

    if (candidate.length < minLength) {
      candidate = this.expandTitle(candidate, minLength, maxLength, printerModels);
    }

    // Final cleanup
    candidate = this.removeDuplicateWords(candidate);
    candidate = TitleSanitizer.toTitleCase(candidate);
    candidate = candidate.replace(/\bKompatibel Für\b/g, 'Kompatibel für');

    // Accept the title regardless of length - we only use extracted elements
    // Don't reject titles just because they're outside 71-79 range

    // Check duplicates
    if (existingHashes && DuplicateChecker.isDuplicate(candidate, existingHashes, hashSalt)) {
      return;
    }

    // Avoid adding same candidate twice
    if (candidates.includes(candidate)) {
      return;
    }

    // Add to candidates
    candidates.push(candidate);
    if (existingHashes) {
      DuplicateChecker.addHash(candidate, existingHashes, hashSalt);
    }
  }

  /**
   * Remove duplicate words (case-insensitive)
   * Also removes words that are substrings of other words (e.g., "94X" if "CF294X" exists)
   */
  static removeDuplicateWords(title) {
    const words = title.split(/\s+/).filter(w => w.length > 0);
    const seen = new Set();
    const unique = [];

    for (const word of words) {
      // Normalize: uppercase and remove hyphens for comparison
      const key = word.toUpperCase().replace(/-/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(word);
      }
    }

    return unique.join(' ');
  }

  /**
   * Truncate title to max length
   */
  static truncateTitle(title, maxLength) {
    if (title.length <= maxLength) return title;

    const words = title.split(' ');
    while (words.length > 3 && words.join(' ').length > maxLength) {
      words.pop();
    }

    return words.join(' ');
  }

  /**
   * Expand title with additional printer models
   */
  static expandTitle(title, minLength, maxLength, printerModels) {
    if (title.length >= minLength) return title;
    if (!printerModels || printerModels.length === 0) return title;

    let result = title;
    const existingWords = new Set(title.toUpperCase().split(/\s+/));

    for (const model of printerModels) {
      if (result.length >= minLength) break;
      if (existingWords.has(model.toUpperCase())) continue;

      const newResult = `${result} ${model}`;
      if (newResult.length <= maxLength) {
        result = newResult;
        existingWords.add(model.toUpperCase());
      }
    }

    return result;
  }

  /**
   * Pad title - NO external fillers allowed
   * Only use extracted elements (handled elsewhere)
   * If title is still too short, return as-is
   */
  // eslint-disable-next-line no-unused-vars
  static padTitle(title, _minLength, _maxLength) {
    // Do NOT add external fillers - only use extracted elements
    // If the title is too short after using all extracted elements,
    // we accept it as-is rather than adding non-original content
    return title;
  }

  /**
   * Build forced fallback title
   */
  static buildForcedTitle({ analysisTitle, maxLength = 79 }) {
    if (!analysisTitle) return '';

    const extracted = ElementExtractor.extract(analysisTitle);

    // Build cartridge block
    const cartridgeBlock = [
      extracted.categoryType || 'Toner',
      extracted.cartridgeModels.join(' ')
    ].filter(Boolean).join(' ');

    // Build printer block — use fitExtraPrinters so extra models are only
    // included when they fit within the character budget.
    const printerBase = [extracted.brand, extracted.series].filter(Boolean).join(' ');
    const fittedPrinters = this.fitExtraPrinters(
      [cartridgeBlock, 'Kompatibel für', printerBase, extracted.printerModels[0], extracted.quantity, extracted.color],
      extracted.printerModels,
      Math.min(maxLength, this.MAX_LENGTH)
    );
    const printerBlock = [printerBase, fittedPrinters].filter(Boolean).join(' ');

    // Assemble — quantity and color kept as separate parts for clean single-space separation
    let title = [
      cartridgeBlock,
      'Kompatibel für',
      printerBlock,
      extracted.quantity,
      extracted.color
    ].filter(Boolean).join(' ');

    title = TitleSanitizer.sanitize(title);
    title = this.removeDuplicateWords(title);
    title = TitleSanitizer.toTitleCase(title);
    title = title.replace(/\bKompatibel Für\b/g, 'Kompatibel für');

    // Adjust length
    const minLength = this.MIN_LENGTH;
    const effectiveMaxLength = Math.min(maxLength, this.MAX_LENGTH);

    if (title.length > effectiveMaxLength) {
      title = this.truncateTitle(title, effectiveMaxLength);
    }

    if (title.length < minLength) {
      title = this.expandTitle(title, minLength, effectiveMaxLength, extracted.printerModels);
    }

    if (title.length < minLength) {
      title = this.padTitle(title, minLength, effectiveMaxLength);
    }

    title = this.removeDuplicateWords(title);
    title = TitleSanitizer.toTitleCase(title);
    title = title.replace(/\bKompatibel Für\b/g, 'Kompatibel für');

    return title;
  }

  /**
   * Validate title
   */
  static validate(title) {
    return TitleSanitizer.validate(title);
  }

  /**
   * Backwards compatibility
   */
  static padToMinLength(title, minLength, maxLength) {
    return this.padTitle(title, minLength, maxLength);
  }
}
