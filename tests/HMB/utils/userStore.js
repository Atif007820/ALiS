import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.resolve(frameworkRoot, runSettings.userDataFile);

export async function saveRegisteredUser(user) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(user, null, 2)}\n`, 'utf-8');
}

export async function loadRegisteredUser() {
  const content = await fs.readFile(storePath, 'utf-8');
  return JSON.parse(content);
}

export function registeredUserPath() {
  return storePath;
}
