import { existsSync, readFileSync } from 'node:fs';

/**
 * Load KEY=VALUE pairs from a .env file into process.env.
 * Variables that are already set in the environment are never overridden.
 * Uses Node's built-in loader when available (Node 20.12+), otherwise a minimal fallback parser.
 * Returns true if the file existed and was loaded.
 */
export function loadEnv(file) {
  if (!existsSync(file)) return false;

  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(file);
    return true;
  }

  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}
