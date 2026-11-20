// Wanted level and the police who answer it: cruisers that chase and ram,
// foot cops who chase and try to bust the player, roadblocks at 4+ stars,
// and wanted decay when the player stays clean and out of sight.
import { WANTED } from './config.js';
import { clamp, dist, angleDiff } from './random.js';
import { createCar, pushOutOfBuilding } from './vehicles.js';
import { damagePlayer, killCop } from './player.js';

export function createPoliceState() {
  return { cruisers: [], cops: [], roadblocks: [], lastCrime: -999, bustTimer: 0 };
}

export function addWanted(world, stars, reason) {
  if (stars <= 0) return;
  const before = world.wanted;
  world.wanted = clamp(world.wanted + stars, 0, WANTED.maxStars);
  world.police.lastCrime = world.time;
  if (reason) world.message(reason);
  if (world.wanted > before) world.audio.siren(world.wanted > 0);
}

export function updatePolice(world, dt) {
  const pol = world.police;
  const p = world.player;
  const px = p.x, py = p.y;

  // Wanted decay: no crime for a while and no police close by.
  if (world.wanted > 0 && world.time - pol.lastCrime > WANTED.decayDelay) {
    const nearCop = pol.cruisers.some((c) => dist(c.x, c.y, px, py) < 420) ||
      pol.cops.some((c) => !c.dead && dist(c.x, c.y, px, py) < 300);
    if (!nearCop) {
      pol.decayTimer = (pol.decayTimer || 0) + dt;
      if (pol.decayTimer >= WANTED.decayInterval) {
        pol.decayTimer = 0;
        world.wanted -= 1;
        world.message(world.wanted === 0 ? 'You lost the heat.' : `Wanted level down: ${world.wanted} star${world.wanted === 1 ? '' : 's'}`);
        if (world.wanted === 0) world.audio.siren(false);
      }
    } else pol.decayTimer = 0;
  }

  // Spawn cruisers to match the wanted level (1 per star, up to 5).
  const wantCruisers = Math.min(world.wanted, 5);
  if (pol.cruisers.length < wantCruisers) {
    const pt = world.city.randomRoadPoint(world.rng);
    let x = pt.x, y = pt.y;
    if (dist(x, y, px, py) < 420) {
      const a = Math.atan2(py - y, px - x) + Math.PI;
      x = clamp(px + Math.cos(a) * 560, 100, 2280);
      y = clamp(py + Math.sin(a) * 560, 100, 2260);
      const rp = world.city.nearestRoadPoint(x, y);
      x = rp.x; y = rp.y;
    }
    const car = createCar('police', x, y, 0, '#1c2733', 'police');
    car.speed = 120;
    pol.cruisers.push(car);
    world.vehicles.push(car);
    world.message('Police on your tail!');
  }
  // Despawn far cruisers when the heat is off.
  if (world.wanted === 0) {
    for (const c of pol.cruisers) {
      if (dist(c.x, c.y, px, py) > 900) {
        c.remove = true;
        world.vehicles = world.vehicles.filter((v) => v !== c);
      }
    }
    pol.cruisers = pol.cruisers.filter((c) => !c.remove);
  }

  // Cruiser chase AI: steer at the player, ram on foot or in a car.
  for (const car of pol.cruisers) {
    if (car.exploded) continue;
    const targetAngle = Math.atan2(py - car.y, px - car.x);
    const diff = angleDiff(car.angle, targetAngle);
    const speedNorm = Math.abs(car.speed) / car.spec.maxSpeed;
    car.angle += clamp(diff, -2.6 * dt, 2.6 * dt) * (car.speed >= 0 ? 1 : -1);
    const wantSpeed = dist(car.x, car.y, px, py) > 60 ? car.spec.maxSpeed * (0.75 + world.wanted * 0.05) : 120;
    car.speed += clamp(wantSpeed - car.speed, -300 * dt, 320 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Cruisers plough through anything but buildings.
    if (!world.city.buildingHit(nx, car.y, car.spec.length / 2 - 4)) car.x = nx;
    else { car.speed *= 0.5; car.angle += 0.8 * dt; }
    if (!world.city.buildingHit(car.x, ny, car.spec.length / 2 - 4)) car.y = ny;
    else { car.speed *= 0.5; }
    car.x = clamp(car.x, 30, 2280); car.y = clamp(car.y, 30, 2352);
    pushOutOfBuilding(world, car, car.spec.length / 2 - 4);
    // Don't overlap the player's car: sit on its bumper instead of inside it.
    const pd = dist(car.x, car.y, px, py);
    const minD = p.inCar ? 52 : 34;
    if (pd < minD && pd > 0.01) {
      const ux = (car.x - px) / pd;
      const uy = (car.y - py) / pd;
      car.x = px + ux * minD;
      car.y = py + uy * minD;
    }
    // Ram the player's car or knock the player down.
    const d = dist(car.x, car.y, px, py);
    if (d < 46) {
      if (p.inCar) {
        const pc = p.inCar;
        pc.hp -= 14 * dt * 10 * 0.1;
        if (Math.abs(car.speed) > 150) {
          world.cameraShake = Math.max(world.cameraShake, 2);
          world.audio.crash();
        }
      } else if (!p.dead) {
        damagePlayer(world, 22 * dt);
        // Shove the player away from the cruiser, but never into a building.
        const shoveX = p.x + (p.x - car.x) * 0.02;
        const shoveY = p.y + (p.y - car.y) * 0.02;
        if (!world.city.buildingHit(shoveX, p.y, 11)) p.x = shoveX;
        if (!world.city.buildingHit(p.x, shoveY, 11)) p.y = shoveY;
      }
    }
    if (car.hp < car.maxHp * 0.4 && car.smokeTimer === undefined) car.smokeTimer = 0;
  }

  // Foot cops: 1 per 2 stars, spawn near the player, chase on foot.
  const wantCops = Math.floor(world.wanted / 2);
  const aliveCops = pol.cops.filter((c) => !c.dead);
  if (aliveCops.length < wantCops && world.wanted > 0) {
    const a = world.rng.range(0, Math.PI * 2);
    const x = clamp(px + Math.cos(a) * 380, 60, 2280);
    const y = clamp(py + Math.sin(a) * 380, 60, 2260);
    pol.cops.push({ x, y, angle: 0, speed: 0, health: 100, dead: false, arrestTimer: 0 });
  }
  for (const cop of pol.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, px, py);
    cop.angle = Math.atan2(py - cop.y, px - cop.x);
    const chaseSpeed = p.inCar ? 0 : 185; // cops cannot catch a car on foot
    if (!p.inCar && d > 26) {
      cop.x += Math.cos(cop.angle) * chaseSpeed * dt;
      cop.y += Math.sin(cop.angle) * chaseSpeed * dt;
    }
    // Arrest: standing next to the player on foot for 1.2 seconds.
    if (!p.inCar && d < 26 && !p.dead) {
      cop.arrestTimer += dt;
      if (cop.arrestTimer > 1.2) {
        world.events.push({ type: 'busted' });
        cop.arrestTimer = 0;
      }
    } else cop.arrestTimer = 0;
    // Cop shoots at the player at 3+ stars when the player is on foot.
    if (world.wanted >= 3 && !p.inCar && d < 320 && d > 60) {
      cop.shootTimer = (cop.shootTimer || 0) - dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = 1.1;
        const a = Math.atan2(py - cop.y, px - cop.x) + (world.rng.next() - 0.5) * 0.3;
        world.bullets.push({ x: cop.x, y: cop.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.6, fromPlayer: false, damage: 8 });
        world.audio.shot();
      }
    }
  }
  pol.cops = pol.cops.filter((c) => !c.dead || world.time - (c.diedAt || 0) < 8);

  // Roadblocks at 4+ stars: two cruisers parked across the road ahead.
  if (world.wanted >= 4 && pol.roadblocks.length === 0) {
    const ahead = world.city.nearestRoadPoint(px + (p.inCar ? Math.cos(p.inCar.angle) * 500 : 400), py + (p.inCar ? Math.sin(p.inCar.angle) * 500 : 0));
    if (ahead) {
      for (const off of [-30, 30]) {
        const bx = ahead.axis === 'x' ? ahead.x : ahead.x + off;
        const by = ahead.axis === 'x' ? ahead.y + off : ahead.y;
        const car = createCar('police', bx, by, ahead.axis === 'x' ? Math.PI / 2 : 0, '#1c2733', 'police');
        car.speed = 0;
        car.roadblock = true;
        pol.roadblocks.push(car);
        world.vehicles.push(car);
      }
      world.message('Roadblock ahead!');
    }
  }
  if (world.wanted < 4 && pol.roadblocks.length > 0) {
    for (const c of pol.roadblocks) world.vehicles = world.vehicles.filter((v) => v !== c);
    pol.cruisers = pol.cruisers.filter((c) => !c.roadblock);
    pol.roadblocks = [];
  }
}

/** Clear all police (busted / respray / mission reset). */
export function clearPolice(world) {
  for (const c of world.police.cruisers) world.vehicles = world.vehicles.filter((v) => v !== c);
  for (const c of world.police.roadblocks) world.vehicles = world.vehicles.filter((v) => v !== c);
  world.police.cruisers = [];
  world.police.roadblocks = [];
  world.police.cops = [];
  world.wanted = 0;
  world.audio.siren(false);
}
