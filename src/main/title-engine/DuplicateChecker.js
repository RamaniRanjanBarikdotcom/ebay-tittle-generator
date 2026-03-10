import { hashTitle } from '../../shared/utils/hash.js';

export default class DuplicateChecker {
  static isDuplicate(title, existingHashes = new Set(), salt = '') {
    const hash = hashTitle(`${title}||${salt}`);
    return existingHashes.has(hash);
  }

  static addHash(title, existingHashes = new Set(), salt = '') {
    const hash = hashTitle(`${title}||${salt}`);
    existingHashes.add(hash);
    return hash;
  }
}
