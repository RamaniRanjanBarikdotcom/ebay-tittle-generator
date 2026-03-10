/**
 * Variation Parser
 *
 * Parses the `variation_details` column from the Excel import.
 * Returns overrides for set_of, color, and printer_model that take
 * priority over the values extracted from the main title.
 *
 * The 5 variation types found in real data (per build plan §7):
 *   1. SIMPLE    — empty / null → no overrides
 *   2. QTY PACK  — "Stückzahl=2 x Stück" → override set_of
 *   3. COLOR     — "Ihre Auswahl=1x Cyan" → override color + set_of
 *   4. PRINTER MODEL — "Kompatibles Druckermodell=für HP MFP M28A" → override printer_model
 *   5. COMBO     — semicolon-separated, may override both set_of + printer_model
 */
export function parseVariation(variationDetails) {
  const result = {
    type: 'simple',
    set_of: null,
    color: null,
    printer_model: null,
  };

  if (!variationDetails || String(variationDetails).trim() === '') {
    return result;
  }

  const v = String(variationDetails).trim();

  // ── TYPE 2: Qty pack ────────────────────────────────────────────────────
  // "Stückzahl=2 x Stück" or "Stückzahl=4 x Stück"
  const qtyMatch = v.match(/Stückzahl=(\d+)\s*x?\s*Stück/i);
  if (qtyMatch) {
    result.type = 'qty_pack';
    result.set_of = qtyMatch[1] + 'x';
    return result;
  }

  // ── TYPE 3: Color variant ────────────────────────────────────────────────
  // "Ihre Auswahl=1x Cyan" or "Ihre Auswahl=Schwarz"
  const colorMatch = v.match(/Ihre Auswahl=(\d+x\s+)?(\w+)/i);
  if (colorMatch) {
    result.type = 'color';
    result.set_of = colorMatch[1] ? colorMatch[1].trim() : null;
    result.color = colorMatch[2];
    return result;
  }

  // ── TYPE 4: Printer model variant ───────────────────────────────────────
  // "Kompatibles Druckermodell=für HP MFP M28A"
  const printerMatch = v.match(/Druckermodell=(?:für\s+)?(.+)/i);
  if (printerMatch) {
    result.type = 'printer_model';
    result.printer_model = printerMatch[1].trim();
    return result;
  }

  // ── TYPE 5: Combo ────────────────────────────────────────────────────────
  // Has multiple fields separated by semicolons
  if (v.includes(';')) {
    result.type = 'combo';
    const parts = v.split(';').map((p) => p.trim());
    for (const part of parts) {
      const setMatch = part.match(/Set=(\d+)er/i);
      const modelMatch = part.match(/Druckermodelle?=(.+)/i);
      if (setMatch) result.set_of = setMatch[1] + 'x';
      if (modelMatch) result.printer_model = modelMatch[1].trim();
    }
    return result;
  }

  return result;
}

/**
 * Extract variation_details string from raw_query_data JSON.
 * raw_query_data stores all Excel headers as keys.
 * The variation details column may have various header names.
 */
export function extractVariationDetails(rawQueryData) {
  if (!rawQueryData) return null;
  try {
    const raw = typeof rawQueryData === 'string' ? JSON.parse(rawQueryData) : rawQueryData;
    const key = Object.keys(raw).find((k) => /variation\s*detail/i.test(k));
    if (!key) return null;
    const value = String(raw[key] || '').trim();
    return value || null;
  } catch {
    return null;
  }
}
