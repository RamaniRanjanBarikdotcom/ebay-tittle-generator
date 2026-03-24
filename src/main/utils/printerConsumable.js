// Keywords that identify valid printer consumable products.
// Rules:
//  - 'patrone' is safe to use: gas products use "Gaskartusche/Gaskartuschen" (not "Gaspatrone")
//  - 'kartusche' is NOT used: too generic, matches "Gaskartuschen", "Gaskartusche"
//  - 'kompatibel' is a strong German signal: eBay printer listings always use "Kompatibel für HP/Brother/..."
//  - 'für brother' / 'für canon' / 'für epson' catch model-number-only titles like "10x LC 980 für Brother DCP..."
const PRINTER_CONSUMABLE_KEYWORDS = [
  // German — cartridge / toner terms
  'tintenpatrone',
  'druckerpatrone',
  'patrone',          // safe: gas products use "kartusche" not "patrone"
  'toner',
  'tonerkartusche',
  'tintenkartusche',
  'druckkartusche',
  'trommeleinheit',
  'druckertrommel',
  'kompatibel',       // "Kompatibel für HP ..." is always a printer consumable context
  // German — printer brand context (catches model-number-only titles like "10x LC980 für Brother DCP...")
  'für brother',
  'für canon',
  'für epson',
  'für kyocera',
  'für lexmark',
  'für samsung xpress',
  'für samsung clp',
  'für samsung scx',
  'für oki',
  // English
  'ink cartridge',
  'toner cartridge',
  'drum unit',
  'drum cartridge',
  'inkjet',
  'laser cartridge'
];

const PRINTER_CONSUMABLE_RE = new RegExp(
  PRINTER_CONSUMABLE_KEYWORDS.map((k) => k.replace(/\s+/g, '\\s+')).join('|'),
  'i'
);

export function isPrinterConsumable(title) {
  return PRINTER_CONSUMABLE_RE.test(title);
}
