import crypto from 'crypto';
import os from 'os';
import { app } from 'electron';

const PREFIX = 'enc:v1:';

function getKey() {
  const seed = [
    app.getName(),
    app.getPath('userData'),
    os.hostname(),
    process.env.USER || process.env.USERNAME || 'unknown'
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptText(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (raw.startsWith(PREFIX)) return raw;

  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptText(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (!raw.startsWith(PREFIX)) return raw;

  try {
    const payload = raw.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(secret = '') {
  const value = String(secret || '');
  if (!value) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}
