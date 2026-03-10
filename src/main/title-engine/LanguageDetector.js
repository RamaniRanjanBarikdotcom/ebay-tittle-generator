export default class LanguageDetector {
  static detect(title = '') {
    const t = title.toLowerCase();
    const germanHints = ['kompatibel', 'für', 'tinte', 'toner', 'bildtrommel'];
    const englishHints = ['compatible', 'with', 'ink', 'toner', 'drum'];
    const germanScore = germanHints.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    const englishScore = englishHints.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    if (germanScore === 0 && englishScore === 0) return '';
    return germanScore >= englishScore ? 'de' : 'en';
  }
}
