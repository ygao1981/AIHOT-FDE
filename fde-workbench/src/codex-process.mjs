// Small, shell-free process boundary. This is original code; no T3 runtime dependency.
import { execFile as nodeExecFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

const windowsStops = new WeakMap();
function configurationError() {
  const error = new Error('Codex executable must be an absolute native path or a supported official npm entry.');
  error.code = 'cli_config';
  return error;
}

// npm's Windows .cmd/.ps1 launchers cannot be passed directly to spawn(shell:false).
// Resolve the documented official package entry instead of interpreting shell text.
export async function resolveCodexCommand(configured, options = {}) {
  const platform = options.platform ?? process.platform;
  const path = platform === 'win32' ? win32 : posix;
  if (typeof configured !== 'string' || !path.isAbsolute(configured) || configured.includes('\0')) throw configurationError();
  if (platform !== 'win32') return { command: configured, argsPrefix: [], shell: false };
  const extension = path.extname(configured).toLowerCase();
  if (extension === '.exe') return { command: configured, argsPrefix: [], shell: false };

  let packageRoot;
  if (/^codex\.(?:cmd|ps1)$/i.test(path.basename(configured))) {
    packageRoot = path.join(path.dirname(configured), 'node_modules', '@openai', 'codex');
  } else if (path.basename(configured).toLowerCase() === 'codex.js' && path.basename(path.dirname(configured)).toLowerCase() === 'bin') {
    packageRoot = path.dirname(path.dirname(configured));
  } else throw configurationError();

  const files = { readFile, stat, ...options.files };
  const entry = path.join(packageRoot, 'bin', 'codex.js');
  try {
    const metadata = JSON.parse(await files.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    if (metadata.name !== '@openai/codex' || metadata.bin?.codex !== 'bin/codex.js' || !(await files.stat(entry)).isFile()) throw configurationError();
  } catch { throw configurationError(); }
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  if (!path.isAbsolute(nodeExecutable) || path.extname(nodeExecutable).toLowerCase() !== '.exe') throw configurationError();
  return { command: nodeExecutable, argsPrefix: [entry], shell: false };
}

function environmentValue(env, name, platform) {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find(key => key.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

export function buildCodexEnvironment(config, directory, env = process.env, platform = process.platform) {
  const child = { LANG: 'C.UTF-8', CODEX_HOME: config.codexHome, HOME: directory };
  const path = environmentValue(env, 'PATH', platform);
  if (path) child.PATH = path;
  else if (platform !== 'win32') child.PATH = '/usr/local/bin:/usr/bin:/bin';
  for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY',
    ...(platform === 'win32' ? [] : ['https_proxy', 'http_proxy', 'all_proxy', 'no_proxy']), 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    const value = environmentValue(env, name, platform);
    if (value) child[name] = value;
  }
  if (platform === 'win32') {
    for (const name of ['SystemRoot', 'WINDIR', 'PATHEXT']) {
      const value = environmentValue(env, name, platform);
      if (value) child[name] = value;
    }
    child.USERPROFILE = directory;
    child.TEMP = directory;
    child.TMP = directory;
  }
  return child;
}

// Stop only the process started for this attempt. Never target a process name.
// Windows does not implement POSIX process groups; taskkill /T also stops npm's child.
export async function terminateCodexProcess(child, signal = 'SIGTERM', options = {}) {
  const platform = options.platform ?? process.platform;
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 1 || child.pid === process.pid) return false;
  if (platform !== 'win32') {
    try { (options.kill ?? process.kill)(-child.pid, signal); return true; }
    catch { try { return child.kill(signal); } catch { return false; } }
  }
  if (windowsStops.has(child)) return windowsStops.get(child);
  const stopped = new Promise(resolve => {
    const env = options.env ?? process.env;
    const systemRoot = environmentValue(env, 'SystemRoot', platform) || environmentValue(env, 'WINDIR', platform);
    const fallback = () => { try { child.kill('SIGKILL'); } catch {} resolve(false); };
    if (!systemRoot || !win32.isAbsolute(systemRoot)) return fallback();
    try {
      (options.execFile ?? nodeExecFile)(win32.join(systemRoot, 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'],
        { env, shell: false, windowsHide: true, timeout: 3000, maxBuffer: 64 * 1024 },
        error => { if (error) fallback(); else resolve(true); });
    } catch { fallback(); }
  });
  windowsStops.set(child, stopped);
  return stopped;
}
