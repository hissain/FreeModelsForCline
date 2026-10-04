#!/usr/bin/env node
// Cross-platform process manager for the proxy (Windows, macOS, Linux).
// Usage: node scripts/proxy.mjs <init|run|start|stop|restart|status|install-autostart|uninstall-autostart>

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..');
const ROUTER = join(ROOT, 'router.mjs');
const LOG_FILE = join(ROOT, 'proxy.log');
const PID_FILE = join(ROOT, '.proxy.pid');
const NODE = process.execPath;
const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux'

loadEnv(join(ROOT, '.env'));
const PORT = Number(process.env.PORT) || 8081;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function readPid() {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function health() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function tailLog(lines = 15) {
  if (!existsSync(LOG_FILE)) return;
  const all = readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  console.log(`\n--- Last ${Math.min(lines, all.length)} log lines (${LOG_FILE}) ---`);
  console.log(all.slice(-lines).join('\n'));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function init() {
  const env = join(ROOT, '.env');
  if (existsSync(env)) return console.log('.env already exists - leaving it untouched.');
  copyFileSync(join(ROOT, '.env.example'), env);
  console.log(`Created ${env}\nEdit it and add your API key(s).`);
}

// Foreground supervisor: runs router.mjs and restarts it 3s after any exit.
function run() {
  const existing = readPid();
  if (existing && existing !== process.pid && isAlive(existing)) {
    console.error(`Supervisor already running (PID ${existing}).`);
    process.exit(1);
  }
  writeFileSync(PID_FILE, String(process.pid));

  let child = null;
  let stopping = false;

  const launch = () => {
    console.log(`[${new Date().toISOString()}] [supervisor] Starting router on port ${PORT}...`);
    child = spawn(NODE, [ROUTER], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
    child.on('exit', (code, signal) => {
      child = null;
      if (stopping) process.exit(0);
      console.log(`[${new Date().toISOString()}] [supervisor] Router exited (${signal ?? `code ${code}`}). Restarting in 3 seconds...`);
      setTimeout(launch, 3000);
    });
  };

  const shutdown = () => {
    stopping = true;
    if (child) child.kill();
    else process.exit(0);
    setTimeout(() => process.exit(0), 3000).unref();
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, shutdown);
  process.on('exit', () => {
    if (readPid() === process.pid) rmSync(PID_FILE, { force: true });
  });

  launch();
}

async function start() {
  const pid = readPid();
  if (isAlive(pid)) return console.log(`Already running (supervisor PID ${pid}) on port ${PORT}.`);

  const out = openSync(LOG_FILE, 'a');
  const child = spawn(NODE, [SELF, 'run'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await sleep(250);
    if (await health()) {
      return console.log(`[OK] Proxy started in background (PID ${child.pid}) at http://localhost:${PORT}/v1`);
    }
  }
  console.log(`[!] Started supervisor (PID ${child.pid}) but port ${PORT} is not responding yet.`);
  console.log('    Check "npm run proxy:status" - a missing API key in .env is the usual cause.');
}

async function stop() {
  const pid = readPid();
  if (!isAlive(pid)) {
    rmSync(PID_FILE, { force: true });
    return console.log('Proxy is not running (no active supervisor found).');
  }
  if (PLATFORM === 'win32') {
    // process.kill() is a hard kill on Windows and would orphan the router; kill the whole tree.
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    process.kill(pid, 'SIGTERM'); // supervisor forwards shutdown to the router
  }
  for (let i = 0; i < 20 && isAlive(pid); i++) await sleep(250);
  rmSync(PID_FILE, { force: true });
  console.log(isAlive(pid) ? `[!] PID ${pid} did not exit.` : '[OK] Proxy stopped.');
}

async function restart() {
  await stop();
  await start();
}

async function status() {
  const pid = readPid();
  const h = await health();
  if (h) {
    console.log(`[OK] Proxy is RUNNING on port ${PORT}${isAlive(pid) ? ` (supervisor PID ${pid})` : ' (not started by this CLI)'}`);
    console.log(`[OK] Health: ${JSON.stringify(h)}`);
  } else if (isAlive(pid)) {
    console.log(`[!] Supervisor is running (PID ${pid}) but port ${PORT} is not responding (restarting or misconfigured).`);
  } else {
    console.log(`[X] Proxy is NOT running on port ${PORT}.`);
  }
  tailLog();
}

// ---------------------------------------------------------------------------
// Autostart (per-OS)
// ---------------------------------------------------------------------------

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hasSystemd = () => spawnSync('systemctl', ['--user', '--version'], { stdio: 'ignore' }).status === 0;

const winStartupDir = () => join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const WIN_SCRIPT = () => join(winStartupDir(), 'OpenRouterProxy.vbs');
const WIN_LEGACY_LNK = () => join(winStartupDir(), 'OpenRouterProxy.lnk'); // created by the old install-autostart.cmd
const MAC_PLIST = () => join(homedir(), 'Library', 'LaunchAgents', 'com.openrouter.proxy.plist');
const SYSTEMD_UNIT = () => join(homedir(), '.config', 'systemd', 'user', 'openrouter-proxy.service');
const XDG_DESKTOP = () => join(homedir(), '.config', 'autostart', 'openrouter-proxy.desktop');

async function installAutostart() {
  if (PLATFORM === 'win32') {
    // A tiny VBScript launches "proxy.mjs start" with no console window. UTF-16 LE + BOM so non-ASCII paths survive.
    const vbs = `CreateObject("Wscript.Shell").Run """${NODE}"" ""${SELF}"" start", 0, False\r\n`;
    mkdirSync(winStartupDir(), { recursive: true });
    rmSync(WIN_LEGACY_LNK(), { force: true });
    writeFileSync(WIN_SCRIPT(), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbs, 'utf16le')]));
    return console.log(`[OK] Startup entry created: ${WIN_SCRIPT()}`);
  }

  if (isAlive(readPid())) await stop(); // avoid a port clash with the OS-managed service

  if (PLATFORM === 'darwin') {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.openrouter.proxy</string>
  <key>ProgramArguments</key><array><string>${xmlEscape(NODE)}</string><string>${xmlEscape(ROUTER)}</string></array>
  <key>WorkingDirectory</key><string>${xmlEscape(ROOT)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>3</integer>
  <key>StandardOutPath</key><string>${xmlEscape(LOG_FILE)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(LOG_FILE)}</string>
</dict>
</plist>
`;
    mkdirSync(dirname(MAC_PLIST()), { recursive: true });
    spawnSync('launchctl', ['unload', MAC_PLIST()], { stdio: 'ignore' });
    writeFileSync(MAC_PLIST(), plist);
    const r = spawnSync('launchctl', ['load', '-w', MAC_PLIST()], { stdio: 'inherit' });
    return console.log(r.status === 0 ? `[OK] LaunchAgent installed and started: ${MAC_PLIST()}` : `[!] launchctl load failed (exit ${r.status}).`);
  }

  if (hasSystemd()) {
    const unit = `[Unit]
Description=OpenRouter free-model proxy
After=network-online.target

[Service]
WorkingDirectory=${ROOT}
ExecStart="${NODE}" "${ROUTER}"
Restart=always
RestartSec=3
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

[Install]
WantedBy=default.target
`;
    mkdirSync(dirname(SYSTEMD_UNIT()), { recursive: true });
    writeFileSync(SYSTEMD_UNIT(), unit);
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
    const r = spawnSync('systemctl', ['--user', 'enable', '--now', 'openrouter-proxy.service'], { stdio: 'inherit' });
    console.log(r.status === 0 ? `[OK] systemd user service installed and started: ${SYSTEMD_UNIT()}` : `[!] systemctl enable failed (exit ${r.status}).`);
    return console.log('    Tip: run "loginctl enable-linger $USER" to start it at boot, before you log in.');
  }

  // No systemd: fall back to an XDG autostart entry (runs at desktop login).
  const desktop = `[Desktop Entry]
Type=Application
Name=OpenRouter Proxy
Exec="${NODE}" "${SELF}" start
Terminal=false
`;
  mkdirSync(dirname(XDG_DESKTOP()), { recursive: true });
  writeFileSync(XDG_DESKTOP(), desktop);
  console.log(`[OK] XDG autostart entry created: ${XDG_DESKTOP()}`);
}

async function uninstallAutostart() {
  if (PLATFORM === 'win32') {
    rmSync(WIN_SCRIPT(), { force: true });
    rmSync(WIN_LEGACY_LNK(), { force: true });
    return console.log('[OK] Startup entry removed.');
  }
  if (PLATFORM === 'darwin') {
    spawnSync('launchctl', ['unload', MAC_PLIST()], { stdio: 'ignore' });
    rmSync(MAC_PLIST(), { force: true });
    return console.log('[OK] LaunchAgent removed.');
  }
  if (hasSystemd()) {
    spawnSync('systemctl', ['--user', 'disable', '--now', 'openrouter-proxy.service'], { stdio: 'ignore' });
    rmSync(SYSTEMD_UNIT(), { force: true });
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
  }
  rmSync(XDG_DESKTOP(), { force: true });
  console.log('[OK] Autostart entries removed.');
}

// ---------------------------------------------------------------------------

const commands = {
  init,
  run,
  start,
  stop,
  restart,
  status,
  'install-autostart': installAutostart,
  'uninstall-autostart': uninstallAutostart,
};

const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log(`Usage: node scripts/proxy.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(cmd ? 1 : 0);
}
await commands[cmd]();
