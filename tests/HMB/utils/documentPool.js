import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documentDirectory = path.resolve(frameworkRoot, runSettings.documentDirectory);
const supportedExtensions = new Set(['.doc', '.docx', '.pdf', '.rtf', '.txt']);

export function availableDocuments() {
  if (!fs.existsSync(documentDirectory)) {
    throw new Error(`Upload document folder not found: ${documentDirectory}`);
  }

  const files = fs
    .readdirSync(documentDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => !fileName.startsWith('.') && fileName.toLowerCase() !== 'desktop.ini')
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => path.resolve(documentDirectory, fileName));

  if (!files.length) {
    throw new Error(
      `No uploadable documents found in ${documentDirectory}. Add at least one .doc, .docx, .pdf, .rtf, or .txt file.`,
    );
  }

  return files;
}

export function randomDocumentPath() {
  const files = availableDocuments();
  return files[Math.floor(Math.random() * files.length)];
}
