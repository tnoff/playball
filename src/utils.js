import { get } from './config.js';

const FAVORITES = get('favorites');

export function teamFavoriteStar(team) {
  const style = get('color.favorite-star') + '-fg';
  if (FAVORITES.includes(team.abbreviation)) {
    return `{${style}}★{/${style}} `;
  }
  return '';
}

/**
 * Get the sport ID for API calls
 * @returns {string} '51' for WBC, '1' for MLB
 */
export function getSportId() {
  // ENV override takes precedence
  const envSport = process.env.PLAYBALL_SPORT?.toLowerCase();
  const sport = envSport || get('sport') || 'mlb';

  return sport === 'wbc' ? '51' : '1';
}

/**
 * Get the current sport setting
 * @returns {string} 'mlb' or 'wbc'
 */
export function getSport() {
  const envSport = process.env.PLAYBALL_SPORT?.toLowerCase();
  return envSport || get('sport') || 'mlb';
}

/**
 * Format a batted ball's exit velocity, launch angle, and distance for
 * display, e.g. "102.6 MPH, 8° LA, 145 ft". Balls not tracked (some fouls)
 * have no launchSpeed and are left blank.
 * @param {object} hitData the pitch event's hitData
 * @returns {string} the formatted summary, or '' if untracked
 */
export function formatHitData(hitData) {
  if (!hitData || hitData.launchSpeed == null) {
    return '';
  }
  let text = `${hitData.launchSpeed} MPH`;
  if (hitData.launchAngle != null) {
    text += `, ${Math.round(hitData.launchAngle)}° LA`;
  }
  if (hitData.totalDistance) {
    text += `, ${Math.round(hitData.totalDistance)} ft`;
  }
  return text;
}
