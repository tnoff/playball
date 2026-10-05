// Smoke test for the compiled CLI (dist/cli.js). Covers the paths that are
// mostly third-party code -- commander parsing and the conf-backed `config`
// command -- so a dependency bump that breaks startup or config storage fails
// here instead of on a user's machine. Needs `npm run build` first (CI does).
import assert from 'assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist', 'cli.js');
assert.ok(fs.existsSync(cli), 'dist/cli.js is missing: run `npm run build` before the CLI tests');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Keep the user's real config out of the test, and the test out of it.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'playball-cli-'));
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: path.join(home, 'config'),
  APPDATA: path.join(home, 'appdata'),
  // Never let update-notifier go to the network or print a banner.
  NO_UPDATE_NOTIFIER: '1',
  CI: '1',
};
delete env.PLAYBALL_SPORT;

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 30000 });
  return { status: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

try {
  // commander wiring and package.json metadata
  let result = run('--version');
  assert.strictEqual(result.status, 0, result.err);
  assert.strictEqual(result.out, pkg.version);

  result = run('--help');
  assert.strictEqual(result.status, 0, result.err);
  assert.ok(result.out.includes('--replay <gameId>'), 'help lists --replay');
  assert.ok(result.out.includes('--date <date>'), 'help lists --date');
  assert.ok(result.out.includes('config'), 'help lists the config command');

  // conf-backed config round trip: default, set, get, list, unset
  result = run('config', 'sport');
  assert.strictEqual(result.status, 0, result.err);
  assert.strictEqual(result.out, 'mlb', 'sport defaults to mlb');

  result = run('config', 'sport', 'wbc');
  assert.strictEqual(result.status, 0, result.err);
  result = run('config', 'sport');
  assert.strictEqual(result.out, 'wbc', 'a set value persists across processes');

  // The value really is on disk, not just in that process
  const stored = fs.readdirSync(home, { recursive: true }).filter(f => String(f).endsWith('config.json'));
  assert.strictEqual(stored.length, 1, 'one config.json was written under the test home');

  result = run('config');
  assert.ok(/^sport = wbc$/m.test(result.out), 'config listing shows the stored value');
  assert.ok(/^color\.ball = green$/m.test(result.out), 'config listing flattens nested defaults');

  result = run('config', '--unset', 'sport');
  assert.strictEqual(result.status, 0, result.err);
  result = run('config', 'sport');
  assert.strictEqual(result.out, 'mlb', 'unset restores the default');

  // The config schema is enforced: an invalid value is rejected, not stored
  result = run('config', 'sport', 'cricket');
  assert.notStrictEqual(result.status, 0, 'an invalid enum value is rejected');
  result = run('config', 'sport');
  assert.strictEqual(result.out, 'mlb', 'a rejected value is not stored');
  result = run('config', 'color.ball', 'not-a-color');
  assert.notStrictEqual(result.status, 0, 'an invalid color is rejected by the schema pattern');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}

console.log('CLI tests passed');
