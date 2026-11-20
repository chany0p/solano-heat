// Cars: arcade physics for the player's car, road-following AI for traffic,
// parked cars, collisions, damage, smoke and explosions.
import { CAR_TYPES, TRAFFIC_TYPES, TRAFFIC_COUNT, WANTED, ROAD_W, GRID } from './config.js';
import { makeRng, clamp, angleDiff, dist } from './random.js';

let nextCarId = 1;

export function createCar(type, x, y, angle, color, driver) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++, type, spec,
    x, y, angle, speed: 0,
    color: color || spec.colors[0],
    hp: spec.hp, maxHp: spec.hp,
    driver: driver || 'none', // 'player' | 'traffic' | 'police' | 'none'
    // Traffic AI state
    axis: 'x', dir: 1, lane: 0, stuckTimer: 0, turnCooldown: 0,
    smokeTimer: 0, exploded: false, brake: false, skid: false,
    // Occupied-car theft: the driver who flees
    occupied: driver === 'traffic',
  };
}

export function spawnTraffic(world) {
  const rng = world.rng;
  world.vehicles = world.vehicles.filter((v) => v.driver === 'player' || v.driver === 'police');
  const target = TRAFFIC_COUNT + world.parkedCars.length;
  let guard = 0;
  while (world.vehicles.length < target && guard++ < 200) {
    const pt = world.city.randomRoadPoint(rng);
    const type = rng.pick(TRAFFIC_TYPES);
    const spec = CAR_TYPES[type];
    const axis = pt.axis;
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = dir * 16;
    const x = axis === 'y' ? pt.x + lane : pt.x;
    const y = axis === 'x' ? pt.y + lane : pt.y;
    const angle = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (dist(x, y, world.player.x, world.player.y) < 260) continue;
    if (world.vehicles.some((v) => dist(x, y, v.x, v.y) < 90)) continue;
    const car = createCar(type, x, y, angle, rng.pick(spec.colors), 'traffic');
    car.axis = axis; car.dir = dir; car.lane = lane;
    car.speed = rng.range(90, 170);
    world.vehicles.push(car);
  }
  // Parked cars along road edges.
  if (world.parkedCars.length === 0) {
    for (let i = 0; i < 14; i++) {
      const pt = world.city.randomRoadPoint(rng);
      const type = rng.pick(TRAFFIC_TYPES);
      const spec = CAR_TYPES[type];
      const axis = pt.axis;
      const edge = rng.chance(0.5) ? 1 : -1;
      const x = axis === 'y' ? pt.x + edge * (ROAD_W / 2 - 8) : pt.x;
      const y = axis === 'x' ? pt.y + edge * (ROAD_W / 2 - 8) : pt.y;
      const angle = axis === 'x' ? (edge > 0 ? 0 : Math.PI) : (edge > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (world.city.buildingHit(x, y, 20)) continue;
      if (dist(x, y, world.player.x, world.player.y) < 200) continue;
      const car = createCar(type, x, y, angle, rng.pick(spec.colors), 'none');
      car.axis = axis; car.dir = edge > 0 ? 1 : -1;
      world.vehicles.push(car);
      world.parkedCars.push(car);
    }
  }
}

/** Drive the player's car with arcade physics. Returns nothing; mutates car. */
export function drivePlayerCar(world, car, dt, input) {
  const spec = car.spec;
  const fwd = input.held('KeyW', 'ArrowUp') ? 1 : input.held('KeyS', 'ArrowDown') ? -1 : 0;
  const steer = input.held('KeyA', 'ArrowLeft') ? -1 : input.held('KeyD', 'ArrowRight') ? 1 : 0;
  const handbrake = input.held('Space');
  const speedNorm = Math.abs(car.speed) / spec.maxSpeed;

  if (fwd > 0) car.speed += spec.accel * dt * (1 - speedNorm * 0.55);
  else if (fwd < 0) {
    if (car.speed > 20) car.speed -= spec.accel * 1.6 * dt; // brake
    else car.speed -= spec.accel * 0.55 * dt; // reverse
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 420 * dt);
    car.skid = Math.abs(car.speed) > 120;
  } else car.skid = false;
  car.speed = clamp(car.speed, -spec.reverse, spec.maxSpeed);

  // Steering needs some speed to bite, but never zero: a slow car can still
  // turn its wheels and crawl out of a corner it overshot.
  const steerAmount = steer * spec.turn * clamp(Math.abs(car.speed) / 120, 0.25, 1) * (handbrake ? 1.5 : 1);
  car.angle += steerAmount * Math.sign(car.speed || 1) * dt * (car.speed < 0 ? -1 : 1);
  if (car.skid) car.angle += steer * 0.6 * dt;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  moveCarWithCollisions(world, car, nx, ny);

  if (car.skid && Math.abs(car.speed) > 100) {
    world.skids.push({ x: car.x - Math.cos(car.angle) * 14, y: car.y - Math.sin(car.angle) * 14, angle: car.angle, life: 2.5 });
  }
  world.audio.engine(0.35 + speedNorm * 0.65, speedNorm);
}

