import assert from 'assert';

import { formatHitData } from '../src/utils.js';

assert.strictEqual(
  formatHitData({ launchSpeed: 102.6, launchAngle: 8, totalDistance: 145 }),
  '102.6 MPH, 8° LA, 145 ft'
);
// Angle and distance round to whole numbers, speed keeps its precision
assert.strictEqual(
  formatHitData({ launchSpeed: 88.3, launchAngle: 39.0, totalDistance: 284.0 }),
  '88.3 MPH, 39° LA, 284 ft'
);
// A ball with no distance (e.g. a foul tip) skips that part
assert.strictEqual(
  formatHitData({ launchSpeed: 21.3, launchAngle: -30 }),
  '21.3 MPH, -30° LA'
);
// Untracked balls (launchSpeed missing) produce nothing to show
assert.strictEqual(formatHitData({ trajectory: 'ground_ball' }), '');
assert.strictEqual(formatHitData(undefined), '');
assert.strictEqual(formatHitData(null), '');

console.log('Utils tests passed');
