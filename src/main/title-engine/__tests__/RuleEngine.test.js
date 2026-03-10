import { describe, it, expect } from 'vitest';
import RuleEngine from '../RuleEngine.js';

describe('RuleEngine.extractComponents', () => {
  it('extracts qty as 2x from explicit quantity token', () => {
    const title = '2x TN-2420 Toner kompatibel für Brother MFC-L2710DW Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-1');
    expect(extracted.qty).toBe('2x');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('TN-2420');
  });

  it('does not treat cartridge short code like 94X as quantity', () => {
    const title = '94X CF294X Toner kompatibel für HP Laserjet Pro MFP M148dw Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-2');
    expect(extracted.qty).toBe('');
    const cart = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(cart).toContain('94X');
    expect(cart).toContain('CF294X');
  });

  it('extracts Trommel category and keeps bracket codes out of printer models', () => {
    const title =
      '1x TK-5240K Bildtrommel kompatibel für Kyocera Ecosys M5526cdw (SS296N) Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-3');
    expect(extracted.category).toBe('Trommel');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('TK-5240K');
    expect(extracted.bracketCodes).toContain('(SS296N)');
    expect(extracted.printerModels.map((x) => x.toUpperCase())).not.toContain('SS296N');
  });

  it('extracts ink category, color and series with lowercase printer suffix', () => {
    const title = 'CF294X 94X Ink kompatibel für HP Laserjet Pro MFP M148dw black';
    const extracted = RuleEngine.extractComponents(title, 'SKU-4');
    expect(extracted.category).toBe('Ink');
    expect(extracted.series).toMatch(/Laserjet Pro MFP/i);
    expect(extracted.color).toBe('Schwarz');
    expect(extracted.printerModels.map((x) => x.toUpperCase())).toContain('M148DW');
  });

  it('defaults to Toner when no drum/ink keywords are present', () => {
    const title = 'TN-2420 kompatibel für Brother MFC-L2710DW';
    const extracted = RuleEngine.extractComponents(title, 'SKU-5');
    expect(extracted.category).toBe('Toner');
  });

  it('keeps C532-like leading cartridge codes out of printer models', () => {
    const title = '1x C532 46490608 Toner Schwarz kompatibel für OKI C542DN';
    const extracted = RuleEngine.extractComponents(title, 'SKU-6');
    const cartridge = extracted.cartridgeModels.map((x) => x.toUpperCase());
    const printers = extracted.printerModels.map((x) => x.toUpperCase());
    expect(cartridge).toContain('C532');
    expect(cartridge).toContain('46490608');
    expect(printers).not.toContain('C532');
    expect(printers).toContain('C542DN');
  });

  it('extracts both 304A and CC530A cartridge models for HP color laserjet title', () => {
    const title = '1x 304A CC530A Toner Schwarz kompatibel für HP Color Laserjet CP2020D';
    const extracted = RuleEngine.extractComponents(title, 'SKU-7');
    const cartridge = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(extracted.category).toBe('Toner');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.series).toMatch(/Color Laserjet/i);
    expect(extracted.qty).toBe('1x');
    expect(extracted.color).toBe('Schwarz');
    expect(cartridge).toContain('304A');
    expect(cartridge).toContain('CC530A');
  });

  it('extracts optional product brand separately from printer brand', () => {
    const title = 'PrintPeak TN-2420 Toner kompatibel für Brother MFC-L2710DW Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-8');
    expect(extracted.brand).toBe('PrintPeak');
    expect(extracted.productBrand).toBe('PrintPeak');
    expect(extracted.printerBrand).toBe('Brother');
    expect(extracted.kompatibel).toBe('Kompatibel für');
  });

  it('keeps brand empty when product brand is not present', () => {
    const title = 'TN-2420 Toner kompatibel für Brother MFC-L2710DW Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-9');
    expect(extracted.brand).toBe('');
    expect(extracted.productBrand).toBe('');
    expect(extracted.printerBrand).toBe('Brother');
  });

  it('extracts set-of and kompatibel mit connector', () => {
    const title = 'PrintPeak CF283A Toner kompatibel mit HP Laserjet Pro M127fn 4er Set Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-10');
    expect(extracted.setOf).toBe('4er Set');
    expect(extracted.kompatibel).toBe('Kompatibel mit');
  });

  it('extracts from SPS CF259A example with page count set-of', () => {
    const title = 'SPS CF259A Toner Kompatibel für HP CF259/ 59A Toner-Kartusche| Schwarz| 3000 Pg';
    const extracted = RuleEngine.extractComponents(title, 'SKU-11');
    expect(extracted.brand).toBe('SPS');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('CF259A');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.printerModels.map((x) => x.toUpperCase())).toContain('59A');
    expect(extracted.setOf).toBe('3000 PG');
    expect(extracted.color).toBe('Schwarz');
    expect(extracted.extra).toBe('Toner-Kartusche');
  });

  it('extracts from SPS W2210 multipack example', () => {
    const title = 'SPS W2210 Toner Kompatibel für HP W2210A/ 207A Toner-Kartusche| 4x Multipack Set';
    const extracted = RuleEngine.extractComponents(title, 'SKU-12');
    expect(extracted.brand).toBe('SPS');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('W2210');
    expect(extracted.printerModels.map((x) => x.toUpperCase())).toContain('207A');
    expect(extracted.setOf).toBe('4x');
    expect(extracted.extra).toBe('Toner-Kartusche');
  });

  it('extracts Color LaserJet Pro series and page-count set-of', () => {
    const title = 'SPS W2210/ 207A Toner Kompatibel für HP Color LaserJet Pro Druckers| 3000 Seiten';
    const extracted = RuleEngine.extractComponents(title, 'SKU-13');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.series).toBe('Color LaserJet Pro');
    expect(extracted.setOf).toBe('3000 Seiten');
    expect(extracted.extra).toBe('Drucker');
  });

  it('extracts MFP series and numeric printer model tokens', () => {
    const title = 'Toner für HP CF350A-CF353A 130A Color LaserJet Pro MFP M170 M176N  177FW  DN';
    const extracted = RuleEngine.extractComponents(title, 'SKU-14');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.series).toBe('Color LaserJet Pro MFP');
    const printerModels = extracted.printerModels.map((x) => x.toUpperCase());
    expect(printerModels).toContain('M170');
    expect(printerModels).toContain('M176N');
    expect(printerModels.some((m) => m.includes('177FW'))).toBe(true);
  });

  it('extracts OKI DN pattern with XXL, BCYM and Patronen', () => {
    const title = 'Toner für OKI C532 DN C542 DN MC563 DN MC573DN XXL kompatibel Patronen B C Y M';
    const extracted = RuleEngine.extractComponents(title, 'SKU-15');
    expect(extracted.cartridgeModels).toContain('C542');
    expect(extracted.printerBrand).toBe('OKI');
    expect(extracted.printerModels).toContain('DN C542');
    expect(extracted.printerModels).toContain('DN MC563');
    expect(extracted.printerModels).toContain('DN MC573');
    expect(extracted.setOf).toBe('');
    expect(extracted.color).toBe('B C Y M');
    expect(extracted.extra).toBe('Patronen');
  });

  it('extracts Canon iSENSYS pattern with clean SPS brand and MF model', () => {
    const title = 'SPS 9435B002 CRG737 Tonerkartusche mit Chip kompatibel für Canon iSENSYS MF210';
    const extracted = RuleEngine.extractComponents(title, 'SKU-16');
    expect(extracted.brand).toBe('SPS');
    expect(extracted.cartridgeModels).toContain('CRG737');
    expect(extracted.printerBrand).toBe('Canon');
    expect(extracted.series).toBe('iSENSYS');
    expect(extracted.printerModels).toContain('MF210');
    expect(extracted.extra).toBe('Toner-Kartusche');
  });

  it('extracts Brother DCP models and series from TN2420 title', () => {
    const title = 'SPS TN2420 Tonerkartusche mit Chip kompatibel für Brother DCP-L2510D DCP-L2530DW';
    const extracted = RuleEngine.extractComponents(title, 'SKU-17');
    expect(extracted.brand).toBe('SPS');
    expect(extracted.cartridgeModels).toContain('TN2420');
    expect(extracted.printerBrand).toBe('Brother');
    expect(extracted.series).toBe('DCP-L');
    expect(extracted.printerModels).toContain('DCP-L2510D');
    expect(extracted.printerModels).toContain('DCP-L2530DW');
  });

  it('extracts Epson Expression Home XP ink title', () => {
    const title = '603XL Tintenpatrone Kompatibel für Epson Expression Home XP-4150 | 1x Cyan';
    const extracted = RuleEngine.extractComponents(title, 'SKU-18');
    expect(extracted.cartridgeModels).toContain('603XL');
    expect(extracted.category).toBe('Tintenpatrone');
    expect(extracted.printerBrand).toBe('Epson');
    expect(extracted.series).toBe('Expression Home XP');
    expect(extracted.printerModels).toContain('XP-4150');
    expect(extracted.setOf).toBe('1x');
    expect(extracted.color).toBe('Cyan');
  });

  it('extracts Epson Stylus D title with mehrfarbig', () => {
    const title = 'T0711 Tintenpatrone Kompatibel für Epson Stylus D 92 | Mehrfarbig';
    const extracted = RuleEngine.extractComponents(title, 'SKU-19');
    expect(extracted.cartridgeModels).toContain('T0711');
    expect(extracted.series).toBe('Stylus D');
    expect(extracted.printerModels).toContain('D 92');
    expect(extracted.color).toBe('Mehrfarbig');
  });

  it('extracts HP LaserJet Enterprise MFP M title', () => {
    const title = 'CF214A Toner Kompatibel für HP Laserjet Enterprise MFP M 725Z Plus | 1x Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-20');
    expect(extracted.cartridgeModels).toContain('CF214A');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.series).toBe('LaserJet Enterprise MFP M');
    expect(extracted.printerModels).toContain('M 725Z Plus');
    expect(extracted.setOf).toBe('1x');
    expect(extracted.color).toBe('Schwarz');
  });

  it('extracts HP OfficeJet Pro ink title', () => {
    const title = '940XL Tintenpatrone Kompatibel für HP Officejet Pro 8000 Wireless | 1x Cyan';
    const extracted = RuleEngine.extractComponents(title, 'SKU-21');
    expect(extracted.category).toBe('Tintenpatrone');
    expect(extracted.cartridgeModels).toContain('940XL');
    expect(extracted.series).toBe('OfficeJet Pro');
    expect(extracted.printerModels).toContain('8000 Wireless');
    expect(extracted.setOf).toBe('1x');
    expect(extracted.color).toBe('Cyan');
  });

  it('extracts Lexmark E toner title', () => {
    const title = 'E260/E260A11E Toner Kompatibel für Lexmark E 360 D | 1x Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-22');
    expect(extracted.printerBrand).toBe('Lexmark');
    expect(extracted.series).toBe('E');
    expect(extracted.printerModels).toContain('E 360 D');
    const cartridge = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(cartridge).toContain('E260');
    expect(cartridge).toContain('E260A11E');
    expect(extracted.setOf).toBe('1x');
    expect(extracted.color).toBe('Schwarz');
  });

  it('extracts W1106A with druckermodell extra and set-of', () => {
    const title = 'W1106A Toner Kompatibel für HP Druckermodell | 4X Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-23');
    expect(extracted.cartridgeModels).toContain('W1106A');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.setOf).toBe('4x');
    expect(extracted.color).toBe('Schwarz');
    expect(extracted.extra).toBe('Druckermodell');
  });

  it('expands CF cartridge range in HP title', () => {
    const title = 'Toner für HP CF540X- CF543X 203X MFP M 281 FDW M 254 DW M 254 NW MFP M 281 FDN';
    const extracted = RuleEngine.extractComponents(title, 'SKU-24');
    const cartridge = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(cartridge).toContain('CF540X');
    expect(cartridge).toContain('CF541X');
    expect(cartridge).toContain('CF542X');
    expect(cartridge).toContain('CF543X');
    expect(cartridge).toContain('203X');
    expect(extracted.printerBrand).toBe('HP');
  });

  it('extracts LC3213 patronen with brother j models', () => {
    const title = 'LC3213 Patronen für Brother DCP MFC j572dw j490 j491dw j497dw j890dw j890 j895dw';
    const extracted = RuleEngine.extractComponents(title, 'SKU-25');
    expect(extracted.category).toBe('Patronen');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('LC3213');
    expect(extracted.printerBrand).toBe('Brother');
    expect(extracted.series).toBe('DCP / MFC');
    const models = extracted.printerModels.map((x) => x.toUpperCase());
    expect(models).toContain('MFC-J572DW');
    expect(models).toContain('MFC-J490');
  });

  it('extracts Trommel title with Samsung Xpress SL-C spaced model', () => {
    const title = 'CLT-R406 Trommel Kompatibel für Samsung Xpress SL-C 410 W | 1x Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-26');
    expect(extracted.category).toBe('Trommel');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('CLT-R406');
    expect(extracted.printerBrand).toBe('Samsung');
    expect(extracted.series).toBe('Xpress SL');
    expect(extracted.printerModels).toContain('SL-C 410 W');
    expect(extracted.setOf).toBe('1x');
    expect(extracted.color).toBe('Schwarz');
  });

  it('extracts Druckerpatrone category with Diconix ESP 1.2 correctly', () => {
    const title = '1x SPS 3952371 30CLXL Druckerpatrone 3-Fabig kompatibel für Diconix ESP 1.2';
    const extracted = RuleEngine.extractComponents(title, 'SKU-27');
    expect(extracted.category).toBe('Druckerpatrone');
    expect(extracted.brand).toBe('SPS');
    expect(extracted.printerBrand).toBe('Diconix');
    expect(extracted.series).toBe('ESP');
    expect(extracted.printerModels).toContain('ESP 1.2');
    const cartridge = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(cartridge).toContain('3952371');
    expect(cartridge).toContain('30CLXL');
  });

  it('extracts Samsung Xpress M model and does not use XXL as set-of', () => {
    const title = 'MLT-D203L Toner Kompatibel für Samsung Xpress M 4020 | 1x Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-28');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('MLT-D203L');
    expect(extracted.category).toBe('Toner');
    expect(extracted.printerBrand).toBe('Samsung');
    expect(extracted.series).toBe('Xpress M');
    expect(extracted.printerModels).toContain('Xpress M 4020');
    expect(extracted.printerModels.map((x) => x.toUpperCase())).not.toContain('M4020');
    expect(extracted.setOf).toBe('1x');
    expect(extracted.color).toBe('Schwarz');
  });

  it('captures HP Laser spaced model from W1106A title and verifies as ok', () => {
    const title = 'W1106A XXL Toner Kompatibel für HP Laser 107 A | Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-29');
    const cart = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(cart).toContain('W1106A');
    expect(cart).toContain('XXL');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.series).toBe('Laser');
    expect(extracted.printerModels).toContain('Laser 107 A');
    expect(extracted.verification?.status).toBe('ok');
  });

  it('captures HP Laser MFP models and marks verification ok', () => {
    const title = 'W1106A XXL Toner Kompatibel für HP Laser MFP 133 PN | Schwarz';
    const extracted = RuleEngine.extractComponents(title, 'SKU-30');
    expect(extracted.printerBrand).toBe('HP');
    expect(extracted.series).toBe('Laser MFP');
    expect(extracted.printerModels).toContain('Laser MFP 133 PN');
    expect(extracted.verification?.issues || []).not.toContain('missing_printer_model');
    expect(extracted.verification?.status).toBe('ok');
  });

  it('extracts Canon PGI cartridge + OEM code and Pixma model correctly', () => {
    const title = 'PGI-550PGBKXL/ 6431B001 Tintenpatrone Kompatibel für Canon Pixma MG 6650 | 1x';
    const extracted = RuleEngine.extractComponents(title, 'SKU-31');
    const cartridge = extracted.cartridgeModels.map((x) => x.toUpperCase());
    expect(extracted.printerBrand).toBe('Canon');
    expect(cartridge).toContain('PGI-550PGBKXL');
    expect(cartridge).toContain('6431B001');
    expect(extracted.printerModels).toContain('Pixma MG 6650');
    expect(extracted.qty).toBe('1x');
  });

  it('extracts Samsung CLT-504S with Xpress SL-C 1810 OW without cartridge noise model', () => {
    const title = 'CLT-504S Toner Kompatibel für Samsung Xpress SL-C 1810 OW | Mehrfarbig';
    const extracted = RuleEngine.extractComponents(title, 'SKU-32');
    expect(extracted.cartridgeModels.map((x) => x.toUpperCase())).toContain('CLT-504S');
    expect(extracted.series).toBe('Xpress SL');
    const models = extracted.printerModels.map((x) => x.toUpperCase());
    expect(models).toContain('SL-C 1810 OW');
    expect(models).not.toContain('504S');
    expect(models).not.toContain('XPRESS SL 504S');
  });

  it('extracts Samsung CLX/CLP spaced printer models correctly', () => {
    const clxTitle = 'CLT-504S Toner Kompatibel für Samsung CLX 4195 FW | Mehrfarbig';
    const clx = RuleEngine.extractComponents(clxTitle, 'SKU-33');
    expect(clx.printerModels.map((x) => x.toUpperCase())).toContain('CLX 4195 FW');

    const clpTitle = 'CLT-504S Toner Kompatibel für Samsung CLP 415 N | Mehrfarbig';
    const clp = RuleEngine.extractComponents(clpTitle, 'SKU-34');
    expect(clp.printerModels.map((x) => x.toUpperCase())).toContain('CLP 415 N');
    expect(clp.printerModels.map((x) => x.toUpperCase())).not.toContain('504S');
  });
});

describe('RuleEngine.composeTitle', () => {
  it('builds candidates and primary title within 70-80 chars', () => {
    const title = 'TN-2420 Toner kompatibel für Brother MFC-L2710DW DCP-L2530DW Schwarz';
    const result = RuleEngine.generate({ title, sku: 'SKU-100' });
    expect(result.newTitle).toBeTruthy();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.newTitle.length).toBeGreaterThanOrEqual(70);
    expect(result.newTitle.length).toBeLessThanOrEqual(80);
  });

  it('is deterministic for same input/title+sku', () => {
    const input = {
      title: '87A CF287A Toner kompatibel für HP Laserjet Enterprise M506dh M506dn Schwarz',
      sku: 'HP-M506'
    };
    const first = RuleEngine.generate(input);
    const second = RuleEngine.generate(input);
    expect(first.newTitle).toBe(second.newTitle);
    expect(first.allCandidates).toBe(second.allCandidates);
  });
});
