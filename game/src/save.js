// Save / load through localStorage: cash, mission progress, packages, the
// player's position and health. Autosaves after every mission and at the
// safehouse; the title screen offers Continue when a save exists.
import { startMission } from './missions.js';

const KEY = 'solano-heat-save-v1';

export function saveGame(world) {
  try {
    const p = world.player;
    const data = {
      cash: world.cash,
      missionIndex: world.mission.done ? 6 : world.mission.index,
      packagesFound: world.packagesFound,
      faresDone: world.faresDone,
      foundPackages: world.city.packages.map((pkg) => pkg.found),
      player: { x: p.x, y: p.y, health: p.health, armor: p.armor, ammoClip: p.ammoClip, ammoReserve: p.ammoReserve },
      time: world.time,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try { return localStorage.getItem(KEY) !== null; } catch (e) { return false; }
}

/** Apply a loaded save onto a fresh world. */
export function applySave(world, data) {
  world.cash = data.cash || 0;
  world.packagesFound = data.packagesFound || 0;
  world.faresDone = data.faresDone || 0;
  if (Array.isArray(data.foundPackages)) {
    data.foundPackages.forEach((found, i) => {
      if (found && world.city.packages[i]) world.city.packages[i].found = true;
    });
  }
  const p = world.player;
  if (data.player) {
    p.x = data.player.x || p.x;
    p.y = data.player.y || p.y;
    p.health = data.player.health || p.health;
    p.armor = data.player.armor || 0;
    p.ammoClip = data.player.ammoClip ?? p.ammoClip;
    p.ammoReserve = data.player.ammoReserve ?? p.ammoReserve;
  }
  const idx = data.missionIndex || 0;
  if (idx >= 6) {
    world.mission.done = true;
    world.mission.active = false;
  } else {
    // Restart the current mission fresh from the mission state machine.
    world.mission.index = idx;
    startMission(world, idx);
  }
}
