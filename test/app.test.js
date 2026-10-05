// Render smoke test: boots the real, compiled app (dist/) headless and checks
// what ends up on screen. The unit tests cover pure functions; nothing else
// notices when a dependency bump (react, react-blessed, blessed, redux
// toolkit, axios, date-fns...) leaves the app unable to draw. Needs
// `npm run build` first (CI does).
//
// No terminal and no network: blessed is handed fake streams, and the app's
// hardcoded statsapi.mlb.com URLs are redirected to a local HTTP server by an
// axios request interceptor, so the real axios stack and thunks are exercised
// against canned responses.
import assert from 'assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
assert.ok(fs.existsSync(path.join(dist, 'main.js')), 'dist/main.js is missing: run `npm run build` before the app test');

// Isolate config before anything imports it (config.js reads at import time).
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'playball-app-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.XDG_CONFIG_HOME = path.join(home, 'config');
process.env.APPDATA = path.join(home, 'appdata');
process.env.PLAYBALL_SPORT = 'mlb';
process.env.NO_UPDATE_NOTIFIER = '1';

const { default: blessed } = await import('blessed');
const { default: axios } = await import('axios');

// --- canned API responses ----------------------------------------------------

const team = (id, name, abbreviation) => ({ id, name: `${name} Club`, teamName: name, abbreviation });

const scheduleResponse = {
  dates: [{
    games: [{
      gamePk: 900001,
      gameDate: '2026-07-04T23:05:00Z',
      doubleHeader: 'N',
      gameNumber: 1,
      scheduledInnings: 9,
      status: { abstractGameCode: 'P', detailedState: 'Scheduled', statusCode: 'S', startTimeTBD: false },
      teams: {
        away: { team: team(147, 'Yankees', 'NYY'), leagueRecord: { wins: 50, losses: 40 } },
        home: { team: team(111, 'Red Sox', 'BOS'), leagueRecord: { wins: 45, losses: 45 } },
      },
    }],
  }],
};

const teamRecord = (t, wins, losses, pct, gb) => ({
  team: t,
  wins,
  losses,
  winningPercentage: pct,
  gamesBack: gb,
  wildCardGamesBack: '-',
  streak: { streakCode: 'W2' },
  records: { splitRecords: [{ type: 'lastTen', wins: 6, losses: 4 }] },
});

const division = (id, leagueId, nameShort, teamRecords) => ({
  league: { id: leagueId },
  division: { id, nameShort },
  teamRecords,
});

const standingsResponse = {
  records: [
    division(201, 103, 'AL East', [
      teamRecord(team(147, 'Yankees', 'NYY'), 50, 40, '.556', '-'),
      teamRecord(team(111, 'Red Sox', 'BOS'), 45, 45, '.500', '5.0'),
    ]),
    division(204, 104, 'NL East', [
      teamRecord(team(144, 'Braves', 'ATL'), 55, 35, '.611', '-'),
    ]),
  ],
};

// A game that has not started: the smallest feed the game view will draw.
const pitcher = (id, fullName, jerseyNumber) => ({
  person: { id, fullName },
  jerseyNumber,
  seasonStats: { pitching: { wins: 9, losses: 3, era: '2.95', strikeOuts: 120 } },
});
const gameFeed = {
  gamePk: 900001,
  metaData: { wait: 10, timeStamp: '20260704_180000' },
  gameData: {
    status: { abstractGameCode: 'P', detailedState: 'Scheduled', statusCode: 'S', startTimeTBD: false },
    datetime: { dateTime: '2026-07-04T23:05:00Z' },
    venue: { name: 'Fenway Park', location: { city: 'Boston', stateAbbrev: 'MA' } },
    teams: {
      away: { ...team(147, 'Yankees', 'NYY'), record: { wins: 50, losses: 40 } },
      home: { ...team(111, 'Red Sox', 'BOS'), record: { wins: 45, losses: 45 } },
    },
    probablePitchers: { away: { id: 11 }, home: { id: 22 } },
  },
  liveData: {
    boxscore: {
      teams: {
        away: { players: { ID11: pitcher(11, 'Gerrit Cole', '45') } },
        home: { players: { ID22: pitcher(22, 'Brayan Bello', '66') } },
      },
    },
  },
};

