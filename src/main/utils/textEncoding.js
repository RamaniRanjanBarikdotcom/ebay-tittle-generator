const KNOWN_MOJIBAKE_MAP = [
  ['√§', 'ä'],
  ['√∂', 'ö'],
  ['√º', 'ü'],
  ['√Ñ', 'Ä'],
  ['√ñ', 'Ö'],
  ['√ú', 'Ü'],
  ['√ü', 'ß'],
  ['Ã¤', 'ä'],
  ['Ã¶', 'ö'],
  ['Ã¼', 'ü'],
  ['Ã„', 'Ä'],
  ['Ã–', 'Ö'],
  ['Ãœ', 'Ü'],
  ['ÃŸ', 'ß'],
  ['â€“', '–'],
  ['â€”', '—'],
  ['â€ž', '„'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['â€˜', '‘'],
  ['â€™', '’']
];

function badnessScore(input) {
  const text = String(input || '');
  const matches = text.match(/[ÃÂ√�]/g);
  return matches ? matches.length : 0;
}

export function fixMojibakeText(value) {
  if (value === null || value === undefined) return '';

  let output = String(value);
  for (const [from, to] of KNOWN_MOJIBAKE_MAP) {
    if (output.includes(from)) {
      output = output.split(from).join(to);
    }
  }

  if (/[ÃÂ]/.test(output)) {
    const repaired = Buffer.from(output, 'latin1').toString('utf8');
    if (badnessScore(repaired) < badnessScore(output)) {
      output = repaired;
    }
  }

  return output.normalize('NFC');
}
