import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { paths } from '../../config/paths.js';

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function walkForJmx(dir, root, out = []) {
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkForJmx(fullPath, root, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jmx')) {
      const relativePath = toPosixPath(path.relative(root, fullPath));
      out.push({ relativePath, absolutePath: fullPath, fileName: entry.name });
    }
  }

  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function discoverJmxScripts(scriptRoot = paths.jmeterScriptRoot) {
  if (!existsSync(scriptRoot)) {
    throw new Error(`JMeter script root does not exist: ${scriptRoot}`);
  }

  const rootStat = statSync(scriptRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`JMeter script root is not a directory: ${scriptRoot}`);
  }

  return walkForJmx(scriptRoot, scriptRoot);
}

export function listJmxScripts(scriptRoot = paths.jmeterScriptRoot) {
  return discoverJmxScripts(scriptRoot).map((item) => item.relativePath);
}

export function resolveJmxScript(script, options = {}) {
  const scriptRoot = options.scriptRoot || paths.jmeterScriptRoot;
  if (!script) {
    throw new Error('Missing required --script value.');
  }

  const requested = script.replace(/\\/g, '/');
  const scripts = discoverJmxScripts(scriptRoot);

  const exact = scripts.find((item) => item.relativePath.toLowerCase() === requested.toLowerCase());
  if (exact) return exact;

  const byFileName = scripts.filter((item) => item.fileName.toLowerCase() === requested.toLowerCase());
  if (byFileName.length === 1) return byFileName[0];

  if (byFileName.length > 1) {
    const choices = byFileName.map((item) => item.relativePath).join('\n');
    throw new Error(`Multiple JMeter scripts named ${requested} were found.\n\nPlease specify one:\n\n${choices}`);
  }

  const available = scripts.map((item) => `  ${item.relativePath}`).join('\n');
  throw new Error(`JMeter script was not found: ${script}\n\nAvailable scripts:\n${available}`);
}
