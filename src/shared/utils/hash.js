import crypto from 'crypto';

export function hashTitle(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}
