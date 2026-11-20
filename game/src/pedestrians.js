// Pedestrians: sidewalk walkers who wander the blocks, chat, flee from
// gunfire and speeding cars, and (a few of them) hail taxis for the side job.
import { PED_COUNT } from './config.js';
import { clamp, dist } from './random.js';

const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function spawnPeds(world) {
  const rng = world.rng;
  world.peds = [];
  let guard = 0;
  while (world.peds.length < PED_COUNT && guard++ < 300) {
    const x = rng.range(120, 2280);
    const y = rng.range(120, 2260);
    if (world.city.isRoadAt(x, y)) continue;
    if (world.city.buildingHit(x, y, 14)) continue;
    if (dist(x, y, world.player.x, world.player.y) < 160) continue;
    world.peds.push(makePed(world, x, y));
  }
}

export function makePed(world, x, y) {
  const rng = world.rng;
  return {
    x, y, angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 52),
    health: 100, dead: false,
    state: 'walk', // walk | flee | dead | taxi | fare
    targetX: x, targetY: y, waitTimer: rng.range(0, 3),
    fleeTimer: 0, taxi: false, fare: null,
    shirt: rng.pick(SHIRTS), skin: rng.pick(SKINS),
    walkPhase: rng.range(0, Math.PI * 2),
  };
}

/** Pick a new sidewalk wander target near the ped. */
function pickWanderTarget(world, ped) {
  const rng = world.rng;
  for (let i = 0; i < 12; i++) {
    const x = clamp(ped.x + rng.range(-260, 260), 90, 2280);
    const y = clamp(ped.y + rng.range(-260, 260), 90, 2260);
    if (world.city.isRoadAt(x, y)) continue;
    if (world.city.buildingHit(x, y, 12)) continue;
    ped.targetX = x; ped.targetY = y;
    return;
  }
  ped.targetX = ped.x; ped.targetY = ped.y;
}

export function updatePeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.dead) continue;
    ped.walkPhase += dt * (ped.state === 'flee' ? 14 : 7);
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = away;
      const sp = 150;
      const nx = ped.x + Math.cos(away) * sp * dt;
      const ny = ped.y + Math.sin(away) * sp * dt;
      if (!world.city.buildingHit(nx, ped.y, 9)) ped.x = nx;
      if (!world.city.buildingHit(ped.x, ny, 9)) ped.y = ny;
      ped.x = clamp(ped.x, 30, 2280); ped.y = clamp(ped.y, 30, 2270);
      if (ped.fleeTimer <= 0) ped.state = ped.taxi ? 'taxi' : 'walk';
      continue;
    }
    if (ped.state === 'taxi' || ped.state === 'fare') continue; // stands still, waiting
    // Flee from gunfire or a fast car nearby.
    const threat = world.muzzle > 0 || (p.inCar && Math.abs(p.inCar.speed) > 200);
    if (threat && dist(ped.x, ped.y, p.x, p.y) < 220) {
      ped.state = 'flee';
      ped.fleeTimer = 3;
      continue;
    }
    if (ped.waitTimer > 0) { ped.waitTimer -= dt; continue; }
    const d = dist(ped.x, ped.y, ped.targetX, ped.targetY);
    if (d < 12) {
      ped.waitTimer = world.rng.range(1, 5);
      pickWanderTarget(world, ped);
      continue;
    }
    ped.angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    if (!world.city.buildingHit(nx, ped.y, 9)) ped.x = nx;
    if (!world.city.buildingHit(ped.x, ny, 9)) ped.y = ny;
  }
  // Top up the crowd near the player.
  if (world.peds.filter((q) => !q.dead).length < PED_COUNT - 6 && world.rng.chance(0.02)) {
    const pt = world.city.randomRoadPoint(world.rng);
    const x = clamp(pt.x + world.rng.range(-80, 80), 90, 2280);
    const y = clamp(pt.y + world.rng.range(-80, 80), 90, 2260);
    if (!world.city.buildingHit(x, y, 12) && dist(x, y, p.x, p.y) > 300 && dist(x, y, p.x, p.y) < 700) {
      world.peds.push(makePed(world, x, y));
    }
  }
}

/** A ped gets scared by a nearby gunshot. */
export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 3.5;
    }
  }
}
