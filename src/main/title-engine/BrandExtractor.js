/**
 * BrandExtractor - Extracts brand names from product titles
 * Supports a wide range of brands commonly sold on eBay.de
 */
export default class BrandExtractor {
  // Comprehensive brand list organized by category
  static BRANDS = {
    // Printer/Office brands
    printers: [
      'HP', 'Hewlett Packard', 'Brother', 'Canon', 'Epson', 'Xerox',
      'Kyocera', 'Lexmark', 'Ricoh', 'OKI', 'Dell', 'Konica Minolta',
      'Sharp', 'Toshiba', 'Panasonic', 'Olivetti', 'Utax', 'Triumph Adler',
      'Develop', 'Sagem', 'Philips'
    ],
    // Electronics brands
    electronics: [
      'Samsung', 'Apple', 'Sony', 'LG', 'Philips', 'Panasonic', 'Toshiba',
      'Asus', 'Acer', 'Lenovo', 'Microsoft', 'Google', 'Huawei', 'Xiaomi',
      'OnePlus', 'Oppo', 'Motorola', 'Nokia', 'HTC', 'ZTE', 'Realme',
      'JBL', 'Bose', 'Sennheiser', 'Beats', 'Marshall', 'Bang Olufsen',
      'Anker', 'Belkin', 'Logitech', 'Razer', 'Corsair', 'SteelSeries'
    ],
    // Home appliances
    appliances: [
      'Bosch', 'Siemens', 'Miele', 'AEG', 'Electrolux', 'Whirlpool',
      'Bauknecht', 'Gorenje', 'Beko', 'Grundig', 'Liebherr', 'Neff',
      'Gaggenau', 'Smeg', 'KitchenAid', 'Dyson', 'Rowenta', 'Tefal',
      'Krups', 'DeLonghi', 'Jura', 'Saeco', 'Braun', 'Philips', 'Remington'
    ],
    // Tools brands
    tools: [
      'Bosch', 'Makita', 'DeWalt', 'Metabo', 'Hilti', 'Festool', 'Milwaukee',
      'Einhell', 'Ryobi', 'Black Decker', 'Parkside', 'Dremel', 'Fein',
      'Kärcher', 'Stihl', 'Husqvarna', 'Gardena', 'Fiskars'
    ],
    // Fashion brands
    fashion: [
      'Nike', 'Adidas', 'Puma', 'Reebok', 'Asics', 'New Balance',
      'Converse', 'Vans', 'Timberland', 'Dr Martens', 'Birkenstock',
      'Levis', 'Tommy Hilfiger', 'Ralph Lauren', 'Hugo Boss', 'Calvin Klein',
      'Lacoste', 'Esprit', 'S Oliver', 'Tom Tailor', 'Jack Wolfskin',
      'The North Face', 'Mammut', 'Fjällräven', 'Patagonia'
    ],
    // Automotive brands
    automotive: [
      'Bosch', 'Continental', 'Hella', 'Osram', 'Philips', 'NGK',
      'Febi', 'Meyle', 'Sachs', 'Monroe', 'Bilstein', 'Brembo',
      'ATE', 'TRW', 'Mann Filter', 'Mahle', 'Valeo', 'Denso'
    ],
    // Toy brands
    toys: [
      'Lego', 'Playmobil', 'Hasbro', 'Mattel', 'Fisher Price', 'Schleich',
      'Ravensburger', 'Kosmos', 'Haba', 'Steiff', 'Simba', 'Bruder'
    ]
  };

  // Flat list of all brands for quick lookup
  static ALL_BRANDS = Object.values(BrandExtractor.BRANDS).flat();

  /**
   * Extract brand from title
   * Returns the first matching brand found
   */
  static extract(title = '') {
    if (!title) return '';

    // Sort brands by length (longest first) to match "Hewlett Packard" before "HP"
    const sortedBrands = [...this.ALL_BRANDS].sort((a, b) => b.length - a.length);

    for (const brand of sortedBrands) {
      // Escape special regex characters in brand name
      const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');

      if (regex.test(title)) {
        // Return properly capitalized brand name
        return this.normalizeBrand(brand);
      }
    }

    return '';
  }

  /**
   * Extract all brands from title (for products mentioning multiple brands)
   */
  static extractAll(title = '') {
    if (!title) return [];

    const found = [];
    const sortedBrands = [...this.ALL_BRANDS].sort((a, b) => b.length - a.length);

    for (const brand of sortedBrands) {
      const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');

      if (regex.test(title)) {
        found.push(this.normalizeBrand(brand));
      }
    }

    return found;
  }

  /**
   * Normalize brand capitalization
   */
  static normalizeBrand(brand) {
    // Brands that should be all uppercase
    const uppercaseBrands = ['HP', 'LG', 'AEG', 'JBL', 'HTC', 'ZTE', 'NGK', 'TRW', 'ATE', 'BMW', 'VW'];
    if (uppercaseBrands.includes(brand.toUpperCase())) {
      return brand.toUpperCase();
    }

    // Return as provided (preserves original casing)
    return brand;
  }
}
