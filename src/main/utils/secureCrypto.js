import crypto from 'crypto';
import os from 'os';
import { app } from 'electron';

const PREFIX = 'enc:v1:';
const BASE_PREFIX = 'base:v1:';

function getBaseKey() {
  const seed = [
    app.getName(),
    app.getPath('userData'),
    os.hostname(),
    process.env.USER || process.env.USERNAME || 'unknown'
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest();
}

function getKey() {
  const masterKey = process.env.ETG_MASTER_KEY || process.env.APP_SECRET_KEY;
  if (masterKey && String(masterKey).trim()) {
    return crypto.createHash('sha256').update(String(masterKey)).digest();
  }
  return getBaseKey();
}

function encryptWithKey(value, key, prefix = PREFIX) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (raw.startsWith(prefix)) return raw;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptWithKey(value, key, prefix = PREFIX) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (!raw.startsWith(prefix)) return raw;

  try {
    const payload = raw.slice(prefix.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function encryptText(value) {
  const key = getKey();
  return encryptWithKey(value, key, PREFIX);
}

export function decryptText(value) {
  const key = getKey();
  return decryptWithKey(value, key, PREFIX);
}

export function encryptWithBaseKey(value) {
  return encryptWithKey(value, getBaseKey(), BASE_PREFIX);
}

export function decryptWithBaseKey(value) {
  return decryptWithKey(value, getBaseKey(), BASE_PREFIX);
}

export function maskSecret(secret = '') {
  const value = String(secret || '');
  if (!value) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}
