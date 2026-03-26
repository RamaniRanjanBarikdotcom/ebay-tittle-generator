function norm(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function uniq(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const value = norm(item);
    if (!value) continue;
    const key = value.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function stableHashInt(str) {
  let h = 0;
  const input = str || '';
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function swapLastTwo(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return arr || [];
  const out = [...arr];
  const a = out[out.length - 2];
  const b = out[out.length - 1];
  out[out.length - 2] = b;
  out[out.length - 1] = a;
  return out;
}

function rotate(arr, shift) {
  if (!arr || arr.length <= 1) return arr || [];
  const offset = ((shift % arr.length) + arr.length) % arr.length;
  return arr.slice(offset).concat(arr.slice(0, offset));
}

function scoreTitle(title, minLength, maxLength, ideal) {
  const len = title.length;
  if (len >= minLength && len <= maxLength) return 0;
  if (len > maxLength) return 100 + (len - maxLength) * 5;
  return (minLength - len) * 2 + Math.abs(len - ideal);
}

function removeDanglingKompatibel(s) {
  // "Kompatibel" at the end without "für" means the phrase was split by truncation or
  // the candidate template placed "Kompatibel für" last but ran out of space.
  // Remove the dangling word — an incomplete "Kompatibel" is worse than no Kompatibel.
  return s.replace(/\s*\bKompatibel\s*$/i, '').trim();
}

function truncateToMax(title, maxLength) {
  let out = norm(title);

  if (out.length <= maxLength) {
    return removeDanglingKompatibel(out);
  }

  // Pipe-aware: trim words before the pipe, preserve the tail (e.g. "| 1x Schwarz")
  const pipeIdx = out.lastIndexOf(' | ');
  if (pipeIdx >= 0) {
    const main = out.slice(0, pipeIdx);
    const tail = out.slice(pipeIdx); // " | 1x Schwarz"
    const words = main.split(' ');
    while (words.length > 2 && (words.join(' ') + tail).length > maxLength) {
      words.pop();
    }
    out = norm(words.join(' ')) + tail;
    if (out.length > maxLength) out = out.slice(0, maxLength).trim();
  } else {
    // No pipe — original word-pop logic
    const words = out.split(' ');
    while (words.length > 2 && words.join(' ').length > maxLength) {
      words.pop();
    }
    out = norm(words.join(' '));
    if (out.length > maxLength) out = out.slice(0, maxLength).trim();
  }

  return removeDanglingKompatibel(out);
}

function padIfShort(title) {
  return norm(title);
}

function compactAlphaNum(value) {
  return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function collapseAdjacentRepeatedPhrases(text) {
  let words = norm(text).split(/\s+/).filter(Boolean);
  if (words.length < 4) return words.join(' ');

  let changed = true;
  while (changed) {
    changed = false;
    const maxPhrase = Math.min(5, Math.floor(words.length / 2));
    for (let size = maxPhrase; size >= 2; size -= 1) {
      for (let i = 0; i + size * 2 <= words.length; i += 1) {
        const left = words.slice(i, i + size).join(' ').toUpperCase();
        const right = words.slice(i + size, i + size * 2).join(' ').toUpperCase();
        if (left !== right) continue;
        words.splice(i + size, size);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return words.join(' ');
}

// Build plan Fix 1: Order longer/compound names first to avoid partial matches.
// Kodak and Lenovo are critical — missing them caused 36 errors on real data.
const KNOWN_PRINTER_BRANDS = [
  'Triumph-Adler', // compound — must come before shorter single-word brands
  'Nashuatec',
  'Gestetner',
  'Panasonic',
  'Olivetti',
  'Samsung',
  'Brother',
  'Lexmark',
  'Kyocera',
  'Diconix',
  'Toshiba',
  'Muratec',
  'Infotec',
  'Konica',
  'Lenovo', // ← Fix 1: fixes ~10 missed printer brands — DO NOT REMOVE
  'Lanier',
  'Ricoh',
  'Canon',
  'Epson',
  'Xerox',
  'Sharp',
  'Kodak', // ← Fix 1: fixes ~26 missed printer brands — DO NOT REMOVE
  'Savin',
  'Dell',
  'Utax',
  'OKI',
  'HP'
];

const CATEGORY_WORDS = [
  'toner', 'toners', 'tonerkartusche', 'tinte', 'tintenpatrone', 'tintenpatronen',
  'patronen', 'ink', 'drum', 'bildtrommel', 'trommel'
];

function detectPrinterBrand(title) {
  // Special case: Diconix and Kodak can appear together as one combined brand.
  const hasDiconix = /\bdiconix\b/i.test(title);
  const hasKodak = /\bkodak\b/i.test(title);
  if (hasDiconix && hasKodak) return 'Diconix / Kodak';
  if (hasDiconix) return 'Diconix';

  // Iterate KNOWN_PRINTER_BRANDS in order (longest first per Fix 1).
  // This ensures compound names like "Triumph-Adler" are matched before
  // shorter names that might partially overlap.
  for (const brand of KNOWN_PRINTER_BRANDS) {
    if (brand === 'Diconix') continue; // handled above
    // Escape hyphens so "Triumph-Adler" matches literally.
    const escaped = brand.replace(/[-]/g, '[-]?');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(title)) {
      // Normalize casing for short all-caps brands (OKI, HP).
      return brand;
    }
  }
  return '';
}

function detectKompatibelConnector(title) {
  if (/\bkompatibel\s+zu\b/i.test(title)) return 'Kompatibel zu';
  if (/\bkompatibel\s+mit\b/i.test(title)) return 'Kompatibel mit';
  return 'Kompatibel für';
}

function detectSetOf(title, qty) {
  const pagePack = title.match(/\b(\d{3,5})\s*(pg|seiten)\b/i);
  if (pagePack) return `${pagePack[1]} ${pagePack[2].toUpperCase() === 'PG' ? 'PG' : 'Seiten'}`;
  if (qty) return qty;
  const explicitSet = title.match(/\b(\d{1,2})\s*(?:er)?\s*set\b/i);
  if (explicitSet) return `${explicitSet[1]}er Set`;
  const setOf = title.match(/\bset\s+of\s+(\d{1,2})\b/i);
  if (setOf) return `Set of ${setOf[1]}`;
  if (/\bmultipack\b/i.test(title)) return 'Multipack';
  return '';
}

function isCartridgeLikeToken(token) {
  const upper = token.toUpperCase();
  if (/^\d{8}$/.test(upper)) return true;
  if (/^\d{2,3}[AX]$/.test(upper)) return true;
  return /^(LC|PGI|CLI|TN|CF|CE|CRG|TK|MLT|MLTD|CC)[-]?[A-Z0-9]{2,8}$/i.test(upper) && /\d/.test(upper);
}

function detectProductBrand(title, cartridgeModels, printerBrand) {
  const cartridgeTokenSet = new Set((cartridgeModels || []).map((m) => m.toUpperCase()));
  const tokens = title.match(/[A-Za-z0-9-]+/g) || [];
  const productTokens = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    const upper = token.toUpperCase();

    if (/^\d{1,2}x$/i.test(token)) continue;
    if (CATEGORY_WORDS.includes(lower)) break;
    if (
      ['kompatibel', 'kompatible', 'für', 'f', 'fur', 'fuer', 'mit', 'zu', 'druckermodell', 'druckerpapier']
        .includes(lower)
    ) break;
    if (KNOWN_PRINTER_BRANDS.includes(upper)) break;
    if (cartridgeTokenSet.has(upper) || isCartridgeLikeToken(token)) break;
    if (!/^[A-Za-z-]+$/.test(token)) continue;
    if (upper === token && upper !== 'SPS') continue;

    productTokens.push(token);
    if (productTokens.length >= 1) break;
  }

  const productBrand = norm(productTokens.join(' '));
  if (!productBrand) return '';
  if (printerBrand && productBrand.toUpperCase() === printerBrand.toUpperCase()) return '';
  return productBrand;
}

function detectExtra(title) {
  if (/\bdruckermodell\b/i.test(title)) return 'Druckermodell';
  if (/\bdruckerpapier\b/i.test(title)) return 'Druckerpapier';
  if (/\bpatronen?\b/i.test(title)) return 'Patronen';
  if (/\btoner[-\s]?kartusche\b/i.test(title)) return 'Toner-Kartusche';
  if (/\bkartusche\b/i.test(title)) return 'Kartusche';
  if (/\bmit\s+chip\b/i.test(title)) return 'Mit Chip';
  if (/\bdruckers?\b/i.test(title)) return 'Drucker';
  return '';
}

function mergeSeriesWithPrinterModels(series, printerModels) {
  const baseSeries = norm(series);
  const models = uniq(printerModels || []);
  if (!baseSeries) return models;
  if (!models.length) return [baseSeries];

  // For compound series like 'MFC-L / DCP-L / HL-L', check each segment individually.
  const seriesSegments = baseSeries.includes('/')
    ? baseSeries.split('/').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [baseSeries.toLowerCase()];

  const alreadyPrefixed = [];
  const bare = [];
  for (const model of models) {
    const item = norm(model);
    if (!item) continue;
    const itemLower = item.toLowerCase();
    if (seriesSegments.some((seg) => itemLower.startsWith(seg))) {
      alreadyPrefixed.push(item);
    } else {
      // If model starts with its own named word prefix (letters-only, 3+ chars)
      // that differs from the current series (e.g. 'Envy' when series is 'DeskJet'),
      // keep it as-is rather than merging it under the wrong series.
      const firstWord = item.split(/\s+/)[0] || '';
      const hasOwnPrefix = /^[A-Za-z]{3,}$/.test(firstWord) &&
        !seriesSegments.some((seg) => seg.startsWith(firstWord.toLowerCase()));
      if (hasOwnPrefix) {
        alreadyPrefixed.push(item);
      } else {
        bare.push(item);
      }
    }
  }

  const result = [];
  if (bare.length > 0) {
    // Detect trailing-overlap: series='Ecosys P', models=['P2040'] → 'Ecosys P2040'
    //                          series='Xpress SL-M', models=['SL-M2000','SL-M2022'] → two entries
    const seriesTrail = baseSeries.split(/\s+/).pop() || '';
    const allHaveOverlap = seriesTrail.length > 0 &&
      bare.every((m) => norm(m).toLowerCase().startsWith(seriesTrail.toLowerCase()));

    if (allHaveOverlap) {
      // Produce one entry per bare model, removing the duplicated tail from the model.
      // e.g. 'Ecosys P' + 'P2040' → 'Ecosys P' + '2040' = 'Ecosys P2040'
      for (const m of bare) {
        const suffix = norm(m).slice(seriesTrail.length);
        result.push(norm(`${baseSeries}${suffix}`));
      }
    } else {
      // Combine all bare models into ONE entry with the series prefix.
      // e.g. ["M506dh","M506dn","M506n"] → "Laserjet Enterprise M506dh M506dn M506n"
      result.push(norm(`${baseSeries} ${bare.join(' ')}`));
    }
  }
  result.push(...alreadyPrefixed);
  return uniq(result);
}

function extendPrinterSeries(title, baseSeries) {
  if (/\blexmark\b/i.test(title) && /\bE\s+\d{3,4}\b/i.test(title)) return 'E';
  if (/\bexpression\s+home\s+xp\b/i.test(title)) return 'Expression Home XP';
  if (/\bstylus\s+dx\b/i.test(title)) return 'Stylus DX';
  if (/\bstylus\s+d\b/i.test(title)) return 'Stylus D';
  if (/\bphotosmart\s+premium\s+e-aio\b/i.test(title)) return 'Photosmart Premium E-AIO';
  if (/\bofficejet\s+pro\b/i.test(title)) return 'OfficeJet Pro';
  if (/\bofficejet\b/i.test(title) && !/\bofficejet\s+pro\b/i.test(title)) return 'OfficeJet';
  if (/\blaserjet\s+enterprise\s+mfp\s+m\b/i.test(title)) return 'LaserJet Enterprise MFP M';
  if (/\bmaxify\s+mb\b/i.test(title)) return 'Maxify MB';
  if (/\blasershot\b/i.test(title)) return 'Lasershot';
  if (/\becosys\s+p\d/i.test(title)) return 'Ecosys P';
  if (/\bisensys\b/i.test(title)) return 'iSENSYS';
  const xpressSeries = title.match(/\bXpress\s+C\d{3,4}\s+Series\b/i);
  if (xpressSeries) return norm(xpressSeries[0]);
  if (/\bXpress\s+M\b/i.test(title)) return 'Xpress M';
  if (/\bXpress\s+SL\b/i.test(title)) return 'Xpress SL';
  if (/\bXpress\s+C\b/i.test(title)) return 'Xpress C';
  if (/\bMFC-L(?=\d|\s|$)/i.test(title) && /\bDCP-L(?=\d|\s|$)/i.test(title) && /\bHL-L(?=\d|\s|$)/i.test(title)) return 'MFC-L / DCP-L / HL-L';
  if (/\bHL-L(?=\d|\s|$)/i.test(title) && /\bMFC-L(?=\d|\s|$)/i.test(title)) return 'HL-L / MFC-L';
  if (/\bDCP\b/i.test(title) && /\bMFC\b/i.test(title)) return 'DCP / MFC';
  if (/\bMFC-L(?=\d|\s|$)/i.test(title)) return 'MFC-L';
  if (/\bDCP-L(?=\d|\s|$)/i.test(title)) return 'DCP-L';
  if (/\bHL-L(?=\d|\s|$)/i.test(title)) return 'HL-L';
  if (/\bDCP[-\s]/i.test(title)) return 'DCP';
  if (/\bMFC(?:[-\s]|\d)/i.test(title)) return 'MFC';
  if (/\bHL[-\s]/i.test(title)) return 'HL';
  if (/\bFAX[-\s]\d/i.test(title)) return 'FAX';
  if (/\bIntellifax\b/i.test(title)) return 'Intellifax';
  if (/\bESPC?\b/i.test(title)) return 'ESP';
  if (/\bcolor\s+laserjet\s+cp\b/i.test(title)) return 'Color LaserJet CP';
  if (/\blaserjet\s+enterprise\s+500\b/i.test(title)) return 'LaserJet Enterprise 500';
  if (/\bcolor\s+laserjet\s+pro\s+mfp\b/i.test(title)) return 'Color LaserJet Pro MFP';
  if (/\bcolor\s+laserjet\s+pro\b/i.test(title)) return 'Color LaserJet Pro';
  if (/\blaserjet\s+pro\s+mfp\b/i.test(title)) return 'LaserJet Pro MFP';
  if (/\blaserjet\s+pro\b/i.test(title)) return 'LaserJet Pro';
  if (/\bLaser\s+MFP\b/i.test(title)) return 'Laser MFP';
  if (/\bLaser\s+\d{3,4}\b/i.test(title)) return 'Laser';
  if (/\bDeskJet\b/i.test(title)) return 'DeskJet';
  if (/\bEnvy\b/i.test(title)) return 'Envy';
  if (/\bMFP\s+M\b/i.test(title)) return 'MFP M';
  return baseSeries;
}

function extractAdditionalPrinterCodes(title, cartridgeModels) {
  const codes = [];
  const cartridgeSet = new Set((cartridgeModels || []).map((c) => c.toUpperCase()));

  const slashCodes = title.match(/\/\s*(\d{2,3}[A-Z])\b/gi) || [];
  for (const raw of slashCodes) {
    const code = raw.replace(/^\/\s*/i, '').toUpperCase();
    // Keep slash-separated short codes (e.g. /59A, /207A) as printer-model aliases.
    codes.push(code);
  }

  const numericModels = title.match(/\b\d{3,4}[A-Z]{1,4}\b/gi) || [];
  const suffixes = title.match(/\b(DN|DW|CDN|CDW|N|W)\b/gi) || [];
  for (const model of numericModels) {
    const upper = model.toUpperCase();
    if (!cartridgeSet.has(upper)) {
      // Skip codes that are substrings of a cartridge model (e.g. "1500XLY" inside "PGI-1500XLY")
      const isCartSuffix = (cartridgeModels || []).some((c) => {
        const cKey = c.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const mKey = upper.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return cKey !== mKey && cKey.endsWith(mKey) && mKey.length >= 4;
      });
      if (!isCartSuffix) codes.push(upper);
    }
  }
  if (numericModels.length && suffixes.length) {
    const last = numericModels[numericModels.length - 1].toUpperCase();
    if (!cartridgeSet.has(last)) {
      const combo = `${last} ${suffixes[0].toUpperCase()}`;
      codes.push(combo);
    }
  }

  return uniq(codes);
}

function extractPrefixedPrinterModels(title) {
  const models = [];
  const tokens = (title.match(/[A-Za-z0-9-]+/g) || []).map((t) => t.toUpperCase());
  const prefixes = new Set(['HL', 'MFC', 'DCP', 'C', 'MB', 'FAX', 'INTELLIFAX', 'MFC-L']);
  const stop = new Set([
    'TONER', 'KOMPATIBEL', 'FUER', 'FUR', 'MIT', 'SERIE', 'SERIES', 'DRUCKER', 'PATRONEN', 'KARTUSCHE'
  ]);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!prefixes.has(token)) continue;
    let j = i + 1;
    while (j < tokens.length) {
      const cur = tokens[j];
      if (prefixes.has(cur) || stop.has(cur)) break;
      if (/^\d{1,2}X$/i.test(cur)) break; // quantity token like 1x, 2x — not a model suffix
      if (/^\d{1,4}(?:\.\d)?[A-Z]{0,4}$/.test(cur) || /^\d{3,4}FW$/.test(cur)) {
        models.push(`${token} ${cur}`);
      } else if (/^(\d{3,4})FAX(\d{3,5})$/.test(cur)) {
        const match = cur.match(/^(\d{3,4})FAX(\d{3,5})$/);
        models.push(`${token} ${match[1]}`);
        models.push(`FAX${match[2]}`);
      } else {
        break;
      }
      j += 1;
    }
  }

  return uniq(models);
}

function extractOkiDnModels(title) {
  const models = [];
  const cDn = [...title.matchAll(/\b(C\d{3,4})\s+DN\b/gi)].map((m) => m[1].toUpperCase());
  const mcDn = [...title.matchAll(/\b(MC\d{3,4})\s+DN\b/gi)].map((m) => m[1].toUpperCase());
  const mcInline = [...title.matchAll(/\b(MC\d{3,4})DN\b/gi)].map((m) => m[1].toUpperCase());

  const cDnToKeep = cDn.length > 1 ? cDn.slice(1) : cDn;
  for (const code of [...cDnToKeep, ...mcDn, ...mcInline]) {
    models.push(`DN ${code}`);
  }
  return uniq(models);
}

function extractCompositePrinterModels(title) {
  const models = [];
  const directPatterns = [
    /\b(HL-L\d{3,4}[A-Z]{0,4}|MFC-L\d{3,4}[A-Z]{0,4}|DCP-L\d{3,4}[A-Z]{0,4})\b/gi,
    /\b(MFC\d{3,4}[A-Z]{0,4}|DCP\d{3,4}[A-Z]{0,4}|HL\d{3,4}[A-Z]{0,4})\b/gi,
    /\b(SL-C\d{3,4}[A-Z]{0,4}|LBP\d{3,4}[A-Z]{0,4}|CP\d{3,4}[A-Z]{0,4}|CM\d{3,4}[A-Z]{0,4}|XP-\d{3,4}|M\d{3,4}[A-Z]{0,4})\b/gi,
    /\b(ESPC?\s*\d{1,4}(?:\.\d)?)\b/gi
  ];
  for (const pattern of directPatterns) {
    const found = title.match(pattern) || [];
    models.push(...found.map((m) => norm(m.toUpperCase())));
  }
  return uniq(models);
}

function splitCategory(title) {
  const hasToner = /\btoner|toners|tonerkartusche\b/i.test(title);
  const hasDrum = /\btrommel|bildtrommel|drum\b/i.test(title);
  if (hasDrum) return 'Trommel';
  if (hasToner) return 'Toner';
  if (/\btintenpatronen?\b|\bdruckerpatrone\b|\bpatronen?\b|\bink\b|\btinte\b/i.test(title)) return 'Tintenpatrone';
  if (/\bLC[-\s]?\d{3,4}|PGI-?\d|CLI-?\d\b/i.test(title)) return 'Tintenpatrone';
  return 'Toner';
}

function extractEpsonStyledModels(title) {
  const dx = [...title.matchAll(/\bDX\s+(\d{3,4})\b/gi)].map((m) => `DX ${m[1]}`);
  const dSeries = [...title.matchAll(/\bD\s+(\d{2,4})\b/gi)].map((m) => `D ${m[1]}`);
  const office = [...title.matchAll(/\b(\d{4})\s+(Wireless)\b/gi)].map((m) => `${m[1]} ${m[2]}`);
  return uniq([...dx, ...dSeries, ...office]);
}

function extractHpEnterpriseModel(title) {
  const match = title.match(/\bM\s+(\d{3}[A-Z])\s+(Plus)\b/i);
  if (match) return [`M ${match[1].toUpperCase()} ${match[2]}`];
  const plain = title.match(/\bM\s+(\d{3}[A-Z])\b/i);
  if (plain) return [`M ${plain[1].toUpperCase()}`];
  return [];
}

function extractHpSpacedMModels(title) {
  const models = [];
  const spaced = [...title.matchAll(/\b(?:MFP\s+)?M\s+(\d{3}[A-Z]?)\s+([A-Z]{2,3})\b/gi)];
  for (const match of spaced) {
    const prefix = /MFP\s+M/i.test(match[0]) ? 'MFP M' : 'M';
    models.push(`${prefix} ${match[1].toUpperCase()} ${match[2].toUpperCase()}`);
  }
  return uniq(models);
}

function extractSamsungSlSpacedModels(title) {
  const models = [];
  const spaced = [...title.matchAll(/\bSL-C\s+(\d{3,4})\s+([A-Z]{1,3})\b/gi)];
  for (const match of spaced) {
    models.push(`SL-C ${match[1]} ${match[2].toUpperCase()}`);
  }
  return uniq(models);
}

function extractSamsungXpressMModels(title) {
  const models = [];
  const direct = [...title.matchAll(/\bXpress\s+M\s+(\d{3,4}[A-Z]{0,3})\b/gi)];
  for (const match of direct) {
    models.push(`Xpress M ${match[1].toUpperCase()}`);
  }
  return uniq(models);
}

function extractSamsungClxClpModels(title) {
  const models = [];
  const spaced = [...title.matchAll(/\b(CLX|CLP)\s+(\d{3,4})(?:\s+([A-Z]{1,3}))?\b/gi)];
  for (const match of spaced) {
    const family = String(match[1] || '').toUpperCase();
    const num = String(match[2] || '');
    const suffix = match[3] ? ` ${String(match[3]).toUpperCase()}` : '';
    models.push(`${family} ${num}${suffix}`);
  }
  return uniq(models);
}

function extractHpLaserSpacedModels(title) {
  const models = [];
  const spaced = [...title.matchAll(/\bLaser\s+(\d{3,4})\s+([A-Z])\b/gi)];
  for (const match of spaced) {
    models.push(`Laser ${match[1]} ${match[2].toUpperCase()}`);
  }
  return uniq(models);
}

function extractHpLaserMfpModels(title) {
  const models = [];
  const spaced = [...title.matchAll(/\bLaser\s+MFP\s+(\d{3,4})(?:\s+([A-Z]{1,3}))?\b/gi)];
  for (const match of spaced) {
    const suffix = match[2] ? ` ${match[2].toUpperCase()}` : '';
    models.push(`Laser MFP ${match[1]}${suffix}`);
  }
  return uniq(models);
}

function extractHpLaserPlainModels(title) {
  const models = [];
  const matches = [...title.matchAll(/\bLaser\s+(\d{3,4})\b/gi)];
  for (const match of matches) {
    const after = title.slice(match.index + match[0].length).trimStart();
    if (/^[A-Z]/i.test(after)) continue; // letter suffix → handled by extractHpLaserSpacedModels
    const before = title.slice(0, match.index).trimEnd();
    if (/\bMFP$/i.test(before)) continue; // MFP prefix → handled by extractHpLaserMfpModels
    models.push(`Laser ${match[1]}`);
  }
  return uniq(models);
}

function extractHpDeskJetModels(title) {
  const models = [];
  // Pass 1: individual "DeskJet XXXX" matches
  const matches = [...title.matchAll(/\bDeskJet\s+(\d{3,4}[A-Z]{0,3})\b/gi)];
  for (const match of matches) {
    models.push(`DeskJet ${match[1].toUpperCase()}`);
  }
  // Pass 2: sequence "DeskJet 2620 2630 3760 3730" — additional numbers stored bare (no prefix)
  const seqMatches = [
    ...title.matchAll(/\bDeskJet\s+(\d{3,4}[A-Z]{0,3}(?:\s+\d{3,4}[A-Z]{0,3})+)\b/gi)
  ];
  for (const match of seqMatches) {
    const numbers = (match[1] || '').trim().split(/\s+/);
    for (let i = 1; i < numbers.length; i++) {
      if (/^\d{3,4}[A-Z]{0,3}$/.test(numbers[i])) {
        models.push(numbers[i].toUpperCase()); // bare number — no DeskJet prefix
      }
    }
  }
  return uniq(models);
}

function extractHpEnvyModels(title) {
  const models = [];
  // Pass 1: individual "Envy XXXX" matches
  const matches = [...title.matchAll(/\bEnvy\s+(\d{3,4}[A-Z]{0,3})\b/gi)];
  for (const match of matches) {
    models.push(`Envy ${match[1].toUpperCase()}`);
  }
  // Pass 2: sequence "Envy 5000 5010" — additional numbers stored bare (no prefix)
  const seqMatches = [
    ...title.matchAll(/\bEnvy\s+(\d{3,4}[A-Z]{0,3}(?:\s+\d{3,4}[A-Z]{0,3})+)\b/gi)
  ];
  for (const match of seqMatches) {
    const numbers = (match[1] || '').trim().split(/\s+/);
    for (let i = 1; i < numbers.length; i++) {
      if (/^\d{3,4}[A-Z]{0,3}$/.test(numbers[i])) {
        models.push(numbers[i].toUpperCase()); // bare number — no Envy prefix
      }
    }
  }
  return uniq(models);
}

function extractHpOfficeJetModels(title) {
  const models = [];
  // Match "OfficeJet Pro XXXX [suffix]" or "OfficeJet XXXX [suffix]"
  // e.g. "OfficeJet Pro 8500 Premier", "OfficeJet Pro 8000 Wireless", "OfficeJet 4500"
  const matches = [
    ...title.matchAll(/\bOfficeJet(?:\s+Pro)?\s+(\d{3,5})(?:\s+(Premier|Wireless|Plus|All-in-One|AIO))?\b/gi)
  ];
  for (const match of matches) {
    const num = match[1];
    const suffix = match[2] ? ` ${match[2]}` : '';
    models.push(`${num}${suffix}`);
  }
  // Also capture sequences: "OfficeJet Pro 8500 8000 8500A"
  const seqMatches = [
    ...title.matchAll(/\bOfficeJet(?:\s+Pro)?\s+(\d{3,5}[A-Z]?(?:\s+\d{3,5}[A-Z]?)+)\b/gi)
  ];
  for (const match of seqMatches) {
    const numbers = (match[1] || '').trim().split(/\s+/);
    for (const n of numbers) {
      if (/^\d{3,5}[A-Z]?$/.test(n)) {
        models.push(n.toUpperCase());
      }
    }
  }
  return uniq(models);
}

function extractHpPhotosmartPremiumFaxModels(title) {
  const models = [];
  const hits = [...title.matchAll(/\bPhotosmart\s+Premium\s+Fax\b/gi)];
  for (const match of hits) {
    models.push(norm(match[0]));
  }
  return uniq(models);
}

function extractCanonPixmaModels(title) {
  const models = [];
  // Pass 1: compact/single forms like "Pixma TS3150", "Pixma TS 3150", or "Pixma TR 8550"
  const direct = [...title.matchAll(/\bPixma\s+((?:MG|TS|MX|IP|iP|IX|iX|TR)\s*\d{3,4}[A-Z]{0,3})\b/gi)];
  for (const match of direct) {
    const raw = norm(match[1] || '');
    if (!raw) continue;
    const compact = raw.replace(/\s+/g, '');
    const split = compact.match(/^(MG|TS|MX|IP|iP|IX|iX|TR)(\d{3,4}[A-Z]{0,3})$/i);
    if (split) {
      models.push(`Pixma ${split[1].toUpperCase()} ${split[2].toUpperCase()}`);
    } else {
      models.push(`Pixma ${raw.toUpperCase()}`);
    }
  }
  // Pass 2: "Pixma TS 3150 3350 3450 ..." — series prefix + sequence of bare numbers
  // First number is already captured by Pass 1; emit remaining as bare numbers (no prefix)
  const seriesPass = [
    ...title.matchAll(/\bPixma\s+(TS|MG|MX|IP|iP|IX|iX|TR)\s+(\d{3,4}[A-Z]{0,3}(?:\s+\d{3,4}[A-Z]{0,3})+)\b/gi)
  ];
  for (const match of seriesPass) {
    const numbers = (match[2] || '').trim().split(/\s+/);
    for (let i = 1; i < numbers.length; i++) {
      if (/^\d{3,4}[A-Z]{0,3}$/.test(numbers[i])) {
        models.push(numbers[i].toUpperCase()); // bare number, no series prefix
      }
    }
  }
  return uniq(models);
}

function removeCartridgeDerivedPrinterNoise(printerModels, cartridgeModels, title = '') {
  const cartKeys = (cartridgeModels || [])
    .map((c) => String(c || '').replace(/[^A-Z0-9]/gi, '').toUpperCase())
    .filter(Boolean);
  // Also extract the numeric+suffix core from cartridge models (e.g. LC-223Y → 223Y)
  const cartSuffixes = (cartridgeModels || [])
    .map((c) => {
      const m = String(c || '').match(/(\d{2,4}[A-Z]{0,3})$/i);
      return m ? m[1].toUpperCase() : '';
    })
    .filter(Boolean);
  return (printerModels || []).filter((model) => {
    const raw = String(model || '').trim();
    if (!raw) return false;
    const key = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const familySuffixMatch = raw.match(/^(MFC|DCP|HL|FAX)\s+(\d{2,4}[A-Z]{1,3})(?:\s+[A-Z]{1,3})?$/i);
    if (familySuffixMatch) {
      const core = String(familySuffixMatch[2] || '').toUpperCase();
      if (cartSuffixes.some((cs) => cs === core || cs.endsWith(core) || core.endsWith(cs))) {
        return false;
      }
    }
    // Keep realistic printer-family tokens.
    if (/\b(SL-|CLX|CLP|MFC|DCP|HL|PIXMA|LASER|XP-|ECOSYS|ISENSYS|DESKJET|ENVY|FAX)\b/i.test(raw)) return true;
    // Remove short tokens that are mostly cartridge suffixes (e.g. 504S, 223Y DW).
    if (/^\d{3,4}[A-Z]{1,2}(?:\s+[A-Z]{1,3})?$/i.test(raw)) {
      const slashAliasPattern = new RegExp(`\\/\\s*${key}\\b`, 'i');
      if (slashAliasPattern.test(String(title || ''))) return true;
      // Strip trailing suffix (e.g. "223Y DW" → "223Y") and check against cartridge suffixes
      const coreMatch = raw.match(/^(\d{2,4}[A-Z]{1,2})/i);
      const core = coreMatch ? coreMatch[1].toUpperCase() : key;
      if (cartSuffixes.some((cs) => cs === core || cs.endsWith(core) || core.endsWith(cs))) return false;
      return !cartKeys.some((ck) => ck.endsWith(key) || ck.includes(key));
    }
    return true;
  });
}

function applyKnowledgeBaseRules(title, extracted) {
  const result = { ...extracted, knowledgeBaseMatches: [] };
  if (/\bHP\b/i.test(title) && /\bLaser\s+\d{3,4}\s+[A-Z]\b/i.test(title)) {
    const laserModels = extractHpLaserSpacedModels(title);
    result.printerModels = uniq([...(result.printerModels || []), ...laserModels]).filter(
      (m) => !/^\d{3,4}[A-Z]$/i.test(m)
    );
    result.knowledgeBaseMatches.push('hp_laser_spaced_model');
  }
  if (/\bHP\b/i.test(title) && /\bLaser\s+\d{3,4}\b/i.test(title)) {
    const plainModels = extractHpLaserPlainModels(title);
    if (plainModels.length) {
      result.printerModels = uniq([...(result.printerModels || []), ...plainModels]);
      result.knowledgeBaseMatches.push('hp_laser_plain_model');
    }
  }
  return result;
}

function verifyExtraction(title, extracted) {
  const issues = [];
  const hasKompatibel = /\bkompatibel\b/i.test(title);
  const hasBrand = Boolean(extracted.printerBrand);
  const hasCartridge = (extracted.cartridgeModels || []).length > 0;
  const hasPrinterModels = (extracted.printerModels || []).length > 0;

  if (!hasCartridge) issues.push('missing_cartridge_model');
  if (hasBrand && !hasPrinterModels) issues.push('missing_printer_model');
  if (hasKompatibel && !hasBrand) issues.push('missing_printer_brand');
  if (/\bHP\b/i.test(title) && /\bLaser\s+\d{3,4}\s+[A-Z]\b/i.test(title)) {
    const hasLaserSpaced = (extracted.printerModels || []).some((m) => /\bLaser\s+\d{3,4}\s+[A-Z]\b/i.test(m));
    if (!hasLaserSpaced) issues.push('hp_laser_spaced_not_captured');
  }
  if (/\bHP\b/i.test(title) && /\bLaser\s+\d{3,4}\b/i.test(title) && !/\bLaser\s+\d{3,4}\s+[A-Z]\b/i.test(title) && !/\bLaser\s+MFP\b/i.test(title)) {
    const hasLaserPlain = (extracted.printerModels || []).some((m) => /^Laser\s+\d{3,4}$/i.test(m));
    if (!hasLaserPlain) issues.push('hp_laser_plain_not_captured');
  }
  if (/\bHP\b/i.test(title) && /\bLaser\s+MFP\s+\d{3,4}\b/i.test(title)) {
    const hasLaserMfp = (extracted.printerModels || []).some((m) => /\bLaser\s+MFP\s+\d{3,4}\b/i.test(m));
    if (!hasLaserMfp) issues.push('hp_laser_mfp_not_captured');
  }

  const confidence = Math.max(0, 100 - issues.length * 20);
  return {
    status: issues.length ? 'review' : 'ok',
    confidence,
    issues
  };
}

function expandCartridgeRanges(title) {
  const models = [];
  const cfRange = title.match(/\bCF(\d{3})([A-Z])\s*-\s*CF(\d{3})([A-Z])\b/i);
  if (!cfRange) return models;
  const start = Number(cfRange[1]);
  const end = Number(cfRange[3]);
  const suffix = cfRange[2].toUpperCase();
  if (start > end || end - start > 6 || suffix !== cfRange[4].toUpperCase()) return models;
  for (let n = start; n <= end; n += 1) models.push(`CF${n}${suffix}`);
  return models;
}

function extractLexmarkEModels(title) {
  const models = [];
  const direct = [...title.matchAll(/\bE\s+(\d{3,4})\s+([A-Z]{1,3})\b/gi)];
  for (const match of direct) {
    models.push(`E ${match[1]} ${match[2].toUpperCase()}`);
  }
  return uniq(models);
}

function extractDiconixModels(title) {
  const models = [];
  // ESP Office 2100, ESP Office 2150, etc.
  const espOffice = [...title.matchAll(/\bESP\s+(?:Office\s+)?(\d{4})\b/gi)];
  for (const m of espOffice) models.push(`ESP Office ${m[1]}`);
  // ESP-C 315, ESP-C 510, etc.
  const espC = [...title.matchAll(/\bESP-C\s+(\d{3})\b/gi)];
  for (const m of espC) models.push(`ESP-C ${m[1]}`);
  // Hero 3.1 AIO, Hero 5.1 AIO, etc.
  const hero = [...title.matchAll(/\bHero\s+(\d+(?:\.\d+)?)\s+AIO\b/gi)];
  for (const m of hero) models.push(`Hero ${m[1]} AIO`);
  return uniq(models);
}

function extractHpNeverstopModels(title) {
  const models = [];
  const m = [...title.matchAll(/\b(Neverstop\s+Laser\s+\d{3,4}(?:\s+MFP\s+\d{3,4})?)\b/gi)];
  for (const match of m) models.push(match[1].replace(/\s+/g, ' ').trim());
  return uniq(models);
}

function extractKyoceraFsModels(title) {
  const models = [];
  // FS1041 (compact) or FS 1041 (spaced), optionally followed by MFP
  const m = [...title.matchAll(/\bFS[-\s]?(\d{3,4})(?:\s+(MFP))?\b/gi)];
  for (const match of m) {
    models.push(`FS${match[1]}${match[2] ? ' MFP' : ''}`);
  }
  return uniq(models);
}

function extractBrotherJModels(title) {
  const models = [];
  const tokens = (title.match(/[A-Za-z0-9-]+/g) || []).map((t) => t.toUpperCase());
  let pendingPrefix = '';
  for (const token of tokens) {
    // Compound: MFC-J480DW → add as-is, clear any pending prefix
    if (/^(MFC|DCP)-J\d{3,4}[A-Z]{0,3}$/.test(token)) {
      pendingPrefix = '';
      models.push(token);
      continue;
    }
    // "MFC-J" or "DCP-J" without digits → pending prefix for next number token
    // Handles spaced patterns like "MFC-J 885" → will become "MFC-J885"
    if (/^(MFC|DCP)-J$/i.test(token)) {
      pendingPrefix = token; // "MFC-J"
      continue;
    }
    // Standalone MFC/DCP → set pending prefix for the NEXT J-token only
    if (token === 'DCP') { pendingPrefix = 'DCP-'; continue; }
    if (token === 'MFC') { pendingPrefix = 'MFC-'; continue; }
    // Number token after "MFC-J" prefix: "885" or "480DW" → "MFC-J885" or "MFC-J480DW"
    if (pendingPrefix && /^(MFC|DCP)-J$/i.test(pendingPrefix) && /^\d{3,4}[A-Z]{0,3}$/.test(token)) {
      models.push(`${pendingPrefix}${token}`);
      pendingPrefix = '';
      continue;
    }
    if (/^J\d{3,4}[A-Z]{0,3}$/.test(token)) {
      if (pendingPrefix) {
        // e.g. "MFC J480DW" → "MFC-J480DW"; prefix consumed, next J-tokens will be bare
        models.push(`${pendingPrefix}${token}`);
        pendingPrefix = '';
      } else {
        models.push(token); // bare J-token: keep as-is
      }
    } else {
      pendingPrefix = ''; // non-matching token clears pending prefix
    }
  }
  return uniq(models);
}

function extractBrotherFaxModels(title) {
  const models = [];
  const matches = [...title.matchAll(/\bFAX[-\s]?(\d{3,5})\s*([A-Z]{0,3})\b/gi)];
  for (const m of matches) {
    const suffix = m[2] ? ` ${m[2].toUpperCase()}` : '';
    models.push(`FAX ${m[1]}${suffix}`);
  }
  return uniq(models);
}

export default class RuleEngine {
  static extractComponents(title, sku = '') {
    const cleanTitle = norm(title);
    const cleanSku = norm(sku);

    const category = splitCategory(cleanTitle);

    const printerBrand = detectPrinterBrand(cleanTitle);

    const seriesMatch = cleanTitle.match(
      /\b(Laserjet Pro MFP|Laserjet Enterprise|Color Laserjet|Laserjet Pro|Laserjet|Ecosys|Xpress SL-M|Xpress)\b/i
    );
    const series = extendPrinterSeries(cleanTitle, seriesMatch ? seriesMatch[0] : '');

    const cartridgePatterns = [
      /\bW\d{4}[A-Z]{1,3}(?:\s*XXL)?\b/gi,
      /\bE\d{3}A\d{2}[A-Z]\b/gi,
      /\bE\d{3}\b/gi,
      /\b\d{2,4}XL\b/gi,
      /\bPGI-?\d{2,4}\s*XL\b/gi,
      /\bTN-?\d{3,4}[A-Z]{0,4}\b/gi,
      /\bDR-?\d{3,4}[A-Z]{0,4}\b/gi,
      /\bCF-?\d{3}[A-Z]{0,2}\b/gi,
      /\bCE-?\d{3}[A-Z]{0,2}\b/gi,
      /\bMLT-?D\d{3,4}[A-Z]{0,2}\b/gi,
      /\bMLTD\d{3,4}[A-Z]{0,2}\b/gi,
      /\bTK-?\d{3,4}[A-Z]{0,3}\b/gi,
      /\bCRG-?\d{2,3}[A-Z]{0,2}\b/gi,
      /\bCLT-[A-Z]?\d{3,4}[A-Z]{0,2}\b/gi,
      /\bCLTK\d{3,4}[A-Z]{0,2}\b/gi,
      /\bCLX-\d{3,4}[A-Z]{0,3}\b/gi,
      /\bCLP-\d{3,4}[A-Z]{0,3}\b/gi,
      /\bCC\d{3,4}[A-Z]{0,2}\b/gi,
      /\bLC-?\d{3,4}[A-Z]{0,3}\b/gi,
      /\bPGI-?\d{2,4}[A-Z]{0,10}\b/gi,
      /\bCLI-?\d{2,4}[A-Z]{0,10}\b/gi,
      /\bLC\s?\d{3,4}[A-Z]{0,2}\b/gi,
      /\b\d{1,3}CLXL\b/gi,
      /\bK\d{3}\b/gi,
      /\b\d{4}[A-Z]\d{3}\b/gi,
      /\b\d{2,3}[AX]\b/gi,
      /\b0\d{2}[A-Z]\b/gi,
      /\b\d{6,8}\b/g
    ];

    let cartridgeModels = [];
    for (const pattern of cartridgePatterns) {
      const match = cleanTitle.match(pattern);
      if (match) cartridgeModels.push(...match);
    }
    cartridgeModels.push(...expandCartridgeRanges(cleanTitle));
    cartridgeModels = uniq(cartridgeModels);

    // Split combined patterns like "W1106A XXL" into base cartridge + XXL marker.
    const normalizedCartridges = [];
    for (const model of cartridgeModels) {
      const match = model.match(/\b(W\d{4}[A-Z])\s*XXL\b/i);
      if (match) {
        normalizedCartridges.push(match[1].toUpperCase(), 'XXL');
      } else {
        normalizedCartridges.push(model);
      }
    }
    cartridgeModels = uniq(normalizedCartridges);

    // Keep standalone XL/XXL marker attached to cartridge model list when present in title.
    if (cartridgeModels.length) {
      const xlMarker = /\bXXL\b/i.test(cleanTitle) ? 'XXL' : (/\bXL\b/i.test(cleanTitle) ? 'XL' : '');
      if (xlMarker) cartridgeModels = uniq([...cartridgeModels, xlMarker]);
    }

    // Prefer XL form and drop base duplicate (e.g. PGI-2500 vs PGI-2500 XL).
    const xlKeys = new Set(
      cartridgeModels
        .filter((m) => /\bXL\b/i.test(m))
        .map((m) => m.replace(/\s*XL\b/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase())
    );
    cartridgeModels = cartridgeModels.filter((m) => {
      const raw = m.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return /\bXL\b/i.test(m) || !xlKeys.has(raw);
    });

    // Heuristic: parse code-like tokens in the leading segment
    // (before category words). This is where cartridge tokens usually appear.
    const categoryWordMatch = cleanTitle.match(/\b(toner|tinte|tintenpatrone|ink|drum|bildtrommel)\b/i);
    const kompatibelMatch = cleanTitle.match(/\bkompatibel\b/i);
    const cutIndexCandidates = [
      categoryWordMatch?.index,
      kompatibelMatch?.index
    ].filter((x) => Number.isInteger(x));
    const cutIndex = cutIndexCandidates.length ? Math.min(...cutIndexCandidates) : cleanTitle.length;
    const leadingSegment = cleanTitle.slice(0, Math.max(0, cutIndex));
    const leadingTokens = leadingSegment.match(/\b[A-Z0-9-]{2,12}\b/gi) || [];
    const blockedLeadingTokens = new Set(['TONER', 'DRUM', 'INK']);
    for (const token of leadingTokens) {
      const upper = token.toUpperCase();
      if (blockedLeadingTokens.has(upper)) continue;
      if (/^\d{1,2}X$/i.test(upper)) continue;
      if (/^\d{8}$/.test(upper) || /^[A-Z]\d{3,4}[A-Z]{0,2}$/i.test(upper)) {
        if (/^J\d{3,4}[A-Z]{0,3}$/.test(upper) && /\b(DCP|MFC)\b/i.test(cleanTitle)) continue;
        cartridgeModels.push(upper);
        continue;
      }
      // Short numeric cartridge codes like "052" (Canon iSENSYS)
      if (/^0\d{2,3}$/.test(upper)) {
        cartridgeModels.push(upper);
        continue;
      }
      if (
        /^(LC|PGI|CLI|TN|CF|CE|CRG|TK|MLT|MLTD|CC)[-]?[A-Z0-9]{2,8}$/i.test(upper) &&
        /\d/.test(upper)
      ) {
        cartridgeModels.push(upper);
      }
    }
    cartridgeModels = uniq(cartridgeModels);

    const bracketCodes = uniq(cleanTitle.match(/\([A-Z0-9]{4,10}\)/g) || []);
    const bracketBare = new Set(bracketCodes.map((x) => x.replace(/[()]/g, '').toUpperCase()));

    let qty = '';
    const qtyMatch = cleanTitle.match(/(?:^|[\s,;|])(\d{1,2})\s*x(?:\s|$)/i);
    if (qtyMatch) qty = `${qtyMatch[1]}x`;

    if (qty) {
      const qtyUpper = qty.toUpperCase();
      const cartUpper = cartridgeModels.map((c) => c.toUpperCase());
      if (cartUpper.includes(qtyUpper) && /^\d{2,3}X$/.test(qtyUpper)) {
        qty = '';
      }
    }
    if (qty) {
      const qtyToken = qty.toUpperCase();
      cartridgeModels = cartridgeModels.filter((c) => c.toUpperCase() !== qtyToken);
    }
    const setOf = detectSetOf(cleanTitle, qty);
    const kompatibel = detectKompatibelConnector(cleanTitle);

    let color = '';
    if (/\bschwarz\b|\bblack\b/i.test(cleanTitle)) color = 'Schwarz';
    else if (/\bcyan\b/i.test(cleanTitle)) color = 'Cyan';
    else if (/\bmagenta\b/i.test(cleanTitle)) color = 'Magenta';
    else if (/\bgelb\b|\byellow\b/i.test(cleanTitle)) color = 'Gelb';
    else if (/\bmehrfarbig\b/i.test(cleanTitle)) color = 'Mehrfarbig';
    else if (/\bB\s+C\s+Y\s+M\b/i.test(cleanTitle)) color = 'B C Y M';

    // Fix 2 (build plan): "Mehrfarbig" without an explicit qty prefix → set_of = '1x'.
    // Proven by 13 real titles where the manual data stores set_of=1x despite no qty
    // prefix written in the title (e.g. "...| Mehrfarbig" with no leading "4x").
    let effectiveSetOf = setOf;
    if (color === 'Mehrfarbig' && !qty) {
      effectiveSetOf = '1x';
    }

    let printerModels = [];
    printerModels.push(...(cleanTitle.match(/\b[A-Z]{1,5}[A-Z]{0,3}-[A-Z]?\d{2,5}[A-Za-z]{0,8}\b/g) || []));
    printerModels.push(...(cleanTitle.match(/(?<!-)\b[A-Z]{1,5}\d{2,5}[A-Za-z]{0,8}\b(?!-)/g) || []));
    printerModels = uniq(printerModels);

    printerModels = printerModels.filter((m) => !bracketBare.has(m.toUpperCase()));

    const leadingCodeKeys = new Set(
      leadingTokens
        .filter((token) => /[A-Z]/i.test(token) && /\d/.test(token))
        .map((token) => token.replace(/[^A-Z0-9]/gi, '').toUpperCase())
    );
    const cartKey = new Set(
      cartridgeModels.map((c) => c.replace(/[^A-Z0-9]/gi, '').toUpperCase())
    );
    printerModels = printerModels.filter(
      (m) => {
        const key = m.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return !cartKey.has(key) && !leadingCodeKeys.has(key);
      }
    );
    const printerCanonical = new Map();
    for (const model of printerModels) {
      const key = model.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const current = printerCanonical.get(key);
      if (!current || model.length > current.length) {
        printerCanonical.set(key, model);
      }
    }
    printerModels = Array.from(printerCanonical.values());
    const extraPrinterCodes = extractAdditionalPrinterCodes(cleanTitle, cartridgeModels);
    const prefixedModels = extractPrefixedPrinterModels(cleanTitle);
    const compositeModels = extractCompositePrinterModels(cleanTitle);
    const epsonModels = extractEpsonStyledModels(cleanTitle);
    const hpEnterpriseModels = extractHpEnterpriseModel(cleanTitle);
    const hpSpacedMModels = extractHpSpacedMModels(cleanTitle);
    const samsungSlSpacedModels = extractSamsungSlSpacedModels(cleanTitle);
    const samsungXpressMModels = extractSamsungXpressMModels(cleanTitle);
    const samsungClxClpModels = extractSamsungClxClpModels(cleanTitle);
    const hpLaserSpacedModels = extractHpLaserSpacedModels(cleanTitle);
    const hpLaserMfpModels = extractHpLaserMfpModels(cleanTitle);
    const hpLaserPlainModels = /\bHP\b/i.test(cleanTitle) ? extractHpLaserPlainModels(cleanTitle) : [];
    const hpDeskJetModels = /\bDeskJet\b/i.test(cleanTitle) ? extractHpDeskJetModels(cleanTitle) : [];
    const hpEnvyModels = /\bEnvy\b/i.test(cleanTitle) ? extractHpEnvyModels(cleanTitle) : [];
    const hpOfficeJetModels = /\bOfficeJet\b/i.test(cleanTitle) ? extractHpOfficeJetModels(cleanTitle) : [];
    const hpPhotosmartPremiumFaxModels = /\bPhotosmart\s+Premium\s+Fax\b/i.test(cleanTitle)
      ? extractHpPhotosmartPremiumFaxModels(cleanTitle)
      : [];
    const canonPixmaModels = extractCanonPixmaModels(cleanTitle);
    const lexmarkEModels = extractLexmarkEModels(cleanTitle);
    const brotherJModels = extractBrotherJModels(cleanTitle);
    const brotherFaxModels = /\bFAX[-\s]\d/i.test(cleanTitle) ? extractBrotherFaxModels(cleanTitle) : [];
    const okiDnModels = printerBrand.toUpperCase() === 'OKI' ? extractOkiDnModels(cleanTitle) : [];
    const diconixModels = (/\bdiconix\b/i.test(cleanTitle) || /\bkodak\b/i.test(cleanTitle))
      ? extractDiconixModels(cleanTitle) : [];
    const neverstopModels = /\bneverstop\b/i.test(cleanTitle) ? extractHpNeverstopModels(cleanTitle) : [];
    const kyoceraFsModels = /\bFS[-\s]?\d{3,4}\b/i.test(cleanTitle) ? extractKyoceraFsModels(cleanTitle) : [];
    printerModels = uniq([
      ...printerModels,
      ...prefixedModels,
      ...compositeModels,
      ...epsonModels,
      ...hpEnterpriseModels,
      ...hpSpacedMModels,
      ...hpLaserSpacedModels,
      ...hpLaserMfpModels,
      ...hpLaserPlainModels,
      ...hpDeskJetModels,
      ...hpEnvyModels,
      ...hpOfficeJetModels,
      ...hpPhotosmartPremiumFaxModels,
      ...canonPixmaModels,
      ...samsungSlSpacedModels,
      ...samsungXpressMModels,
      ...samsungClxClpModels,
      ...lexmarkEModels,
      ...brotherJModels,
      ...brotherFaxModels,
      ...extraPrinterCodes,
      ...okiDnModels,
      ...diconixModels,
      ...neverstopModels,
      ...kyoceraFsModels
    ]).slice(0, 10);

    printerModels = removeCartridgeDerivedPrinterNoise(printerModels, cartridgeModels, cleanTitle);

    if (samsungXpressMModels.length) {
      printerModels = printerModels.filter((model) => !/^M\s?\d{3,4}[A-Z]{0,3}$/i.test(model));
    }
    if (hpLaserSpacedModels.length) {
      printerModels = printerModels.filter((model) => !/^\d{3,4}[A-Z]$/i.test(model));
    }
    if (hpLaserMfpModels.length) {
      printerModels = printerModels.filter((model) => !/^MFP\s?\d{3,4}[A-Z]{0,3}$/i.test(model));
    }

    // Fix 5 (build plan): Strip trailing word "Drucker" from every printer model string.
    // 81 real titles end with "...für HP Laserjet Pro M227SDN Drucker" — the word
    // "Drucker" must be stripped; it is not part of the model name.
    printerModels = uniq(
      printerModels
        .map((m) => norm(m.replace(/\s+Drucker\s*$/i, '')))
        .filter((m) => m && !/^Drucker$/i.test(m))
    );

    if (printerBrand.toUpperCase() === 'OKI') {
      const cModels = [...cleanTitle.matchAll(/\b(C\d{3,4})\b/gi)].map((m) => m[1].toUpperCase());
      if (cModels.length > 1) {
        cartridgeModels = uniq([cModels[1], ...cartridgeModels.filter((m) => m.toUpperCase() !== cModels[0])]);
      }
    }

    // Final cartridge cleanup after all cartridge enrichments.
    const finalXlKeys = new Set(
      cartridgeModels
        .filter((m) => /\bXL\b/i.test(m))
        .map((m) => m.replace(/\s*XL\b/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase())
    );
    const finalXxlKeys = new Set(
      cartridgeModels
        .filter((m) => /\bXXL\b/i.test(m))
        .map((m) => m.replace(/\s*XXL\b/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase())
    );
    cartridgeModels = uniq(cartridgeModels.filter((m) => {
      const raw = m.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return /\bXL\b/i.test(m) || /\bXXL\b/i.test(m) || (!finalXlKeys.has(raw) && !finalXxlKeys.has(raw));
    }));
    const productBrand = detectProductBrand(cleanTitle, cartridgeModels, printerBrand);
    const extra = detectExtra(cleanTitle);

    const kbApplied = applyKnowledgeBaseRules(cleanTitle, {
      sku: cleanSku,
      category,
      cartridgeModels,
      brand: productBrand,
      productBrand,
      printerBrand,
      series,
      printerModels,
      bracketCodes,
      kompatibel,
      setOf: effectiveSetOf, // Fix 2: uses '1x' when color=Mehrfarbig and no explicit qty
      qty,
      color,
      extra
    });
    const normalizedElements = {
      ...kbApplied,
      // Treat printer series and model as one unified printer-model field.
      printerModels: mergeSeriesWithPrinterModels(kbApplied.series, kbApplied.printerModels),
      series: kbApplied.series
    };
    const verification = verifyExtraction(cleanTitle, normalizedElements);

    return {
      ...normalizedElements,
      verification
    };
  }

  static composeTitle(elements, originalTitle = '', options = {}) {
    const CHAR_LIMITS = {
      ebay:     { min: 70, max: 80,  ideal: 75  },
      amazon:   { min: 80, max: 200, ideal: 150 },
      kaufland: { min: 50, max: 100, ideal: 80  },
      otto:     { min: 50, max: 120, ideal: 90  }
    };
    const limits = CHAR_LIMITS[options.marketplace] || CHAR_LIMITS.ebay;
    const MIN_LEN = limits.min;
    const MAX_LEN = limits.max;
    const IDEAL = limits.ideal;

    const category = elements.category || 'Toner';
    const cartridgeModels = uniq(elements.cartridgeModels || []);
    const printerBrand = norm(elements.printerBrand || '');
    const bracketCodes = uniq(elements.bracketCodes || []);
    const sku = norm(elements.sku || '');
    const kompatibel = 'Kompatibel für';

    // Use variation overrides when present (from variation_details column in Excel)
    const qty = norm(elements.variationSetOf || elements.setOf || elements.qty || '');
    const color = norm(elements.variationColor || elements.color || '');

    // If a variation-specific printer model override exists, use it exclusively
    const printerModelsRaw = elements.variationPrinterModel
      ? [elements.variationPrinterModel]
      : mergeSeriesWithPrinterModels(elements.series || '', elements.printerModels || []);

    // Final safety net: filter out cartridge-derived noise from printer models
    // This catches leaks from KB override, cached data, or any other source
    const printerModelsClean = removeCartridgeDerivedPrinterNoise(
      printerModelsRaw, cartridgeModels, originalTitle
    );

    const printerBrandBlock = norm(printerBrand);
    const bracketBlock = norm(bracketCodes.join(' '));

    // Build tail with pipe separator per build plan format: "| 1x Schwarz"
    const tail = [qty, color].filter(Boolean).join(' ');
    const tailStr = tail ? ` | ${tail}` : '';

    let pm = [...printerModelsClean];
    if (pm.length >= 2) pm = swapLastTwo(pm);
    if (pm.length > 2) {
      const shift = stableHashInt(sku) % pm.length;
      pm = rotate(pm, shift);
    }

    const collapseModelPrefixes = (modelList) => {
      if (!modelList || modelList.length <= 1) return modelList || [];
      // Group by first word
      const groups = new Map();
      const order = [];
      for (const model of modelList) {
        const normed = norm(model);
        const firstWord = normed.split(/\s+/)[0] || '';
        if (!groups.has(firstWord)) { groups.set(firstWord, []); order.push(firstWord); }
        groups.get(firstWord).push(normed);
      }
      const result = [];
      for (const firstWord of order) {
        const items = groups.get(firstWord);
        if (items.length === 1) { result.push(items[0]); continue; }
        // Find longest common word-prefix across all items in this group
        const allParts = items.map((m) => m.split(/\s+/));
        let commonLen = allParts[0].length;
        for (let i = 1; i < allParts.length; i++) {
          let k = 0;
          while (k < commonLen && k < allParts[i].length &&
                 allParts[0][k].toUpperCase() === allParts[i][k].toUpperCase()) {
            k++;
          }
          commonLen = k;
        }
        // Only collapse when every item has at least one word beyond the common prefix
        const allHaveSuffix = items.every((m) => m.split(/\s+/).length > commonLen);
        if (commonLen >= 1 && allHaveSuffix) {
          const commonPrefix = allParts[0].slice(0, commonLen).join(' ');
          const suffixes = items.map((m) => m.split(/\s+/).slice(commonLen).join(' ')).filter(Boolean);
          result.push(norm(`${commonPrefix} ${suffixes.join(' ')}`));
        } else {
          result.push(...items);
        }
      }
      return result;
    };

    const keepMostSpecificModels = (modelList) => {
      const scored = (modelList || [])
        .map((m) => ({ raw: norm(m), key: compactAlphaNum(m) }))
        .filter((m) => m.raw && m.key);
      return scored
        .filter((current, i) => !scored.some((other, j) => {
          if (i === j) return false;
          if (other.key.length <= current.key.length) return false;
          return other.key.startsWith(current.key) || other.key.endsWith(current.key);
        }))
        .map((m) => m.raw);
    };

    const buildPrinterBlock = (models) => {
      const normalizedModels = keepMostSpecificModels(
        collapseModelPrefixes(uniq((models || []).map((m) => norm(m))))
      );
      return collapseAdjacentRepeatedPhrases(
        norm([printerBrandBlock, ...normalizedModels, bracketBlock].filter(Boolean).join(' '))
      );
    };

    const buildCandidates = (models) => {
      const printerBlock = buildPrinterBlock(models);
      const cbA = norm([...cartridgeModels, category].filter(Boolean).join(' ')); // models first
      const cbB = norm([category, ...cartridgeModels].filter(Boolean).join(' ')); // category first
      const cbs = cbA === cbB ? [cbA] : [cbA, cbB];
      const candidates = [];
      for (const cb of cbs) {
        candidates.push(
          norm([cb, kompatibel, printerBlock].filter(Boolean).join(' ')) + tailStr,
          norm([kompatibel, printerBlock, cb].filter(Boolean).join(' ')) + tailStr,
          norm([printerBlock, kompatibel, cb].filter(Boolean).join(' ')) + tailStr
        );
      }
      return candidates.filter(Boolean);
    };

    const INVALID_SCORE = 1_000_000;

    const scoreCandidate = (rawTitle, models) => {
      const collapsed = collapseAdjacentRepeatedPhrases(rawTitle);
      const title = truncateToMax(collapsed, MAX_LEN);
      const titleLower = title.toLowerCase();
      const compactTitle = compactAlphaNum(title);

      const hasKompatibel = /kompatibel\s+für/i.test(title);
      const hasBrand = !printerBrandBlock || titleLower.includes(printerBrandBlock.toLowerCase());
      const hasCategory = !category || titleLower.includes(String(category).toLowerCase());

      const cartTokens = cartridgeModels
        .map((cm) => compactAlphaNum(cm))
        .filter((token) => token.length >= 3);
      const presentCartCount = cartTokens.filter((token) => compactTitle.includes(token)).length;
      const hasAnyCartridge = cartTokens.length === 0 || presentCartCount > 0;

      const modelTokens = uniq((models || []).map((m) => compactAlphaNum(m))).filter((token) => token.length >= 3);
      const presentModelCount = modelTokens.filter((token) => compactTitle.includes(token)).length;
      const hasAnyModel = modelTokens.length === 0 || presentModelCount > 0;

      if (
        !hasKompatibel ||
        !hasAnyCartridge ||
        !hasBrand ||
        !hasCategory ||
        !hasAnyModel
      ) {
        return { title, score: INVALID_SCORE };
      }

      const lengthScore = scoreTitle(title, MIN_LEN, MAX_LEN, IDEAL);
      const missingCartridges = Math.max(0, Math.min(2, cartTokens.length) - Math.min(2, presentCartCount));
      const missingModels = Math.max(0, Math.min(2, modelTokens.length) - Math.min(2, presentModelCount));
      const completenessPenalty = missingCartridges * 15 + missingModels * 20;

      return {
        title,
        score: lengthScore + completenessPenalty
      };
    };

    let best = { title: '', score: Infinity, keep: pm.length, all: [] };
    let bestScored = [];
    const minKeep = pm.length > 0 ? 1 : 0;
    for (let keep = pm.length; keep >= minKeep; keep -= 1) {
      const models = pm.slice(0, keep);
      const cands = buildCandidates(models);
      const hasModels = models.length > 0;
      const scored = cands.map((raw) => {
        const padded = padIfShort(raw, MIN_LEN, MAX_LEN, hasModels);
        const { title, score } = scoreCandidate(padded, models);
        return {
          raw,
          title,
          score
        };
      });
      const localBest = scored.reduce(
        (acc, cur) =>
          cur.score < acc.score || (cur.score === acc.score && cur.title.length > acc.title.length)
            ? cur
            : acc,
        { title: '', score: Infinity }
      );
      if (localBest.score >= INVALID_SCORE) continue;
      if (
        localBest.score < best.score ||
        (localBest.score === best.score && localBest.title.length > (best.title || '').length)
      ) {
        best = { title: localBest.title, score: localBest.score, keep, all: cands };
        bestScored = scored;
      }
      if (best.score === 0) break;
    }

    const fallbackCandidates = buildCandidates(pm).map((raw) => {
      const padded = padIfShort(raw, MIN_LEN, MAX_LEN, pm.length > 0);
      const { title, score } = scoreCandidate(padded, pm);
      return { raw, title, score };
    });
    const fallbackTitle = truncateToMax(norm(originalTitle), MAX_LEN);
    const newTitle = best.score < INVALID_SCORE ? best.title : fallbackTitle;
    const candidatePool = bestScored.length ? bestScored : fallbackCandidates;
    const allCandidates = [];
    const seen = new Set();
    candidatePool
      .filter((entry) => entry.score < INVALID_SCORE)
      .sort((a, b) => a.score - b.score || b.title.length - a.title.length)
      .forEach((entry) => {
        const key = entry.title.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        allCandidates.push(entry.title);
      });
    if (!allCandidates.length) allCandidates.push(newTitle);
    if (!allCandidates.includes(newTitle)) {
      allCandidates.unshift(newTitle);
    }
    const status = newTitle && newTitle !== norm(originalTitle) ? 'generated' : 'fallback';

    return {
      newTitle,
      candidates: allCandidates.slice(0, 3),
      allCandidates: allCandidates.join(' | '),
      status,
      debug: {
        elements,
        charCount: newTitle.length,
        printerModelsUsed: pm.slice(0, best.keep),
        keepCount: best.keep,
        score: best.score
      }
    };
  }

  static isSupportedProduct(title) {
    const t = String(title || '');
    if (/\btoner|toners|tonerkartusche\b/i.test(t)) return true;
    if (/\btrommel|bildtrommel|drum\b/i.test(t)) return true;
    if (/\btintenpatronen?\b|\bdruckerpatrone\b|\bpatronen?\b|\bink\b/i.test(t)) return true;
    if (/\bLC[-\s]?\d{3,4}|PGI-?\d|CLI-?\d\b/i.test(t)) return true;
    return false;
  }

  static generate({ title, sku = '', marketplace = 'ebay' }) {
    const elements = this.extractComponents(title, sku);
    const composed = this.composeTitle(elements, title, { marketplace });
    return {
      elements,
      ...composed
    };
  }
}
