/**
 * CartridgeModels - Known cartridge/toner model numbers
 * Used to distinguish cartridge models from printer models
 */

// Complete list of known cartridge model numbers
export const CARTRIDGE_MODELS = new Set([
  // LC Series (Brother Ink)
  'LC221', 'LC223', 'LC225', 'LC225XL', 'LC227', 'LC227XL',
  'LC980', 'LC980BK', 'LC980C', 'LC980M', 'LC980Y',
  'LC985', 'LC985BK', 'LC985C', 'LC985M', 'LC985Y',
  'LC1000', 'LC1000BK', 'LC1000C', 'LC1000M', 'LC1000Y',
  'LC1100', 'LC1100BK', 'LC1100C', 'LC1100M', 'LC1100Y',
  'LC1220', 'LC1240', 'LC1280', 'LC1280XL',
  'LC121', 'LC123', 'LC125', 'LC127', 'LC129',
  'LC-980', 'LC-985', 'LC-1000', 'LC-1100', 'LC-1220', 'LC-1240', 'LC-1280',
  'LC-121', 'LC-123', 'LC-125', 'LC-127', 'LC-129',
  'LC-221', 'LC-223', 'LC-225', 'LC-227',

  // TN Series (Brother Toner)
  'TN1050', 'TN-1050',
  'TN2000', 'TN-2000',
  'TN2005', 'TN-2005',
  'TN2010', 'TN-2010',
  'TN2110', 'TN-2110',
  'TN2120', 'TN-2120',
  'TN2210', 'TN-2210',
  'TN2220', 'TN-2220',
  'TN2310', 'TN-2310',
  'TN2320', 'TN-2320',
  'TN2410', 'TN-2410',
  'TN2420', 'TN-2420',
  'TN2510', 'TN-2510', 'TN2510XL', 'TN-2510XL',
  'TN230', 'TN-230', 'TN230BK', 'TN-230BK', 'TN230C', 'TN230M', 'TN230Y',
  'TN241', 'TN-241', 'TN241BK', 'TN-241BK', 'TN241C', 'TN241M', 'TN241Y',
  'TN242', 'TN-242', 'TN242BK', 'TN-242BK', 'TN242C', 'TN242M', 'TN242Y',
  'TN243', 'TN-243', 'TN243BK', 'TN-243BK', 'TN243C', 'TN243M', 'TN243Y', 'TN243CMYK',
  'TN245', 'TN-245', 'TN245BK', 'TN-245BK', 'TN245C', 'TN245M', 'TN245Y',
  'TN246', 'TN-246', 'TN246BK', 'TN-246BK', 'TN246C', 'TN246M', 'TN246Y',
  'TN247', 'TN-247', 'TN247BK', 'TN-247BK', 'TN247C', 'TN247M', 'TN247Y', 'TN247CMYK',
  'TN248', 'TN-248', 'TN248BK', 'TN-248BK', 'TN248C', 'TN248M', 'TN248Y', 'TN248XL',
  'TN249', 'TN-249', 'TN249BK', 'TN249C', 'TN249M', 'TN249Y',
  'TN3170', 'TN-3170',
  'TN3230', 'TN-3230',
  'TN3280', 'TN-3280',
  'TN3380', 'TN-3380',
  'TN3430', 'TN-3430',
  'TN3480', 'TN-3480',
  'TN3512', 'TN-3512',
  'TN3520', 'TN-3520',
  'TN421', 'TN-421', 'TN421BK', 'TN421C', 'TN421M', 'TN421Y',
  'TN423', 'TN-423', 'TN423BK', 'TN423C', 'TN423M', 'TN423Y',
  'TN426', 'TN-426', 'TN426BK', 'TN426C', 'TN426M', 'TN426Y',

  // DR Series (Brother Drum)
  'DR1050', 'DR-1050',
  'DR2000', 'DR-2000',
  'DR2100', 'DR-2100',
  'DR2200', 'DR-2200',
  'DR2300', 'DR-2300',
  'DR2400', 'DR-2400',
  'DR2510', 'DR-2510',
  'DR230', 'DR-230', 'DR230CL', 'DR-230CL',
  'DR241', 'DR-241', 'DR241CL', 'DR-241CL',
  'DR243', 'DR-243', 'DR243CL', 'DR-243CL',
  'DR247', 'DR-247', 'DR247CL', 'DR-247CL',
  'DR248', 'DR-248', 'DR248CL', 'DR-248CL',
  'DR3000', 'DR-3000',
  'DR3100', 'DR-3100',
  'DR3200', 'DR-3200',
  'DR3300', 'DR-3300',
  'DR3400', 'DR-3400',
  'DR421', 'DR-421',

  // MLT Series (Samsung)
  'MLTD101S', 'MLT-D101S',
  'MLTD103L', 'MLT-D103L',
  'MLTD1042S', 'MLT-D1042S',
  'MLTD1052L', 'MLT-D1052L',
  'MLTD111L', 'MLT-D111L',
  'MLTD111S', 'MLT-D111S',
  'MLTD116L', 'MLT-D116L',
  'MLTD116S', 'MLT-D116S',
  'MLTD203L', 'MLT-D203L',
  'MLTD204L', 'MLT-D204L',
  'MLTD205L', 'MLT-D205L',
  'MLTR116', 'MLT-R116',
  'MLTR204', 'MLT-R204',

  // CF Series (HP)
  'CF217A', 'CF-217A', '17A',
  'CF226A', 'CF-226A', '26A',
  'CF226X', 'CF-226X', '26X',
  'CF230A', 'CF-230A', '30A',
  'CF230X', 'CF-230X', '30X',
  'CF244A', 'CF-244A', '44A',
  'CF279A', 'CF-279A', '79A',
  'CF280A', 'CF-280A', '80A',
  'CF280X', 'CF-280X', '80X',
  'CF281A', 'CF-281A', '81A',
  'CF283A', 'CF-283A', '83A',
  'CF283X', 'CF-283X', '83X',
  'CF289A', 'CF-289A', '89A',
  'CF289X', 'CF-289X', '89X',
  'CF294A', 'CF-294A', '94A',
  'CF294X', 'CF-294X', '94X',
  'CF350A', 'CF-350A', 'CF351A', 'CF352A', 'CF353A',
  'CF380A', 'CF-380A', 'CF380X', 'CF381A', 'CF382A', 'CF383A',
  'CF400A', 'CF-400A', '201A',
  'CF400X', 'CF-400X', '201X',
  'CF401A', 'CF401X', 'CF402A', 'CF402X', 'CF403A', 'CF403X',
  'CF410A', 'CF-410A', '410A',
  'CF410X', 'CF-410X', '410X',
  'CF411A', 'CF411X', 'CF412A', 'CF412X', 'CF413A', 'CF413X',
  'CF530A', 'CF-530A', '205A',
  'CF531A', 'CF532A', 'CF533A',
  'CF540A', 'CF-540A', '203A',
  'CF540X', 'CF-540X', '203X',
  'CF541A', 'CF541X', 'CF542A', 'CF542X', 'CF543A', 'CF543X',

  // CE Series (HP)
  'CE250A', 'CE-250A', 'CE250X', 'CE251A', 'CE252A', 'CE253A',
  'CE255A', 'CE-255A', '55A',
  'CE255X', 'CE-255X', '55X',
  'CE260A', 'CE260X', 'CE261A', 'CE262A', 'CE263A',
  'CE278A', 'CE-278A', '78A',
  'CE285A', 'CE-285A', '85A',
  'CE310A', 'CE-310A', '126A', 'CE311A', 'CE312A', 'CE313A',
  'CE320A', 'CE-320A', '128A', 'CE321A', 'CE322A', 'CE323A',
  'CE390A', 'CE-390A', '90A',
  'CE390X', 'CE-390X', '90X',
  'CE400A', 'CE-400A', 'CE400X', 'CE401A', 'CE402A', 'CE403A',
  'CE410A', 'CE-410A', '305A', 'CE410X', 'CE411A', 'CE412A', 'CE413A',
  'CE505A', 'CE-505A', '05A',
  'CE505X', 'CE-505X', '05X',

  // Q Series (HP)
  'Q2612A', 'Q2612AD', '12A',
  'Q2613A', 'Q2613X', '13A', '13X',
  'Q5949A', 'Q5949X', '49A', '49X',
  'Q6000A', 'Q6001A', 'Q6002A', 'Q6003A', '124A',
  'Q7551A', 'Q7551X', '51A', '51X',
  'Q7553A', 'Q7553X', '53A', '53X',

  // W Series (HP)
  'W1106A', 'W-1106A', '106A',
  'W1350A', 'W-1350A', '135A',
  'W1350X', 'W-1350X', '135X',
  'W1420A', 'W-1420A', '142A',
  'W1470A', 'W-1470A', '147A',
  'W1470X', 'W-1470X', '147X',
  'W1490A', 'W-1490A', '149A',
  'W1490X', 'W-1490X', '149X',
  'W1510A', 'W-1510A', '151A',
  'W1510X', 'W-1510X', '151X',
  'W2030A', 'W-2030A', 'W2030X', '415A', '415X',
  'W2031A', 'W2032A', 'W2033A',
  'W2070A', 'W-2070A', '117A', 'W2071A', 'W2072A', 'W2073A',
  'W2110A', 'W-2110A', '206A',
  'W2110X', 'W-2110X', '206X',
  'W2111A', 'W2111X', 'W2112A', 'W2112X', 'W2113A', 'W2113X',
  'W2120A', 'W-2120A', '212A',
  'W2120X', 'W-2120X', '212X',
  'W2121A', 'W2121X', 'W2122A', 'W2122X', 'W2123A', 'W2123X',
  'W2210A', 'W-2210A', '207A',
  'W2210X', 'W-2210X', '207X',
  'W2211A', 'W2211X', 'W2212A', 'W2212X', 'W2213A', 'W2213X',
  'W2410A', 'W-2410A', 'W2410X', 'W2411A', 'W2412A', 'W2413A',

  // HP CB Series
  'CB435A', 'CB-435A', '35A',
  'CB436A', 'CB-436A', '36A',
  'CB540A', 'CB-540A', '125A', 'CB541A', 'CB542A', 'CB543A',

  // HP C Series
  'C7115A', 'C7115X', '15A', '15X',
  'C4096A', '96A',
  'C4092A', '92A',
  'C4182X', '82X',

  // Canon CRG/Cartridge Series
  'CRG045', 'CRG-045', '045',
  'CRG045H', 'CRG-045H', '045H',
  'CRG046', 'CRG-046', '046',
  'CRG046H', 'CRG-046H', '046H',
  'CRG051', 'CRG-051', '051',
  'CRG051H', 'CRG-051H', '051H',
  'CRG052', 'CRG-052', '052',
  'CRG052H', 'CRG-052H', '052H',
  'CRG054', 'CRG-054', '054',
  'CRG054H', 'CRG-054H', '054H',
  'CRG055', 'CRG-055', '055',
  'CRG055H', 'CRG-055H', '055H',
  'CRG067', 'CRG-067', '067',
  'CRG067H', 'CRG-067H', '067H',
  'CRG071', 'CRG-071', '071',
  'CRG071H', 'CRG-071H', '071H',
  'CRG702', 'CRG-702', '702',
  'CRG703', 'CRG-703', '703',
  'CRG707', 'CRG-707', '707',
  'CRG708', 'CRG-708', '708',
  'CRG712', 'CRG-712', '712',
  'CRG713', 'CRG-713', '713',
  'CRG716', 'CRG-716', '716',
  'CRG718', 'CRG-718', '718',
  'CRG719', 'CRG-719', '719',
  'CRG719H', 'CRG-719H', '719H',
  'CRG725', 'CRG-725', '725',
  'CRG726', 'CRG-726', '726',
  'CRG728', 'CRG-728', '728',
  'CRG729', 'CRG-729', '729',
  'CRG731', 'CRG-731', '731',
  'CRG737', 'CRG-737', '737',

  // Canon PGI/CLI Series (Ink)
  'PGI525', 'PGI-525', 'PGI525BK', 'PGI-525BK',
  'PGI550', 'PGI-550', 'PGI550XL', 'PGI-550XL',
  'PGI570', 'PGI-570', 'PGI570XL', 'PGI-570XL',
  'PGI580', 'PGI-580', 'PGI580XXL', 'PGI-580XXL',
  'PGI1500', 'PGI-1500', 'PGI1500XL', 'PGI-1500XL',
  'PGI2500', 'PGI-2500', 'PGI2500XL', 'PGI-2500XL',
  'CLI521', 'CLI-521',
  'CLI526', 'CLI-526',
  'CLI551', 'CLI-551', 'CLI551XL', 'CLI-551XL',
  'CLI571', 'CLI-571', 'CLI571XL', 'CLI-571XL',
  'CLI581', 'CLI-581', 'CLI581XXL', 'CLI-581XXL',

  // Kyocera TK Series
  'TK1115', 'TK-1115',
  'TK1125', 'TK-1125',
  'TK1140', 'TK-1140',
  'TK1150', 'TK-1150',
  'TK1160', 'TK-1160',
  'TK1170', 'TK-1170',
  'TK1248', 'TK-1248',
  'TK18', 'TK-18',
  'TK3100', 'TK-3100',
  'TK3110', 'TK-3110',
  'TK3130', 'TK-3130',
  'TK3150', 'TK-3150',
  'TK3160', 'TK-3160',
  'TK3170', 'TK-3170',
  'TK3190', 'TK-3190',
  'TK5220', 'TK-5220',
  'TK5230', 'TK-5230',
  'TK5240', 'TK-5240',
  'TK5270', 'TK-5270',
  'TK5280', 'TK-5280',
  'TK5430', 'TK-5430',
  'TK5440', 'TK-5440',

  // Kyocera DK Series (Drum)
  'DK1150', 'DK-1150',
  'DK170', 'DK-170',

  // Epson Series
  'E16XL', 'EP16XL', 'EP-16XL',
  'C13T', 'T0711', 'T0712', 'T0713', 'T0714',
  'T0801', 'T0802', 'T0803', 'T0804', 'T0805', 'T0806',
  'T1281', 'T1282', 'T1283', 'T1284',
  'T1291', 'T1292', 'T1293', 'T1294',
  'T1811', 'T1812', 'T1813', 'T1814',
  'T2621', 'T2631', 'T2632', 'T2633', 'T2634',
  'T2711', 'T2712', 'T2713', 'T2714',
  'T3351', 'T3361', 'T3362', 'T3363', 'T3364',
  'T3471', 'T3472', 'T3473', 'T3474',
  'T5021', 'T5022', 'T5023', 'T5024',
  '502', '502XL', '503', '503XL', '604', '604XL',

  // OKI Series (8-digit cartridge part numbers only - NOT printer models)
  '44973508', '44574302', '43979002', '44574307',
  '46508708', '46508709', '46508710', '46508711', '46508712',  // for C332/MC363 printers
  '46490608', '46490607', '46490606', '46490605',  // for C532/MC573 printers
  '45807102', '45807106', '45807111',  // for B412/B432/MB472 printers
  '44992402', '44992401',  // for B401/MB441 printers
  // Note: B4xx, C3xx, C5xx, MC3xx, MC5xx are PRINTER models, not cartridge models

  // Xerox Series
  '106R02775', '106R02777', '106R03480', '106R03620', '106R03622',

  // Ricoh/Aficio Series
  'SP150', 'SP200', 'SP201', 'SP204', 'SP211', 'SP213', 'SP277',
  'SP310', 'SP311', 'SP325', 'SP377',

  // Lexmark Series
  'E120', 'E250', 'E260', 'E360', 'E460',
  'MS310', 'MS312', 'MS315', 'MS317', 'MS410', 'MS415', 'MS417',
  'MS510', 'MS610', 'MX310', 'MX317', 'MX410', 'MX417', 'MX510', 'MX511',

  // Pantum Series
  'PA210', 'PA-210', 'PD219', 'PD-219',
  'CTL1100', 'CTL-1100', 'CTL2000', 'CTL-2000',

  // Dell Series
  'B1160', 'B1260', 'B1265',

  // HP Short codes (number + letter)
  '05A', '05X', '12A', '13A', '13X', '15A', '15X', '17A',
  '26A', '26X', '30A', '30X', '35A', '36A', '44A', '49A', '49X',
  '51A', '51X', '53A', '53X', '55A', '55X', '59A', '59X',
  '78A', '79A', '80A', '80X', '81A', '82X', '83A', '83X', '85A',
  '89A', '89X', '90A', '90X', '92A', '94A', '94X', '96A',
  '106A', '117A', '124A', '125A', '126A', '128A',
  '135A', '135X', '142A', '147A', '147X', '149A', '149X',
  '150A', '150X', '151A', '151X',
  '201A', '201X', '203A', '203X', '205A', '206A', '206X', '207A', '207X',
  '212A', '212X', '305A', '410A', '410X', '415A', '415X',

  // Suffix variants (XL, XXL, H)
  'XL', 'XXL'
]);