const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.push(url.pathname);
  let body;
  if (url.pathname === '/api/v1/schedule') {
    body = scheduleResponse;
  } else if (url.pathname === '/api/v1/standings') {
    body = standingsResponse;
  } else if (url.pathname === '/api/v1.1/game/900001/feed/live') {
    body = gameFeed;
  }
  res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body || { message: `no fixture for ${url.pathname}` }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${server.address().port}`;

axios.interceptors.request.use(config => {
  config.url = config.url.replace('https://statsapi.mlb.com', apiBase);
  return config;
});

// --- headless blessed screen -------------------------------------------------

const input = new PassThrough();
const output = new PassThrough();
output.columns = 120;
output.rows = 40;
output.resume(); // discard the escape sequences instead of buffering them

// (Not .bind: blessed's Screen has its own static `bind`.)
const createScreen = blessed.screen;
blessed.screen = options => createScreen({ ...options, input, output, terminal: 'xterm-256color' });

const { default: startInterface } = await import(path.join(dist, 'main.js'));
const { default: getScreen } = await import(path.join(dist, 'screen.js'));
const { default: store } = await import(path.join(dist, 'store', 'index.js'));

// --- helpers -----------------------------------------------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function screenText() {
  const screen = getScreen();
  screen.render();
  return screen.lines.map(line => line.map(cell => cell[1]).join('')).join('\n');
}

async function waitFor(description, check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = check();
      if (last) {
        return last;
      }
    } catch (e) {
      last = e;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}. Screen was:\n${screenText()}\n(last: ${last})`);
}

const hasText = needle => () => screenText().includes(needle);

async function press(key) {
  input.write(key);
  await sleep(50);
}

// --- the test ----------------------------------------------------------------

let failed = false;
try {
  await startInterface({});

  // Schedule view: the default. Fetched over real HTTP, drawn by react-blessed.
  await waitFor('the schedule to draw', hasText('Yankees'));
  let text = screenText();
  assert.ok(text.includes('Red Sox'), 'schedule shows the home team');
  assert.ok(text.includes('(50-40)'), 'schedule shows team records');
  assert.ok(/Standings/.test(text), 'help bar lists the standings key');
  assert.ok(requests.includes('/api/v1/schedule'), 'the schedule was fetched from the API');
  assert.strictEqual(store.getState().schedule.error, null, 'schedule fetch had no error');

  // Standings view: a key press switches views, which fetches and draws a table.
  await press('s');
  await waitFor('the standings to draw', hasText('AL East'));
  text = screenText();
  assert.ok(text.includes('NL East'), 'standings draws both leagues');
  assert.ok(text.includes('Braves'), 'standings shows teams');
  assert.ok(text.includes('.556'), 'standings shows winning percentage');
  assert.ok(requests.includes('/api/v1/standings'), 'standings were fetched from the API');

  // Back to the schedule, then into a game: selecting a game fetches its feed
  // and draws the game view.
  await press('c');
  await waitFor('the schedule to return', hasText('Yankees'));
  await press('\r');
  await waitFor('the game view to draw', hasText('Fenway Park'));
  text = screenText();
  assert.ok(text.includes('Gerrit Cole'), 'game view shows the away probable pitcher');
  assert.ok(text.includes('Brayan Bello'), 'game view shows the home probable pitcher');
  assert.ok(requests.includes('/api/v1.1/game/900001/feed/live'), 'the game feed was fetched from the API');
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  try {
    getScreen().destroy();
  } catch (e) {
    // the screen is already gone
  }
  server.close();
  fs.rmSync(home, { recursive: true, force: true });
}

if (failed) {
  process.exit(1);
}
console.log('App render tests passed');
// The app polls on timers (schedule refresh, game updates) that would keep
// the process alive.
process.exit(0);
