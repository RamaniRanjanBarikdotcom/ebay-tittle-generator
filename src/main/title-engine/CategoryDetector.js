/**
 * CategoryDetector - Detects product category from title
 * Supports multiple product categories for eBay.de listings
 */
export default class CategoryDetector {
  // Category patterns (German and English keywords)
  static CATEGORIES = {
    toner: [
      'toner', 'tonerkassette', 'tonerkartusche', 'toner cartridge',
      'lasertoner', 'tonerpulver'
    ],
    ink: [
      'tinte', 'tintenpatrone', 'ink', 'inkjet', 'druckerpatrone',
      'patronen', 'cartridge'
    ],
    drum: [
      'bildtrommel', 'trommel', 'drum', 'imaging unit', 'fotoleiter',
      'opc drum', 'trommeleinheit'
    ],
    electronics: [
      'smartphone', 'handy', 'tablet', 'laptop', 'notebook', 'computer',
      'monitor', 'fernseher', 'tv', 'kopfhörer', 'headphones', 'lautsprecher',
      'speaker', 'kamera', 'camera', 'smartwatch', 'konsole', 'gaming'
    ],
    fashion: [
      'shirt', 't-shirt', 'hemd', 'hose', 'jeans', 'jacke', 'jacket',
      'kleid', 'dress', 'schuhe', 'shoes', 'sneaker', 'pullover', 'sweater',
      'mantel', 'coat', 'bluse', 'rock', 'anzug', 'suit'
    ],
    tools: [
      'bohrmaschine', 'drill', 'schrauber', 'säge', 'saw', 'schleifer',
      'werkzeug', 'tool', 'akkuschrauber', 'hammer', 'zange', 'schraubendreher',
      'stichsäge', 'kreissäge', 'winkelschleifer', 'flex'
    ],
    automotive: [
      'bremsbelag', 'brake', 'ölfilter', 'luftfilter', 'filter', 'kupplung',
      'stoßdämpfer', 'zündkerze', 'scheibenwischer', 'batterie', 'reifen',
      'felge', 'scheinwerfer', 'auspuff', 'keilriemen'
    ],
    home: [
      'lampe', 'lamp', 'leuchte', 'möbel', 'furniture', 'teppich', 'carpet',
      'vorhang', 'curtain', 'bettwäsche', 'kissen', 'decke', 'regal', 'schrank'
    ]
  };

  /**
   * Detect category from title
   * Returns the most likely category
   */
  static detect(title = '') {
    if (!title) return 'general';

    const lower = title.toLowerCase();
    const scores = {};

    // Calculate score for each category
    for (const [category, keywords] of Object.entries(this.CATEGORIES)) {
      scores[category] = 0;
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          scores[category] += 1;
        }
      }
    }

    // Find category with highest score
    let bestCategory = 'general';
    let bestScore = 0;

    for (const [category, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    return bestScore > 0 ? bestCategory : 'general';
  }

  /**
   * Get all matching categories (for products that span multiple)
   */
  static detectAll(title = '') {
    if (!title) return ['general'];

    const lower = title.toLowerCase();
    const matches = [];

    for (const [category, keywords] of Object.entries(this.CATEGORIES)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          matches.push(category);
          break;
        }
      }
    }

    return matches.length > 0 ? matches : ['general'];
  }
}
