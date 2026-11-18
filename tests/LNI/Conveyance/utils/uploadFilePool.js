import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_FILES_DIR } from '../config/runConfig.js';

export function listUploadFiles(directory = UPLOAD_FILES_DIR) {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter(item => item.isFile() && !/^(?:\.|~\$)/.test(item.name))
    .map(item => join(directory, item.name))
    .sort();
  if (!files.length) throw new Error(`No upload files found in ${directory}. Add a supporting document to UploadFiles.`);
  return files;
}
