import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STANDALONE_LOGIN_CREDENTIALS } from '../config/standaloneLoginCredentials.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.resolve(frameworkRoot, process.env.HMB_USER_DATA_FILE || runSettings.userDataFile);

export async function saveRegisteredUser(user, projectName) {
  const targetPath = projectName ? projectStorePath(projectName) : storePath;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(user, null, 2)}\n`, 'utf-8');
}

export async function loadRegisteredUser(projectName) {
  const targetPath = projectName ? projectStorePath(projectName) : storePath;

  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf-8'));
  } catch (error) {
    if (projectName === runSettings.defaultProject && error.code === 'ENOENT') {
      return JSON.parse(await fs.readFile(storePath, 'utf-8'));
    }
    throw error;
  }
}

export async function loadLoginApplyUser(projectName) {
  const credentials = {
    loginName: String(process.env.LOGIN_NAME || STANDALONE_LOGIN_CREDENTIALS.loginName || '').trim(),
    password: String(process.env.LOGIN_PASSWORD || STANDALONE_LOGIN_CREDENTIALS.password || '').trim(),
  };

  if (credentials.loginName && credentials.password) {
    return mergeLoginCredentials(null, credentials);
  }

  const savedUser = await loadRegisteredUser(projectName);
  return mergeLoginCredentials(savedUser, credentials);
}

export function mergeLoginCredentials(savedUser, credentials = {}) {
  const loginName = String(credentials.loginName || '').trim();
  const password = String(credentials.password || '').trim();

  if (!savedUser && (!loginName || !password)) {
    throw new Error('Both standalone loginName and password are required when no saved registered account is available.');
  }

  return {
    ...(savedUser || {}),
    ...(loginName ? { loginName } : {}),
    ...(password ? { password } : {}),
  };
}

export function registeredUserPath(projectName) {
  return projectName ? projectStorePath(projectName) : storePath;
}

function projectStorePath(projectName) {
  const safeProjectName = String(projectName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const parsed = path.parse(storePath);
  return path.join(parsed.dir, `${parsed.name}.${safeProjectName}${parsed.ext}`);
}
