/**
 * Title Templates following eBay.de Guidelines
 * Format: [Brand] [Product Name] [Model No] [Variant] [Key Features]
 *
 * Brand MUST come first for Cassini algorithm optimization
 * Templates use placeholders that get replaced with actual values
 */
const templates = {
  // Toner cartridge templates - Brand first per eBay.de rules
  toner: [
    '{brand} {toner} {model} {compatible} {variant}',
    '{brand} {toner} {compatible} {model} {variant}',
    '{brand} {model} {toner} {compatible} {variant}'
  ],

  // Ink cartridge templates
  ink: [
    '{brand} {ink} {model} {compatible} {variant}',
    '{brand} {ink} {compatible} {model} {variant}',
    '{brand} {model} {ink} {compatible} {variant}'
  ],

  // Drum unit templates
  drum: [
    '{brand} {drum} {model} {compatible} {variant}',
    '{brand} {drum} {compatible} {model} {variant}',
    '{brand} {model} {drum} {compatible} {variant}'
  ],

  // Electronics templates
  electronics: [
    '{brand} {model} {product} {variant} {features}',
    '{brand} {product} {model} {variant} {features}',
    '{brand} {model} {variant} {features}'
  ],

  // Clothing/Fashion templates
  fashion: [
    '{brand} {product} {variant} {size} {features}',
    '{brand} {model} {product} {variant} {size}',
    '{brand} {product} {size} {variant}'
  ],

  // Tools templates
  tools: [
    '{brand} {product} {model} {variant} {features}',
    '{brand} {model} {product} {features} {variant}',
    '{brand} {product} {model} {features}'
  ],

  // General fallback templates
  general: [
    '{brand} {product} {model} {variant} {features}',
    '{brand} {model} {product} {variant}',
    '{brand} {product} {model} {variant}'
  ]
};

export default templates;
