// World state and the step that ties every system together: player, cars,
// peds, police, missions, bullets, pickups, camera, wanted decay and events.
// main.js owns the loop and the screens; this file owns the simulation.
import { WORLD_W, WORLD_H, PLAYER, START_CASH, RESPRAY_COST, PACKAGE_COUNT } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayerOnFoot, damagePlayer } from './player.js';
import { spawnTraffic, updateTraffic, drivePlayerCar, updateCarEffects, explodeCar, safeSpotNear } from './vehicles.js';
import { spawnPeds, updatePeds, scarePeds } from './pedestrians.js';
import { createPoliceState, updatePolice, addWanted, clearPolice } from './police.js';
import { createMissionState, startMission, updateMissions, updateTaxi, maybeSpawnTaxiPed, startTaxi } from './missions.js';

export function createWorld(seed) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  // No-op audio until main.js plugs in the real AudioEngine.
  const NO_AUDIO = {
    ensure() {}, setMuted() {}, engine() {}, engineOff() {}, siren() {},
    shot() {}, punch() {}, pickup() {}, cash() {}, jingle() {}, fail() {},
    crash() {}, explosion() {}, door() {}, busted() {}, startMusic() {}, stopMusic() {},
  };
  const world = {
    seed, rng, city,
    cityW: WORLD_W, cityH: WORLD_H,
    time: 0,               // seconds since the run started
    sun: 1,                // 1 = day, 0.55 = sunset
    cash: START_CASH,
    wanted: 0,
    packagesFound: 0,
    faresDone: 0,
    player: createPlayer(510, 650),
    vehicles: [],
    parkedCars: [],
    peds: [],
    police: createPoliceState(),
    mission: createMissionState(),
    taxi: null,
    bullets: [],
    drops: [],
    pickups: [],
    particles: [],
    explosions: [],
    skids: [],
    messages: [],          // {text, t}
    events: [],            // {type: 'wasted'|'busted'} consumed by main.js
    missionPassed: null,
    missionFailed: null,
    missionNextAt: null,
    muzzle: 0,
    cameraShake: 0,
    cam: { x: 0, y: 0, zoom: 1, viewW: 1280, viewH: 720 }, // resize() overwrites viewW/viewH/zoom with the real window size; the defaults keep clearRect/fillRect valid after any resetWorld() before resize() runs again.
    audio: NO_AUDIO,     // set by main.js (AudioEngine)
    save: () => {},        // set by main.js
    addWanted(stars, reason) { addWanted(this, stars, reason); },
    message(text) {
      this.messages.push({ text, t: 4 }); // 4 s lifetime; stepWorld ticks t down and drops expired ones
      // Cap the visible feed at 2: the oldest banner drops when a new one arrives,
      // so bursts (mission start + enter-car + police) never stack up the screen.
      if (this.messages.length > 2) this.messages.shift();
    },
    spawnBlood(x, y) {
      for (let i = 0; i < 10; i++) {
        this.particles.push({ x, y, vx: (this.rng.next() - 0.5) * 120, vy: (this.rng.next() - 0.5) * 120, life: 0.6, max: 0.6, size: 3, color: '#a01818', kind: 'blood' });
      }
    },
    nearestCar(x, y, maxDist) {
      let best = null; let bd = maxDist;
      for (const car of this.vehicles) {
        if (car.exploded) continue;
        const d = dist(x, y, car.x, car.y);
        if (d < bd) { bd = d; best = car; }
      }
      return best;
    },
    enterCar(car) {
      const p = this.player;
      if (p.inCar || car.exploded) return;
      if (car.driver === 'traffic') {
        // Steal it: the driver bails out and runs.
        const driver = { x: car.x + 24, y: car.y + 24, angle: 0, speed: 0, health: 100, dead: false, state: 'flee', fleeTimer: 5, targetX: 0, targetY: 0, waitTimer: 0, shirt: '#888', skin: '#e0ac69', walkPhase: 0 };
        this.peds.push(driver);
        this.addWanted(1, 'Car stolen! +1 star');
        this.message('You jacked the car!');
      } else if (car.driver === 'police') {
        this.addWanted(1, 'You stole a police cruiser!');
      }
      car.driver = 'player';
      p.inCar = car;
      p.x = car.x; p.y = car.y;
      this.audio.door();
      this.message(`${car.spec.name} — WASD to drive, Space to handbrake, E to get out`);
    },
    exitCar() {
      const p = this.player;
      const car = p.inCar;
      if (!car) return;
      car.driver = 'none';
      car.speed *= 0.25;
      p.inCar = null;
      const spot = safeSpotNear(this, car.x + Math.cos(car.angle + Math.PI / 2) * 30, car.y + Math.sin(car.angle + Math.PI / 2) * 30, 12);
      p.x = spot.x;
      p.y = spot.y;
      this.audio.door();
    },
  };
  spawnTraffic(world);
  spawnPeds(world);
  // A few pickups scattered around the spawn.
  const pkKinds = ['ammo', 'health', 'armor', 'ammo', 'health'];
  for (let i = 0; i < 5; i++) {
    const pt = city.randomRoadPoint(rng);
    world.pickups.push({ x: clamp(pt.x + 60, 90, 2280), y: clamp(pt.y + 60, 90, 2260), kind: pkKinds[i], taken: false });
  }
  startMission(world, 0);
  return world;
}

/** Reset the world to a fresh run with the same seed. */
export function resetWorld(world) {
  const fresh = createWorld(world.seed);
  // Keep the audio engine and save hook across resets.
  fresh.audio = world.audio;
  fresh.save = world.save;
  Object.keys(world).forEach((k) => delete world[k]);
  Object.assign(world, fresh);
}

