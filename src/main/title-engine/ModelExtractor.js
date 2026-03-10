export default class ModelExtractor {
  static extract(title = '') {
    const matches = new Set();
    const tokens = title.match(/\b[A-Z0-9-]{4,}\b/gi) || [];
    for (const token of tokens) {
      if (!/[A-Z]/i.test(token)) continue;
      if (!/\d/.test(token)) continue;
      matches.add(token.toUpperCase());
    }

    return Array.from(matches);
  }
}
