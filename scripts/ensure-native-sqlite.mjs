import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import process from 'process';

const cwd = process.cwd();
const modulePath = path.join(
  cwd,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);
const markerPath = path.join(cwd, 'node_modules', '.cache', 'better-sqlite3-electron-rebuild.json');

function getFileInfo() {
  if (!existsSync(modulePath)) return '';
  try {
    return execSync(`file "${modulePath}"`, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function isHostArchCompatible() {
  const fileInfo = getFileInfo();
  if (!fileInfo) return false;

  if (process.platform === 'darwin') {
    const expectedArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : '';
    return fileInfo.includes('Mach-O') && (!expectedArch || fileInfo.includes(expectedArch));
  }

  if (process.platform === 'linux') return fileInfo.includes('ELF');
  if (process.platform === 'win32') return fileInfo.includes('PE32+');
  return true;
}

function getFingerprint() {
  const packageJsonPath = path.join(cwd, 'package.json');
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch {
    pkg = {};
  }

  const electronVersion =
    pkg?.devDependencies?.electron ||
    pkg?.dependencies?.electron ||
    'unknown';
  const sqliteVersion =
    pkg?.dependencies?.['better-sqlite3'] ||
    pkg?.devDependencies?.['better-sqlite3'] ||
    'unknown';

  return {
    value: `${process.platform}-${process.arch}|electron:${electronVersion}|better-sqlite3:${sqliteVersion}`,
    electronVersion,
    sqliteVersion
  };
}

function readMarker() {
  if (!existsSync(markerPath)) return null;
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeMarker(fingerprint) {
  const dir = path.dirname(markerPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const moduleMtimeMs = existsSync(modulePath) ? statSync(modulePath).mtimeMs : 0;
  const data = {
    fingerprint,
    moduleMtimeMs,
    updatedAt: new Date().toISOString()
  };
  writeFileSync(markerPath, JSON.stringify(data, null, 2));
}

function shouldSkipRebuild(fingerprint) {
  if (!isHostArchCompatible()) return false;
  const marker = readMarker();
  if (!marker) return false;
  if (marker.fingerprint !== fingerprint) return false;
  if (!existsSync(modulePath)) return false;

  const currentMtimeMs = statSync(modulePath).mtimeMs;
  return Number(marker.moduleMtimeMs) === Number(currentMtimeMs);
}

function rebuild() {
  console.log('[predev] Rebuilding better-sqlite3 for Electron runtime...');
  execSync('npx electron-rebuild -f -w better-sqlite3', { stdio: 'inherit' });
  console.log('[predev] Rebuild complete.');
}

const fingerprint = getFingerprint();

if (shouldSkipRebuild(fingerprint.value)) {
  console.log('[predev] better-sqlite3 cache valid. Skipping rebuild.');
  process.exit(0);
}

rebuild();

if (!isHostArchCompatible()) {
  throw new Error('better-sqlite3 binary is not compatible with current host architecture after rebuild.');
}

writeMarker(fingerprint.value);
console.log('[predev] better-sqlite3 is ready.');