/** Move a car, resolving building and car collisions. */
function moveCarWithCollisions(world, car, nx, ny) {
  const r = car.spec.length / 2 - 4;
  // Buildings: slide along each axis. Only a hard hit damages the car;
  // scraping a wall at low speed just slows it down.
  const impactSpeed = Math.abs(car.speed);
  if (!world.city.buildingHit(nx, car.y, r)) car.x = nx;
  else {
    car.speed *= 0.55;
    if (impactSpeed > 130) damageCar(world, car, (impactSpeed - 130) * 0.06);
  }
  if (!world.city.buildingHit(car.x, ny, r)) car.y = ny;
  else {
    car.speed *= 0.55;
    if (impactSpeed > 130) damageCar(world, car, (impactSpeed - 130) * 0.06);
  }
  // Never leave the car overlapping a wall: push it out along the smallest axis.
  if (pushOutOfBuilding(world, car, r)) car.speed *= 0.6;
  car.x = clamp(car.x, 24, world.cityW - 24);
  if (world.city.isWaterAt(car.x, car.y)) { car.y = Math.min(car.y, 2352); car.speed *= 0.7; }
  // Other cars: soft push-apart.
  for (const other of world.vehicles) {
    if (other === car || other.exploded) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    const min = (car.spec.length + other.spec.length) / 2 - 8;
    if (d < min && d > 0.01) {
      const push = (min - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      // A police cruiser never shoves the player's car off the road: the
      // cruiser takes the whole push instead.
      if (other.driver === 'police' && car.driver === 'player') {
        other.x -= ux * push * 2; other.y -= uy * push * 2;
      } else {
        car.x += ux * push; car.y += uy * push;
        if (other.driver !== 'player') { other.x -= ux * push; other.y -= uy * push; }
      }
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 90) {
        damageCar(world, car, impact * 0.05);
        damageCar(world, other, impact * 0.05);
        world.audio.crash();
        world.cameraShake = Math.max(world.cameraShake, 2);
        if (other.driver === 'traffic' && car.driver === 'player') {
          other.driver = 'none';
          world.addWanted(0, '');
          world.message('You hit a car!');
        }
      }
      car.speed *= 0.92;
    }
  }
  // Peds in the way get run over.
  for (const ped of world.peds) {
    if (ped.dead || ped.state === 'dead') continue;
    if (dist(car.x, car.y, ped.x, ped.y) < car.spec.length / 2 + 4) {
      ped.health = 0;
      ped.dead = true;
      ped.state = 'dead';
      world.spawnBlood(ped.x, ped.y);
      if (car.driver === 'player') world.addWanted(WANTED.crimeKillPed, 'You ran someone over!');
      else world.addWanted(0, '');
    }
  }
}

export function damageCar(world, car, amount) {
  if (car.exploded || amount <= 0) return;
  // One damage tick per 0.4s at most, so a scrape or a shove is one hit, not fifty.
  if (world.time - (car.lastDamageAt || -99) < 0.4) return;
  car.lastDamageAt = world.time;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    explodeCar(world, car);
  }
}

export function explodeCar(world, car) {
  if (car.exploded) return;
  car.exploded = true;
  car.speed = 0;
  world.explosions.push({ x: car.x, y: car.y, r: 10, life: 0.7 });
  world.audio.explosion();
  world.cameraShake = Math.max(world.cameraShake, 6);
  const p = world.player;
  if (p.inCar === car) {
    p.inCar = null;
    car.driver = 'none';
    const spot = safeSpotNear(world, car.x, car.y, 30);
    p.x = spot.x; p.y = spot.y;
    damagePlayerDirect(world, 45);
  }
  if (dist(car.x, car.y, p.x, p.y) < 90 && !p.inCar) damagePlayerDirect(world, 30);
  world.message('Car destroyed!');
}

/** Push an object out of a building it overlaps, along the smallest
 * penetration axis. Guarantees a car is never left wedged inside a wall. */
export function pushOutOfBuilding(world, o, r) {
  const b = world.city.buildingHit(o.x, o.y, r);
  if (!b) return false;
  const overlapL = (o.x + r) - b.x;
  const overlapR = (b.x + b.w) - (o.x - r);
  const overlapT = (o.y + r) - b.y;
  const overlapB = (b.y + b.h) - (o.y - r);
  const min = Math.min(overlapL, overlapR, overlapT, overlapB);
  if (min === overlapL) o.x = b.x - r;
  else if (min === overlapR) o.x = b.x + b.w + r;
  else if (min === overlapT) o.y = b.y - r;
  else o.y = b.y + b.h + r;
  return true;
}

