// Deterministic screenshot scenes behind ?shot=chase|street|mission|sunset.
// Each scene sets the real world up (real cars, real police, a real mission
// in progress) and then plays it forward a fixed number of fixed steps with
// a simple autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';
import { angleDiff, clamp } from './random.js';

const DT = 1 / 60;

/** Synthetic input that drives a car toward (tx,ty), following the roads:
 * it steers at a lookahead point on the road centreline, so the car stays
 * centred in its lane instead of cutting corners or hugging walls. */
export function driveToTarget(world, input, tx, ty) {
  const car = world.player.inCar;
  const syn = { KeyW: true, KeyA: false, KeyD: false, Space: false, KeyE: false, KeyF: false, ShiftLeft: false, click: false };
  if (!car) { input.setSynthetic(syn); return syn; }
  const GRID_LINES = [150, 450, 750, 1050, 1350, 1650, 1950, 2250];
  const nearestLine = (v) => GRID_LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const LOOK = 200; // lookahead along the centreline, in px
  // The road the target sits on: the grid line closest to it.
  const txLine = nearestLine(tx);
  const tyLine = nearestLine(ty);
  const targetRoadHorizontal = Math.abs(ty - tyLine) <= Math.abs(tx - txLine);
  const roadVal = targetRoadHorizontal ? tyLine : txLine;
  const onTargetRoad = targetRoadHorizontal ? Math.abs(car.y - roadVal) < 45 : Math.abs(car.x - roadVal) < 45;
  let ax, ay;
  if (onTargetRoad) {
    // On the target road: look ahead along its centreline toward the target.
    if (targetRoadHorizontal) {
      const dir = Math.sign(tx - car.x) || 1;
      ax = Math.abs(tx - car.x) < LOOK ? tx : car.x + dir * LOOK;
      ay = roadVal;
    } else {
      const dir = Math.sign(ty - car.y) || 1;
      ax = roadVal;
      ay = Math.abs(ty - car.y) < LOOK ? ty : car.y + dir * LOOK;
    }
  } else if (targetRoadHorizontal) {
    // Drive along the car's current vertical road toward the target road.
    const vx = nearestLine(car.x);
    const dir = Math.sign(roadVal - car.y) || 1;
    if (Math.abs(car.x - vx) > 40) { ax = vx; ay = car.y; } // re-centre first
    else { ax = vx; ay = Math.abs(roadVal - car.y) < LOOK ? roadVal : car.y + dir * LOOK; }
  } else {
    const hy = nearestLine(car.y);
    const dir = Math.sign(roadVal - car.x) || 1;
    if (Math.abs(car.y - hy) > 40) { ax = car.x; ay = hy; } // re-centre first
    else { ax = Math.abs(roadVal - car.x) < LOOK ? roadVal : car.x + dir * LOOK; ay = hy; }
  }
  const want = Math.atan2(ay - car.y, ax - car.x);
  const diff = angleDiff(car.angle, want);
  const d = Math.hypot(ax - car.x, ay - car.y);
  if (onTargetRoad && Math.hypot(tx - car.x, ty - car.y) < 60) syn.KeyW = false;
  else if (d < 50) syn.KeyW = false;
  if (diff > 0.02) syn.KeyD = true;
  else if (diff < -0.02) syn.KeyA = true;
  // Brake for a big turn — but only at speed. At low speed the car must keep
  // the gas on, or it can neither turn nor move and deadlocks in place.
  if (Math.abs(diff) > 0.55 && Math.abs(car.speed) > 120) {
    syn.KeyW = false;
    if (Math.abs(car.speed) > 140) syn.Space = true;
  }
  if (Math.abs(diff) > 1.0 && Math.abs(car.speed) > 80) syn.Space = true;
  // Wedged against something? Back up briefly, then try again.
  const now = world.time;
  if (syn.KeyW && Math.abs(car.speed) < 25) {
    if (!car._stuckSince) car._stuckSince = now;
    if (now - car._stuckSince > 0.8) {
      syn.KeyW = false; syn.KeyS = true;
      const tmp = syn.KeyA; syn.KeyA = syn.KeyD; syn.KeyD = tmp; // steering flips in reverse
      if (now - car._stuckSince > 1.6) car._stuckSince = 0;
    }
  } else car._stuckSince = 0;
  input.setSynthetic(syn);
  return syn;
}

/** Synthetic input that walks the player toward (tx,ty). */
export function walkToTarget(world, input, tx, ty) {
  const p = world.player;
  const dx = tx - p.x, dy = ty - p.y;
  const syn = {
    KeyW: dy < -12, KeyS: dy > 12, KeyA: dx < -12, KeyD: dx > 12,
    ShiftLeft: false, KeyE: false, KeyF: false, Space: false, click: false,
    aimX: 640, aimY: 360,
  };
  input.setSynthetic(syn);
  return syn;
}

