import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STANDALONE_LOGIN_CREDENTIALS } from '../config/standaloneLoginCredentials.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { URLS } from '../config/urls.js';
import { registrationEntityNames } from './entityNames.js';

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.resolve(frameworkRoot, process.env.HMB_USER_DATA_FILE || runSettings.userDataFile);

export async function saveRegisteredUser(user, testInfo, { env = process.env } = {}) {
  if (env.HMB_LOGIN_SOURCE === 'current-run') {
    const { filePath, identity } = registrationHandoff(testInfo, env);
    const record = { ...identity, user: { ...user, ...requireCredentials(user, 'Script 01') } };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return;
  }

  const targetPath = registeredUserPath(testInfo.project.name);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify({ ...user, baseUrl: URLS.loginUrl }, null, 2)}\n`, 'utf-8');
}

// This lookup supplies report metadata only. Standalone credentials and
// transaction selection are still resolved by their respective scripts.
export async function findRegisteredEntityNames(projectName, { loginName, entityName }) {
  if (!loginName && !entityName) return {};

  for (const filePath of new Set([registeredUserPath(projectName), registeredUserPath()])) {
    const user = await fs.readFile(filePath, 'utf-8').then(JSON.parse).catch(() => null);
    if (!user || (user.baseUrl && user.baseUrl !== URLS.loginUrl)) continue;
    const names = registrationEntityNames(user);
    if (loginName ? user.loginName === loginName : [names.legalName, names.dbaName].includes(entityName)) {
      return names;
    }
  }

  return {};
}

export async function loadLoginApplyUser(testInfo, {
  env = process.env,
  standaloneCredentials = STANDALONE_LOGIN_CREDENTIALS,
} = {}) {
  if (env.HMB_LOGIN_SOURCE !== 'current-run') {
    return {
      user: requireCredentials(standaloneCredentials, 'config/standaloneLoginCredentials.js'),
      freshRegistration: false,
    };
  }

  const { filePath, identity } = registrationHandoff(testInfo, env);
  let record;
  try {
    record = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch (error) {
    // JSON parse errors can include the contents of the credential file.
    throw new Error(`Script 01 did not save a readable registration handoff for this run (${error.code || 'invalid JSON'}).`);
  }
  if (Object.entries(identity).some(([key, value]) => record?.[key] !== value)) {
    throw new Error('The registration handoff belongs to a different HMB run, browser project, repeat, or URL.');
  }

  return {
    user: { ...record.user, ...requireCredentials(record.user, 'Script 01 registration handoff') },
    freshRegistration: true,
  };
}

function requireCredentials(credentials, source) {
  const loginName = typeof credentials?.loginName === 'string' ? credentials.loginName.trim() : '';
  const password = typeof credentials?.password === 'string' ? credentials.password : '';
  if (!loginName || !password.trim()) {
    throw new Error(`${source} must provide both loginName and password.`);
  }
  return { loginName, password };
}

function registrationHandoff(testInfo, env) {
  const filePath = env.HMB_REGISTRATION_PATH;
  const runId = env.HMB_FLOW_RUN_ID;
  const project = testInfo?.project?.name;
  const repeatIndex = Number(env.HMB_FLOW_REPEAT);
  if (!filePath || !path.isAbsolute(filePath) || !runId || !project
    || !Number.isInteger(repeatIndex) || repeatIndex < 0) {
    throw new Error('Current-run Login/Apply requires a registration handoff from scripts/run-hmb.mjs.');
  }
  return { filePath, identity: { runId, project, repeatIndex, baseUrl: URLS.loginUrl } };
}

export function registeredUserPath(projectName) {
  return projectName ? projectStorePath(projectName) : storePath;
}

function projectStorePath(projectName) {
  const safeProjectName = String(projectName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const parsed = path.parse(storePath);
  return path.join(parsed.dir, `${parsed.name}.${safeProjectName}${parsed.ext}`);
}