/** A point near (x,y) that is not inside a building (tries rings outward). */
export function safeSpotNear(world, x, y, startR) {
  for (let r = startR; r <= 120; r += 14) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const nx = clamp(x + Math.cos(ang) * r, 24, world.cityW - 24);
      const ny = clamp(y + Math.sin(ang) * r, 24, world.cityH - 24);
      if (!world.city.buildingHit(nx, ny, 12) && !world.city.isWaterAt(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x: clamp(x, 24, world.cityW - 24), y: clamp(y, 24, world.cityH - 24) };
}

function damagePlayerDirect(world, amount) {
  const p = world.player;
  if (p.dead) return;
  p.health -= amount;
  if (p.health <= 0) { p.health = 0; p.dead = true; world.events.push({ type: 'wasted' }); }
}

/** Traffic AI: follow the road, turn at intersections, stop for cars ahead. */
export function updateTraffic(world, dt) {
  const rng = world.rng;
  for (const car of world.vehicles) {
    if (car.driver !== 'traffic' || car.exploded) continue;
    car.turnCooldown = Math.max(0, car.turnCooldown - dt);
    const spec = car.spec;
    // Car ahead? Slow down.
    let blocked = false;
    const aheadX = car.x + Math.cos(car.angle) * 46;
    const aheadY = car.y + Math.sin(car.angle) * 46;
    for (const other of world.vehicles) {
      if (other === car || other.exploded) continue;
      if (dist(aheadX, aheadY, other.x, other.y) < 34) { blocked = true; break; }
    }
    const target = blocked ? 0 : rngTargetSpeed(car);
    car.speed += clamp(target - car.speed, -260 * dt, 200 * dt);
    // Turn at an intersection sometimes.
    const nearX = nearestGridLine(car.x, GRID);
    const nearY = nearestGridLine(car.y, GRID);
    const atCross = Math.abs(car.x - nearX) < 26 && Math.abs(car.y - nearY) < 26;
    if (atCross && car.turnCooldown <= 0 && rng.chance(0.02)) {
      turnAtIntersection(world, car, nearX, nearY);
      car.turnCooldown = 2.5;
    }
    // Steer back onto the lane centre.
    const laneTarget = car.axis === 'x' ? nearY + car.lane : nearX + car.lane;
    const wantAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const off = car.axis === 'x' ? car.y - laneTarget : car.x - laneTarget;
    const desired = wantAngle + clamp(-off * 0.02, -0.4, 0.4) * (car.dir > 0 ? 1 : -1);
    car.angle += clamp(angleDiff(car.angle, desired), -2.2 * dt, 2.2 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(nx, 30, world.cityW - 30);
    car.y = clamp(ny, 30, 2352);
    pushOutOfBuilding(world, car, car.spec.length / 2 - 4);
    // Keep traffic on roads: if pushed off, steer back.
    if (!world.city.isRoadAt(car.x, car.y)) {
      const pt = world.city.nearestRoadPoint(car.x, car.y);
      car.x += (pt.x - car.x) * 0.5 * dt;
      car.y += (pt.y - car.y) * 0.5 * dt;
    }
  }
}

function rngTargetSpeed(car) {
  return car._cruise || (car._cruise = 110 + ((car.id * 37) % 60));
}

function nearestGridLine(v, lines) {
  let best = lines[0]; let bd = Infinity;
  for (const l of lines) { const d = Math.abs(v - l); if (d < bd) { bd = d; best = l; } }
  return best;
}

function turnAtIntersection(world, car, cx, cy) {
  const rng = world.rng;
  if (car.axis === 'x') {
    car.axis = 'y';
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.lane = car.dir * 16;
    car.x = cx + car.lane;
  } else {
    car.axis = 'x';
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.lane = car.dir * 16;
    car.y = cy + car.lane;
  }
}

/** Smoke and wreck updates. */
export function updateCarEffects(world, dt) {
  for (const car of world.vehicles) {
    if (car.exploded) continue;
    // Parked cars shoved by a collision roll to a stop; they have no engine.
    if (car.driver === 'none' && car.speed !== 0) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
    }
    if (car.hp < car.maxHp * 0.4) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        world.particles.push({ x: car.x, y: car.y - 6, vx: (world.rng.next() - 0.5) * 20, vy: -30, life: 0.9, max: 0.9, size: 6, color: '#555', kind: 'smoke' });
      }
    }
  }
  for (const e of world.explosions) { e.r += 260 * dt; e.life -= dt; }
  world.explosions = world.explosions.filter((e) => e.life > 0);
  for (const s of world.skids) s.life -= dt;
  world.skids = world.skids.filter((s) => s.life > 0);
}