/** Step the world n fixed steps with the current synthetic input. */
function stepN(world, input, n) {
  for (let i = 0; i < n; i++) {
    stepWorldSafe(world, input);
    input.endFrame();
  }
}

import { stepWorld } from './world.js';
function stepWorldSafe(world, input) {
  stepWorld(world, DT, input);
}

/** Put the player in a car of `type` at (x,y) heading `angle`. */
function putPlayerInCar(world, type, x, y, angle, color) {
  const car = createCar(type, x, y, angle, color, 'none');
  world.vehicles.push(car);
  world.enterCar(car);
  car.speed = 0;
  return car;
}

/** A police cruiser chasing the player, placed behind at (x,y). */
function addCruiser(world, x, y) {
  const car = createCar('police', x, y, 0, '#1c2733', 'police');
  car.speed = 200;
  world.police.cruisers.push(car);
  world.vehicles.push(car);
  return car;
}

function stageChase(world, input) {
  world.sun = 1;
  // Player in a red sports car, eastbound on the Neon Row avenue.
  const car = putPlayerInCar(world, 'sports', 1050, 750, 0, '#ff2e63');
  car.speed = 320;
  // Two cruisers on the tail, sirens implied by the wanted level.
  addCruiser(world, 880, 766);
  addCruiser(world, 800, 734);
  world.wanted = 3;
  world.police.lastCrime = world.time;
  world.audio.siren(false);
  // Mission 6 in progress: the bank job, escape to the safehouse.
  startMission(world, 5);
  world.mission.stage = 1;
  const sh = world.city.landmarks.safehouse;
  world.mission.marker = { x: sh.x + sh.w / 2, y: sh.y + sh.h / 2, label: 'Safehouse', color: '#2ecc71' };
  world.cash = 2840;
  // A little traffic for depth: on the parallel road below, and one car
  // coming the other way far ahead — the player's lane stays clear.
  const t1 = createCar('taxi', 1350, 1066, 0, '#f7c948', 'traffic');
  t1.axis = 'x'; t1.dir = 1; t1.lane = 16; t1.speed = 140;
  world.vehicles.push(t1);
  const t2 = createCar('sedan', 1950, 734, Math.PI, '#2e6fb0', 'traffic');
  t2.axis = 'x'; t2.dir = -1; t2.lane = -16; t2.speed = 120;
  world.vehicles.push(t2);
  for (let i = 0; i < 60 * 6; i++) {
    driveToTarget(world, input, 2250, 750);
    stepWorldSafe(world, input);
    input.endFrame();
    // Stop while the car is still mid-frame and moving fast — a chase,
    // not a parked car at the edge of the map.
    if (car.x > 1800) break;
  }
  input.clearSynthetic();
}

function stageStreet(world, input) {
  world.sun = 1;
  // On foot in Neon Row, pistol out, peds and traffic all around.
  const p = world.player;
  p.x = 1350; p.y = 450;
  p.angle = Math.PI / 2;
  p.ammoClip = 9;
  p.ammoReserve = 48;
  world.cash = 620;
  // A taxi waiting right by the player, and a couple of parked cars.
  const taxi = createCar('taxi', 1418, 434, Math.PI / 2, '#f7c948', 'traffic');
  taxi.axis = 'y'; taxi.dir = 1; taxi.lane = 16; taxi.speed = 0;
  world.vehicles.push(taxi);
  const parked = createCar('coupe', 1382, 466, -Math.PI / 2, '#1abc9c', 'none');
  world.vehicles.push(parked);
  world.parkedCars.push(parked);
  // A hailing ped next to the taxi.
  const ped = world.peds.find((q) => !q.dead);
  if (ped) {
    ped.x = 1400; ped.y = 500; ped.state = 'taxi'; ped.taxi = true;
  }
  // Mission 1 is already active from createWorld; just place the scene.
  input.setSynthetic({ KeyW: false, KeyS: false, KeyA: false, KeyD: true, ShiftLeft: false, KeyE: false, KeyF: false, Space: false, click: false, aimX: 900, aimY: 300 });
  stepN(world, input, 60 * 2);
  input.clearSynthetic();
}

/** Remove parked cars near the staged route so the autopilot's path is clear. */
function clearParkedNearRoute(world, segments) {
  const nearSeg = (x, y) => {
    for (const [x1, y1, x2, y2] of segments) {
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - x1) * dx + (y - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + t * dx, py = y1 + t * dy;
      if (Math.hypot(x - px, y - py) < 130) return true;
    }
    return false;
  };
  world.vehicles = world.vehicles.filter((v) => !(v.driver === 'none' && nearSeg(v.x, v.y)));
  world.parkedCars = world.parkedCars.filter((v) => world.vehicles.includes(v));
}

