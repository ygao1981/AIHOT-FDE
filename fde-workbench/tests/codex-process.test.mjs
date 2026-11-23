import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexCommand, buildCodexEnvironment, terminateCodexProcess } from '../src/codex-process.mjs';

function windowsPackage(metadata = { name: '@openai/codex', bin: { codex: 'bin/codex.js' } }) {
  const prefix = 'C:\\Users\\Research User\\AppData\\Roaming\\npm';
  const entry = `${prefix}\\node_modules\\@openai\\codex\\bin\\codex.js`;
  const packageFile = `${prefix}\\node_modules\\@openai\\codex\\package.json`;
  const files = {
    async readFile(file) { assert.equal(file, packageFile); return JSON.stringify(metadata); },
    async stat(file) { assert.equal(file, entry); return { isFile: () => true }; },
  };
  return { prefix, entry, options: { platform: 'win32', nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe', files } };
}

test('native paths remain shell-free and retain spaces and metacharacters literally', async () => {
  assert.deepEqual(await resolveCodexCommand('/opt/Research & Notes/codex', { platform: 'linux' }),
    { command: '/opt/Research & Notes/codex', argsPrefix: [], shell: false });
  assert.deepEqual(await resolveCodexCommand('C:\\Research & Notes\\codex.exe', { platform: 'win32' }),
    { command: 'C:\\Research & Notes\\codex.exe', argsPrefix: [], shell: false });
  await assert.rejects(resolveCodexCommand('codex', { platform: 'win32' }), { code: 'cli_config' });
});

test('Windows official npm cmd, PowerShell and JS entries launch Node directly', async () => {
  const fixture = windowsPackage();
  for (const file of [`${fixture.prefix}\\codex.cmd`, `${fixture.prefix}\\codex.ps1`, fixture.entry]) {
    assert.deepEqual(await resolveCodexCommand(file, fixture.options), {
      command: fixture.options.nodeExecutable, argsPrefix: [fixture.entry], shell: false,
    });
  }
});

test('Windows resolver refuses arbitrary scripts and incompatible or incomplete npm packages', async () => {
  const fixture = windowsPackage();
  for (const name of ['start.bat', 'other.cmd', 'other.ps1', 'codex.bat']) {
    await assert.rejects(resolveCodexCommand(`${fixture.prefix}\\${name}`, fixture.options), { code: 'cli_config' });
  }
  for (const metadata of [
    { name: 'unrelated', bin: { codex: 'bin/codex.js' } },
    { name: '@openai/codex', bin: { codex: '../../elsewhere.js' } },
  ]) {
    const bad = windowsPackage(metadata);
    await assert.rejects(resolveCodexCommand(`${bad.prefix}\\codex.cmd`, bad.options), { code: 'cli_config' });
  }
  fixture.options.files.stat = async () => ({ isFile: () => false });
  await assert.rejects(resolveCodexCommand(`${fixture.prefix}\\codex.cmd`, fixture.options), { code: 'cli_config' });
});

test('Windows environment keeps OS and proxy settings but isolates secrets and profile paths', () => {
  const env = buildCodexEnvironment({ codexHome: 'C:\\Private Codex Login' }, 'C:\\Temp\\fde', {
    Path: 'C:\\Program Files\\nodejs', SYSTEMROOT: 'C:\\Windows', windir: 'C:\\Windows', PATHEXT: '.EXE;.CMD',
    https_proxy: 'http://proxy.example:3128', USERPROFILE: 'C:\\Private User', TEMP: 'C:\\Shared Temp',
    OPENAI_API_KEY: 'must-not-leak', CODEX_API_KEY: 'must-not-leak', NODE_OPTIONS: '--require=unsafe',
    DATABASE_URL: 'must-not-leak', FDE_ACCESS_TOKEN: 'must-not-leak',
  }, 'win32');
  assert.equal(env.PATH, 'C:\\Program Files\\nodejs');
  assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.HTTPS_PROXY, 'http://proxy.example:3128');
  assert.equal(env.CODEX_HOME, 'C:\\Private Codex Login');
  for (const key of ['HOME', 'USERPROFILE', 'TEMP', 'TMP']) assert.equal(env[key], 'C:\\Temp\\fde');
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'NODE_OPTIONS', 'DATABASE_URL', 'FDE_ACCESS_TOKEN', 'Path', 'https_proxy']) assert.equal(env[key], undefined);
});

test('POSIX environment retains explicit proxy variables and the original default search path', () => {
  const env = buildCodexEnvironment({ codexHome: '/private/login' }, '/tmp/fde', { https_proxy: 'http://proxy.example:3128', OPENAI_API_KEY: 'must-not-leak' }, 'linux');
  assert.equal(env.PATH, '/usr/local/bin:/usr/bin:/bin');
  assert.equal(env.https_proxy, 'http://proxy.example:3128');
  assert.equal(env.OPENAI_API_KEY, undefined);
});

test('Windows termination targets only the owned PID tree, without a command shell or duplicate kill', async () => {
  const calls = [];
  const child = { pid: 1234567, kill() { assert.fail('should stop whole tree'); } };
  const options = { platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    execFile(file, args, config, callback) { calls.push({ file, args, config }); callback(null); } };
  assert.equal(await terminateCodexProcess(child, 'SIGTERM', options), true);
  assert.equal(await terminateCodexProcess(child, 'SIGKILL', options), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'C:\\Windows\\System32\\taskkill.exe');
  assert.deepEqual(calls[0].args, ['/PID', '1234567', '/T', '/F']);
  assert.equal(calls[0].config.shell, false);
  assert.equal(calls[0].config.windowsHide, true);
});

test('Windows missing taskkill remains an unconfirmed tree stop; no process-name kill is attempted', async () => {
  let kills = 0;
  const child = { pid: 1234568, kill(signal) { assert.equal(signal, 'SIGKILL'); kills++; return true; } };
  assert.equal(await terminateCodexProcess(child, 'SIGTERM', { platform: 'win32', env: {} }), false);
  assert.equal(kills, 1);
});

test('POSIX termination signals the child process group and supports escalation', async () => {
  const calls = [], child = { pid: 1234569, kill() { assert.fail('process group exists'); } };
  const options = { platform: 'linux', kill(pid, signal) { calls.push([pid, signal]); } };
  await terminateCodexProcess(child, 'SIGTERM', options);
  await terminateCodexProcess(child, 'SIGKILL', options);
  assert.deepEqual(calls, [[-1234569, 'SIGTERM'], [-1234569, 'SIGKILL']]);
  assert.equal(await terminateCodexProcess({ pid: process.pid }, 'SIGTERM', options), false);
});