// Cartridge model prefixes for pattern matching
export const CARTRIDGE_PREFIXES = [
  'TN', 'DR', 'LC',                    // Brother
  'MLT', 'MLTR',                        // Samsung
  'CF', 'CE', 'CB', 'Q', 'W', 'C',      // HP
  'CRG', 'PGI', 'CLI',                  // Canon
  'TK', 'DK',                           // Kyocera
  'E', 'EP', 'T',                       // Epson
  'B', 'C', 'MC', 'MS', 'MX',           // OKI/Lexmark
  'SP', 'PA', 'PD', 'CTL'               // Ricoh/Pantum
];

// Patterns that look like cartridge prefixes but are actually PRINTER models
const PRINTER_MODEL_PATTERNS = [
  // OKI printer model patterns (these are PRINTERS, not cartridges)
  /^C[0-9]{3,}$/i,      // C332, C531, C532 - OKI color printers
  /^MC[0-9]{3,}$/i,     // MC363, MC563 - OKI multifunction centers
  /^B[0-9]{3,}$/i,      // B432, B512 - OKI mono printers
  /^MS[0-9]{3,}$/i,     // MS312, MS415 - Lexmark printers
  /^MX[0-9]{3,}$/i,     // MX310, MX410 - Lexmark multifunction
  // HP printer model patterns (M + numbers)
  /^M[0-9]{3,}$/i,      // M140, M148, M227 - HP LaserJet printer models
];

