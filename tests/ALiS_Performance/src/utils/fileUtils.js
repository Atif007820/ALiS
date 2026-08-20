import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function sanitizePathSegment(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'unnamed';
}

export function timestampForFolder(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('-');
}

export function scriptResultBase(scriptRelativePath) {
  const withoutExt = scriptRelativePath.replace(/\.jmx$/i, '');
  return withoutExt.split(/[\\/]+/).map(sanitizePathSegment);
}

export function createRunDirectory({ resultsRoot, scriptRelativePath, timestamp = timestampForFolder() }) {
  const parts = scriptResultBase(scriptRelativePath);
  const runDir = path.join(resultsRoot, ...parts, timestamp);
  ensureDir(runDir);
  return runDir;
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function fileExists(filePath) {
  return existsSync(filePath);
}