function stageMission(world, input) {
  world.sun = 1;
  // Package Run, mid-delivery: timer running, first drop ahead.
  startMission(world, 1);
  world.mission.timer = 62;
  const car = putPlayerInCar(world, 'sedan', 1350, 750, 0, '#2e6fb0');
  car.speed = 240;
  world.cash = 940;
  // Keep the route (east to drop 1, south, then west to drop 2) clear.
  clearParkedNearRoute(world, [[1350, 750, 1650, 750], [1650, 750, 1650, 1650], [1650, 1650, 450, 1650]]);
  // A cash pickup on the sidewalk the player is passing.
  world.drops.push({ x: 1500, y: 800, amount: 150, taken: false, mission: false });
  const t1 = createCar('van', 1650, 734, 0, '#5d6d7e', 'traffic');
  t1.axis = 'x'; t1.dir = 1; t1.lane = 16; t1.speed = 110;
  world.vehicles.push(t1);
  for (let i = 0; i < 60 * 5; i++) {
    // Follow the live mission marker: drop 1, then drop 2, and so on.
    const mk = world.mission.marker || { x: 1650, y: 750 };
    driveToTarget(world, input, mk.x, mk.y);
    stepWorldSafe(world, input);
    input.endFrame();
  }
  input.clearSynthetic();
}

function stageSunset(world, input) {
  world.sun = 0.55;
  // Beach at sunset: the player's coupe parked by the lighthouse, skyline behind.
  const car = putPlayerInCar(world, 'coupe', 420, 2260, -Math.PI / 2, '#ff6b35');
  car.speed = 0;
  world.player.inCar = null;
  car.driver = 'none';
  world.player.x = 470;
  world.player.y = 2240;
  world.player.angle = -Math.PI / 2;
  world.cash = 1730;
  world.packagesFound = 7;
  startMission(world, 4);
  world.mission.timer = 96;
  // A couple of peds strolling the beachfront.
  const ped = world.peds.find((q) => !q.dead);
  if (ped) { ped.x = 560; ped.y = 2240; ped.state = 'walk'; }
  input.setSynthetic({ KeyW: false, KeyS: false, KeyA: false, KeyD: false, ShiftLeft: false, KeyE: false, KeyF: false, Space: false, click: false, aimX: 640, aimY: 200 });
  stepN(world, input, 60);
  input.clearSynthetic();
}

/**
 * Stage the named scene on a fresh world and return the screen to draw.
 * Any unknown name stages the street scene.
 */
export function stageShot(name, world, input) {
  world.cam.viewW = 1280;
  world.cam.viewH = 720;
  world.cam.zoom = 1;
  if (name === 'chase') stageChase(world, input);
  else if (name === 'mission') stageMission(world, input);
  else if (name === 'sunset') stageSunset(world, input);
  else stageStreet(world, input);
  // The banner has done its job (the objective bar still shows the mission);
  // clear it so the frame shows the city, not a title card.
  world.mission.banner = null;
  // Same for the message feed: staging plays through several mission starts
  // and police spawns, each pushing a banner, and shot mode holds the frame
  // without stepping, so nothing would ever expire. Keep only the single
  // most recent banner, at full opacity.
  world.messages = world.messages.slice(-1);
  if (world.messages.length > 0) world.messages[0].t = 4;
  // Centre the camera on the player for the final frame.
  const p = world.player;
  world.cam.x = clamp(p.x - 640, 0, 2400 - 1280);
  world.cam.y = clamp(p.y - 360, 0, 2400 - 720);
  if (world.debug) {
    const car = p.inCar;
    const near = world.vehicles
      .filter((v) => v !== car && Math.hypot(v.x - p.x, v.y - p.y) < 200)
      .map((v) => `${v.type}@(${Math.round(v.x)},${Math.round(v.y)},${v.driver},sp${Math.round(v.speed)})`).join(' ');
    const nearB = world.city.buildings
      .filter((b) => Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y) < 260)
      .map((b) => `b(${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)}x${Math.round(b.h)})`).join(' ');
    console.log(`SHOTDEBUG ${name} player=(${Math.round(p.x)},${Math.round(p.y)}) inCar=${!!car} ` +
      (car ? `car=(${Math.round(car.x)},${Math.round(car.y)}) sp=${Math.round(car.speed)} ang=${car.angle.toFixed(2)} hp=${Math.round(car.hp)}` : '') +
      ` wanted=${world.wanted} near=[${near}] bld=[${nearB}]`);
  }
  return 'play';
}