/**
 * Check if a token is a known cartridge model
 */
export function isCartridgeModel(token) {
  if (!token) return false;
  const upper = token.toUpperCase().replace(/-/g, '');

  // FIRST: Check if this is a known printer model pattern (NOT a cartridge)
  for (const pattern of PRINTER_MODEL_PATTERNS) {
    if (pattern.test(token)) {
      return false;  // This is a printer model, not a cartridge
    }
  }

  // Direct match in known cartridge models
  if (CARTRIDGE_MODELS.has(token) || CARTRIDGE_MODELS.has(upper)) {
    return true;
  }

  // Check with hyphen removed
  const noHyphen = token.replace(/-/g, '');
  if (CARTRIDGE_MODELS.has(noHyphen) || CARTRIDGE_MODELS.has(noHyphen.toUpperCase())) {
    return true;
  }

  // Check if it starts with a known prefix and contains numbers
  const hasNumber = /\d/.test(token);
  if (hasNumber) {
    for (const prefix of CARTRIDGE_PREFIXES) {
      if (upper.startsWith(prefix) && upper.length >= prefix.length + 1) {
        return true;
      }
    }
  }

  // Check for HP short code pattern (number + letter like "94X", "83A")
  if (/^\d{2,3}[AX]$/i.test(token)) {
    return true;
  }

  return false;
}

// Named exports are used directly:
// import { isCartridgeModel, CARTRIDGE_PREFIXES, CARTRIDGE_MODELS } from './CartridgeModels.js';
