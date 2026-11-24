// Sends mouse, keyboard and window commands to the operating system through a
// small helper process (Swift on macOS, PowerShell on Windows, xdotool on Linux).
const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

let proc = null;
let waiting = [];

function nativePath(...p) {
  const packaged = path.join(process.resourcesPath || '', 'native', ...p);
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'native', ...p);
}

function start() {
  if (proc || process.platform === 'linux') return;
  if (process.platform === 'darwin') {
    proc = spawn(nativePath('mac', 'input'), [], { stdio: ['pipe', 'pipe', 'ignore'] });
  } else if (process.platform === 'win32') {
    proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', nativePath('win', 'input.ps1')],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  }
  if (!proc) return;
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const w = waiting.shift();
      if (w) w(line);
    }
  });
  proc.on('exit', () => { proc = null; waiting.forEach((w) => w('')); waiting = []; });
  proc.on('error', () => { proc = null; });
}

// Linux: map the same commands onto xdotool, when it is installed.
const xkeys = {
  volup: 'XF86AudioRaiseVolume', voldown: 'XF86AudioLowerVolume', mute: 'XF86AudioMute',
  play: 'XF86AudioPlay', next: 'XF86AudioNext', prev: 'XF86AudioPrev',
  brightup: 'XF86MonBrightnessUp', brightdown: 'XF86MonBrightnessDown',
  missioncontrol: 'super', launchpad: 'super', desktop: 'super+d', search: 'super',
  screenshot: 'Print', lock: 'super+l', copy: 'ctrl+c', paste: 'ctrl+v', undo: 'ctrl+z',
  switchapp: 'alt+Tab', closewin: 'ctrl+w', enter: 'Return', backspace: 'BackSpace', esc: 'Escape',
  tab: 'Tab', space: 'space', left: 'Left', right: 'Right', up: 'Up', down: 'Down', delete: 'Delete',
};
function linux(line) {
  const [cmd, a = '', b = ''] = line.split(' ');
  const x = (...args) => execFile('xdotool', args, () => {});
  switch (cmd) {
    case 'move': return x('mousemove_relative', '--', a, b);
    case 'click': return a === 'right' ? x('click', '3') : x('click', '--repeat', a === 'double' ? '2' : '1', '1');
    case 'down': return x('mousedown', '1');
    case 'up': return x('mouseup', '1');
    case 'scroll': return Number(b) && x('click', Number(b) > 0 ? '5' : '4');
    case 'key': return x('key', xkeys[a] || a);
    case 'combo': return x('key', a.replace('cmd', 'ctrl'));
    case 'type': return x('type', '--', line.slice(5));
    case 'snap': return x('key', { left: 'super+Left', right: 'super+Right', max: 'super+Up', top: 'super+Up', bottom: 'super+Down', center: 'super+Down' }[a] || 'super+Up');
  }
}

function send(line) {
  line = String(line).replace(/[\r\n]+/g, ' ').slice(0, 2000);
  if (process.platform === 'linux') return linux(line);
  start();
  if (proc) proc.stdin.write(line + '\n');
}

// Ask the helper something that has an answer line (e.g. "trusted").
function ask(line) {
  start();
  if (!proc) return Promise.resolve(process.platform === 'linux' ? 'trusted 1' : '');
  return new Promise((resolve) => { waiting.push(resolve); proc.stdin.write(line + '\n'); });
}

async function hasPermission() {
  return (await ask('trusted')) === 'trusted 1';
}

function askPermission() { return ask('prompt'); }

function stop() { if (proc) proc.kill(); proc = null; }

module.exports = { send, hasPermission, askPermission, stop };