export function stepWorld(world, dt, input) {
  world.time += dt;
  world.muzzle = Math.max(0, world.muzzle - dt);
  world.cameraShake = Math.max(0, world.cameraShake - dt * 10);
  for (const m of world.messages) m.t -= dt;
  world.messages = world.messages.filter((m) => m.t > 0);

  const p = world.player;
  if (!p.dead) {
    if (p.inCar) {
      const car = p.inCar;
      drivePlayerCar(world, car, dt, input);
      p.x = car.x; p.y = car.y;
      p.angle = car.angle;
      if (input.pressed('KeyE')) world.exitCar();
      // Respray garage: drive in to clear the heat for cash.
      const g = world.city.landmarks.respray;
      const gx = g.x + g.w / 2, gy = g.y + g.h / 2;
      if (world.wanted > 0 && world.cash >= RESPRAY_COST && dist(car.x, car.y, gx, gy) < 80) {
        world.cash -= RESPRAY_COST;
        clearPolice(world);
        world.message(`Resprayed! Wanted cleared (-$${RESPRAY_COST})`);
        world.audio.cash();
      }
      // Safehouse: park here to heal and save.
      const sh = world.city.landmarks.safehouse;
      const sx = sh.x + sh.w / 2, sy = sh.y + sh.h / 2;
      if (dist(car.x, car.y, sx, sy) < 90 && (p.health < PLAYER.health || p.armor < PLAYER.armor)) {
        p.health = PLAYER.health;
        p.armor = PLAYER.armor;
        world.save();
        world.message('Safehouse — healed and saved.');
      }
    } else {
      updatePlayerOnFoot(world, dt, input, world.cam);
      world.audio.engine(0, 0);
      // Taxi hail: press E next to a waiting ped while in a car is impossible
      // on foot, so hailing works when the player is on foot near them and a
      // car is close by — simpler: E near the ped starts the fare if the
      // player gets into a car within 10 seconds.
      if (input.pressed('KeyE')) {
        for (const ped of world.peds) {
          if (ped.state === 'taxi' && dist(p.x, p.y, ped.x, ped.y) < 40) {
            world.taxiPed = ped;
            world.taxiPedTimer = 10;
            world.message('Fare accepted — get in a car, quick!');
            ped.state = 'fare-wait';
            break;
          }
        }
      }
      if (world.taxiPedTimer) {
        world.taxiPedTimer -= dt;
        if (p.inCar && world.taxiPed) {
          startTaxi(world, world.taxiPed);
          world.taxiPed = null;
          world.taxiPedTimer = 0;
        } else if (world.taxiPedTimer <= 0) {
          if (world.taxiPed) world.taxiPed.state = 'taxi';
          world.taxiPed = null;
        }
      }
    }
  }

  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  updateMissions(world, dt);
  updateTaxi(world, dt);
  maybeSpawnTaxiPed(world);
  updateCarEffects(world, dt);
  updateBullets(world, dt);
  updateParticles(world, dt);

  // Respawn traffic that drifted far away, so the streets stay alive.
  if (world.time % 1 < dt) {
    const far = world.vehicles.filter((v) => v.driver === 'traffic' && dist(v.x, v.y, p.x, p.y) > 1100);
    for (const v of far) world.vehicles = world.vehicles.filter((q) => q !== v);
    if (far.length > 0) spawnTraffic(world);
  }

  // Camera follows the player, clamped to the world.
  const vw = world.cam.viewW || 1280;
  const vh = world.cam.viewH || 720;
  const zoom = world.cam.zoom;
  const halfW = vw / zoom / 2;
  const halfH = vh / zoom / 2;
  let cx = clamp(p.x - halfW, 0, Math.max(0, WORLD_W - vw / zoom));
  let cy = clamp(p.y - halfH, 0, Math.max(0, WORLD_H - vh / zoom));
  if (world.cameraShake > 0) {
    cx += (world.rng.next() - 0.5) * world.cameraShake * 2;
    cy += (world.rng.next() - 0.5) * world.cameraShake * 2;
  }
  world.cam.x = cx;
  world.cam.y = cy;
}

function updateBullets(world, dt) {
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (world.city.buildingHit(b.x, b.y, 2)) { b.life = 0; continue; }
    if (b.fromPlayer) {
      for (const ped of world.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 12) {
          ped.health -= b.damage;
          ped.state = 'flee'; ped.fleeTimer = 4;
          scarePeds(world, ped.x, ped.y, 200);
          if (ped.health <= 0) {
            ped.dead = true; ped.state = 'dead';
            world.spawnBlood(ped.x, ped.y);
            world.addWanted(1, 'Pedestrian killed');
          }
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of world.police.cops) {
        if (cop.dead) continue;
        if (dist(b.x, b.y, cop.x, cop.y) < 12) {
          cop.health -= b.damage;
          if (cop.health <= 0) {
            cop.dead = true;
            cop.diedAt = world.time;
            world.spawnBlood(cop.x, cop.y);
            world.addWanted(2, 'Officer down! +2 stars');
          }
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of world.vehicles) {
        if (car.exploded || car.driver === 'player') continue;
        if (dist(b.x, b.y, car.x, car.y) < car.spec.length / 2) {
          car.hp -= b.damage;
          if (car.hp <= 0) explodeCar(world, car);
          if (car.driver === 'traffic') {
            car.driver = 'none';
            world.addWanted(1, 'You shot a driver\'s car!');
          }
          b.life = 0;
          break;
        }
      }
    } else {
      // Cop bullets can hit the player.
      const p = world.player;
      if (!p.dead && !p.inCar && dist(b.x, b.y, p.x, p.y) < 12) {
        damagePlayer(world, b.damage);
        b.life = 0;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.life > 0);
}

function updateParticles(world, dt) {
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
}
