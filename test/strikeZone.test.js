import assert from 'assert';

import { get } from '../src/config.js';
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  getPitchCell,
  getPitchColor,
  getPitchEvents,
  getPitchMarker,
  getStrikeZoneRows
} from '../src/strikeZone.js';

// A zone the size of a real one. The top and bottom come from the API per
// pitch, and vary from batter to batter.
const ZONE_TOP = 3.21;
const ZONE_BOTTOM = 1.62;
const ZONE_MIDDLE = (ZONE_TOP + ZONE_BOTTOM) / 2;
const ZONE_EDGE_FT = 17 / 24;

const pitch = (pX, pZ, details = {}) => ({
  isPitch: true,
  details,
  pitchData: {
    strikeZoneTop: ZONE_TOP,
    strikeZoneBottom: ZONE_BOTTOM,
    coordinates: {pX, pZ},
  },
});
const cellOf = (pX, pZ) => {
  const {col, row} = getPitchCell(pitch(pX, pZ));
  return [col, row];
};

// The zone is drawn on the cells its own edges plot to. Nothing else keeps the
// drawing and the pitches in step, and this is what tells us a pitch shown on
// the line really was on the line.
const rows = getStrikeZoneRows([]);
// Cells are drawn a character apart, so a cell is at twice its column
const cellAt = (row, col) => rows[row][col * 2];
const [leftCol, topRow] = cellOf(-ZONE_EDGE_FT, ZONE_TOP);
const [rightCol, bottomRow] = cellOf(ZONE_EDGE_FT, ZONE_BOTTOM);
assert.strictEqual(cellAt(topRow, leftCol), '┌');
assert.strictEqual(cellAt(topRow, rightCol), '┐');
assert.strictEqual(cellAt(bottomRow, leftCol), '└');
assert.strictEqual(cellAt(bottomRow, rightCol), '┘');
// ... and that holds whatever the batter's zone is
[[3.5, 1.5], [4.0, 1.4], [2.9, 1.8]].forEach(([top, bottom]) => {
  const zoned = (pX, pZ) => getPitchCell({
    isPitch: true,
    details: {},
    pitchData: {strikeZoneTop: top, strikeZoneBottom: bottom, coordinates: {pX, pZ}},
  });
  assert.strictEqual(zoned(-ZONE_EDGE_FT, top).row, topRow);
  assert.strictEqual(zoned(-ZONE_EDGE_FT, top).col, leftCol);
  assert.strictEqual(zoned(ZONE_EDGE_FT, bottom).row, bottomRow);
  assert.strictEqual(zoned(ZONE_EDGE_FT, bottom).col, rightCol);
});

// Down the middle lands in the middle of the zone
const [midCol, midRow] = cellOf(0, ZONE_MIDDLE);
assert.strictEqual(midCol, (leftCol + rightCol) / 2);
assert.strictEqual(midRow, (topRow + bottomRow) / 2);
// A pitch above the zone is plotted above it, and below below it
assert.ok(cellOf(0, ZONE_TOP + 0.3)[1] < topRow);
assert.ok(cellOf(0, ZONE_BOTTOM - 0.3)[1] > bottomRow);
assert.ok(cellOf(-1, ZONE_MIDDLE)[0] < leftCol);
assert.ok(cellOf(1, ZONE_MIDDLE)[0] > rightCol);

// A pitch inside the grid is plotted with no indicator
assert.strictEqual(getPitchCell(pitch(0, ZONE_MIDDLE)).arrow, null);
// One outside it is pinned to the edge, with an arrow in the ring beyond
// saying it was further out than it looks
const wild = getPitchCell(pitch(2.58, ZONE_MIDDLE));
assert.strictEqual(wild.arrow, '▶');
assert.strictEqual(wild.col, GRID_WIDTH - 2);
assert.strictEqual(wild.arrowCol, GRID_WIDTH - 1);
assert.strictEqual(wild.arrowRow, wild.row);
const inDirt = getPitchCell(pitch(0, ZONE_BOTTOM - 3));
assert.strictEqual(inDirt.arrow, '▼');
assert.strictEqual(inDirt.row, GRID_HEIGHT - 2);
assert.strictEqual(inDirt.arrowRow, GRID_HEIGHT - 1);
// Off in both directions at once gets a corner
assert.strictEqual(getPitchCell(pitch(-2.5, ZONE_TOP + 3)).arrow, '◤');
assert.strictEqual(getPitchCell(pitch(2.5, ZONE_TOP + 3)).arrow, '◥');
assert.strictEqual(getPitchCell(pitch(-2.5, ZONE_BOTTOM - 3)).arrow, '◣');
assert.strictEqual(getPitchCell(pitch(2.5, ZONE_BOTTOM - 3)).arrow, '◢');

// A pitch the API didn't locate isn't plotted
assert.strictEqual(getPitchCell({pitchData: {}}), null);
assert.strictEqual(getPitchCell({}), null);
assert.strictEqual(getPitchCell({pitchData: {
  strikeZoneTop: ZONE_TOP, strikeZoneBottom: ZONE_BOTTOM, coordinates: {}
}}), null);
assert.strictEqual(getPitchCell({pitchData: {
  strikeZoneTop: 2, strikeZoneBottom: 2, coordinates: {pX: 0, pZ: 2}
}}), null);

// Markers follow the API's pitch number, so the zone and the pitch list agree
// even when a pitch in between wasn't located
assert.strictEqual(getPitchMarker({pitchNumber: 1}), '1');
assert.strictEqual(getPitchMarker({pitchNumber: 9}), '9');
assert.strictEqual(getPitchMarker({pitchNumber: 10}), 'a');
assert.strictEqual(getPitchMarker({pitchNumber: 12}), 'c');
assert.strictEqual(getPitchMarker({pitchNumber: 36}), '*');
assert.strictEqual(getPitchMarker({}, 4), '5');
assert.strictEqual(getPitchMarker({pitchNumber: 3}, 0), '3');

assert.strictEqual(getPitchColor({details: {isInPlay: true, isStrike: true}}), get('color.in-play-no-out'));
assert.strictEqual(getPitchColor({details: {isStrike: true}}), get('color.strike'));
assert.strictEqual(getPitchColor({details: {isBall: true}}), get('color.ball'));
assert.strictEqual(getPitchColor({details: {}}), get('color.other-event'));

assert.deepStrictEqual(getPitchEvents(undefined), []);
assert.deepStrictEqual(getPitchEvents([{isPitch: false}]), []);
assert.strictEqual(getPitchEvents([{isPitch: true}, {isPitch: false}]).length, 1);

// The grid is the size the live game view lays out for it, and every line is
// the same width so the zone doesn't shear
assert.strictEqual(rows.length, GRID_HEIGHT);
rows.forEach(row => assert.strictEqual(row.length, GRID_WIDTH * 2 - 1));

// A located pitch is drawn on the zone, an unlocated one is skipped, and both
// leave the grid the same size
const drawn = getStrikeZoneRows([
  pitch(0, ZONE_MIDDLE, {isStrike: true}),
  {isPitch: true, details: {}, pitchData: {}},
  {isPitch: false, details: {}},
]);
assert.strictEqual(drawn.length, GRID_HEIGHT);
assert.ok(drawn[midRow].includes('{bold}1{/bold}'));
assert.ok(!drawn.join('\n').includes('{bold}2{/bold}'));

console.log('Strike zone tests passed');
