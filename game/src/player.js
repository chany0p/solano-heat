// The player on foot: WASD movement, sprint, mouse aim, pistol fire, punch,
// entering and exiting cars, health and armor, pickups.
import { PLAYER, WANTED, PACKAGE_REWARD } from './config.js';
import { clamp, dist } from './random.js';
import { safeSpotNear } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    health: PLAYER.health, armor: PLAYER.armor,
    ammoClip: PLAYER.pistolClip, ammoReserve: PLAYER.pistolReserveMax,
    inCar: null, // the vehicle object when driving
    punchTimer: 0, shootTimer: 0, hurtTimer: 0, dead: false,
    moving: false, sprinting: false,
  };
}

/** Damage the player (armor absorbs first). Returns true if it killed them. */
export function damagePlayer(world, amount) {
  const p = world.player;
  if (p.dead) return false;
  let left = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left);
    p.armor -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  p.hurtTimer = 0.35;
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    world.events.push({ type: 'wasted' });
  }
  return p.dead;
}

/** Fire the pistol toward (tx,ty) in world coordinates. */
function shoot(world, tx, ty) {
  const p = world.player;
  if (p.shootTimer > 0 || p.ammoClip <= 0) {
    if (p.ammoClip <= 0 && p.ammoReserve > 0) {
      const take = Math.min(PLAYER.pistolClip, p.ammoReserve);
      p.ammoReserve -= take;
      p.ammoClip = take;
      world.message('Reloaded.');
      world.audio.pickup();
    }
    return;
  }
  p.shootTimer = PLAYER.pistolCooldown;
  p.ammoClip -= 1;
  const a = Math.atan2(ty - p.y, tx - p.x);
  p.angle = a;
  world.bullets.push({
    x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
    vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
    life: PLAYER.pistolRange / PLAYER.bulletSpeed, fromPlayer: true, damage: PLAYER.pistolDamage,
  });
  world.muzzle = 0.06;
  world.audio.shot();
  world.cameraShake = Math.max(world.cameraShake, 1.5);
}

function punch(world) {
  const p = world.player;
  if (p.punchTimer > 0) return;
  p.punchTimer = PLAYER.punchCooldown;
  world.audio.punch();
  const ax = p.x + Math.cos(p.angle) * 20;
  const ay = p.y + Math.sin(p.angle) * 20;
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (dist(ax, ay, ped.x, ped.y) < PLAYER.punchRange) {
      ped.health -= PLAYER.punchDamage;
      ped.state = 'flee';
      ped.fleeTimer = 4;
      if (ped.health <= 0) killPed(world, ped, true);
      else world.addWanted(WANTED.crimeHitPed, 'You hit a pedestrian');
      break;
    }
  }
  for (const cop of world.cops) {
    if (dist(ax, ay, cop.x, cop.y) < PLAYER.punchRange) {
      cop.health -= PLAYER.punchDamage;
      if (cop.health <= 0) killCop(world, cop);
      else world.addWanted(WANTED.crimeKillCop, 'You attacked a cop');
      break;
    }
  }
}

export function killPed(world, ped, byPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.state = 'dead';
  world.spawnBlood(ped.x, ped.y);
  if (byPlayer) world.addWanted(WANTED.crimeKillPed, 'Pedestrian killed');
}

export function killCop(world, cop) {
  if (cop.dead) return;
  cop.dead = true;
  world.spawnBlood(cop.x, cop.y);
  world.addWanted(WANTED.crimeKillCop, 'Officer down! +2 stars');
  world.audio.fail();
}

export function updatePlayerOnFoot(world, dt, input, cam) {
  const p = world.player;
  if (p.dead || p.inCar) return;
  // Safety net: never leave the player stuck inside a building.
  if (world.city.buildingHit(p.x, p.y, PLAYER.radius)) {
    const spot = safeSpotNear(world, p.x, p.y, 14);
    p.x = spot.x; p.y = spot.y;
  }
  p.punchTimer = Math.max(0, p.punchTimer - dt);
  p.shootTimer = Math.max(0, p.shootTimer - dt);
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);

  // Movement
  let mx = 0; let my = 0;
  if (input.held('KeyW', 'ArrowUp')) my -= 1;
  if (input.held('KeyS', 'ArrowDown')) my += 1;
  if (input.held('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.held('KeyD', 'ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my);
  p.sprinting = input.held('ShiftLeft', 'ShiftRight') && len > 0;
  const speed = p.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  p.moving = len > 0;
  if (len > 0) {
    mx /= len; my /= len;
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    // Slide along buildings: try each axis separately.
    if (!world.city.buildingHit(nx, p.y, PLAYER.radius)) p.x = nx;
    if (!world.city.buildingHit(p.x, ny, PLAYER.radius)) p.y = ny;
    p.x = clamp(p.x, 20, world.cityW - 20);
    p.y = clamp(p.y, 20, world.cityH - 20);
    if (world.city.isWaterAt(p.x, p.y)) { p.x = clamp(p.x, 20, world.cityW - 20); p.y = Math.min(p.y, 2352); }
  }

  // Aim at the mouse.
  const aim = input.aimScreen();
  const wx = cam.x + aim.x / cam.zoom;
  const wy = cam.y + aim.y / cam.zoom;
  p.angle = Math.atan2(wy - p.y, wx - p.x);

  // Combat
  if (input.clicked() || input.held('mouse')) shoot(world, wx, wy);
  if (input.pressed('KeyF')) punch(world);

  // Enter a nearby car.
  if (input.pressed('KeyE')) {
    const car = world.nearestCar(p.x, p.y, 46);
    if (car) world.enterCar(car);
  }

  // Pick up hidden packages and cash drops.
  for (const pkg of world.city.packages) {
    if (!pkg.found && dist(p.x, p.y, pkg.x, pkg.y) < 24) {
      pkg.found = true;
      world.cash += PACKAGE_REWARD;
      world.packagesFound += 1;
      world.message(`Hidden package found! +$${PACKAGE_REWARD} (${world.packagesFound}/20)`);
      world.audio.cash();
    }
  }
  for (const drop of world.drops) {
    if (!drop.taken && dist(p.x, p.y, drop.x, drop.y) < 26) {
      drop.taken = true;
      world.cash += drop.amount;
      world.message(`Picked up $${drop.amount}`);
      world.audio.cash();
      if (world.mission.onPickup) world.mission.onPickup(world, drop);
    }
  }

  // Ammo pickups.
  for (const pk of world.pickups) {
    if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 24) {
      pk.taken = true;
      if (pk.kind === 'ammo') {
        p.ammoReserve = Math.min(PLAYER.pistolReserveMax, p.ammoReserve + 24);
        world.message('Ammo +24');
      } else if (pk.kind === 'health') {
        p.health = Math.min(PLAYER.health, p.health + 40);
        world.message('Health +40');
      } else if (pk.kind === 'armor') {
        p.armor = Math.min(PLAYER.armor, p.armor + 50);
        world.message('Armor +50');
      }
      world.audio.pickup();
    }
  }
}
