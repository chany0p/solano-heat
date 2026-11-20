// Missions and side jobs. Rico, a fixer in Old Town, hands out a six-job
// story chain; the city also offers taxi fares and 20 hidden packages.
// Each mission is data (name, briefing, reward, timer) plus a small state
// machine in updateMissions.
import { MISSION_REWARDS, MISSION_TIMERS, TAXI_FARE_MIN, TAXI_FARE_MAX, GRID } from './config.js';
import { dist, clamp } from './random.js';
import { addWanted, clearPolice } from './police.js';

export const MISSION_NAMES = [
  'Get Wheels',
  'Package Run',
  'Lose the Heat',
  'The Pickup',
  'Getaway Driver',
  'The Big One',
];
export const MISSION_BRIEFINGS = [
  'Rico needs wheels. Steal any car and bring it to the marker.',
  'A package has to cross town in 90 seconds. Drive it to each drop, fast.',
  'The cops know your face. Get to 3 stars, then shake them all off.',
  'Three cash drops are waiting around the city. Grab them all — the cops are already coming.',
  'Rico\'s getaway: hit all four checkpoints before the timer runs out.',
  'The big one. Hit Solano First Bank, grab the cash, and lose a 4-star wanted level at the safehouse.',
];

export function createMissionState() {
  return {
    index: 0,           // current mission (0..5), 6 = story done
    stage: 0,           // per-mission stage
    active: false,
    timer: 0,
    marker: null,       // {x, y, label, color}
    data: {},           // per-mission scratch
    done: false,        // whole story complete
    banner: null,       // {title, sub, t}
    onPickup: null,     // called when the player grabs a cash drop
  };
}

/** Start mission i (or show the story-complete banner when i is past the end). */
export function startMission(world, i) {
  const m = world.mission;
  m.index = i;
  m.stage = 0;
  m.data = {};
  m.active = true;
  m.onPickup = null;
  m.marker = null;
  if (i >= MISSION_NAMES.length) {
    m.done = true;
    m.active = false;
    m.banner = { title: 'STORY COMPLETE', sub: 'You own Port Solano now. Keep earning: taxis, packages, free roam.', t: 6 };
    world.message('Story complete! Free roam — taxis and packages still pay.');
    world.audio.jingle();
    world.save();
    return;
  }
  m.timer = MISSION_TIMERS[i] || 0;
  m.banner = { title: `MISSION ${i + 1}: ${MISSION_NAMES[i].toUpperCase()}`, sub: MISSION_BRIEFINGS[i], t: 5 };
  world.message(`New mission: ${MISSION_NAMES[i]} — ${MISSION_BRIEFINGS[i]}`);
  world.audio.jingle();

  if (i === 0) {
    // Marker at Rico's corner, a short drive from the spawn.
    m.marker = { x: 750, y: 450, label: 'Rico', color: '#ffd166' };
  } else if (i === 1) {
    m.data.drops = [
      { x: 1650, y: 750, label: 'Drop 1' },
      { x: 450, y: 1650, label: 'Drop 2' },
      { x: 1950, y: 1950, label: 'Drop 3' },
    ];
    m.data.dropIndex = 0;
    m.marker = { x: 1650, y: 750, label: 'Drop 1/3', color: '#ffd166' };
  } else if (i === 2) {
    m.marker = null;
  } else if (i === 3) {
    const spots = [
      { x: 450, y: 450 }, { x: 1950, y: 450 }, { x: 1050, y: 1950 },
    ];
    m.data.total = 3;
    m.data.got = 0;
    for (const s of spots) world.drops.push({ x: s.x, y: s.y, amount: 150, taken: false, mission: true });
    addWanted(world, 2, 'The cops are onto the pickup!');
    m.onPickup = (w, drop) => {
      if (!drop.mission) return;
      m.data.got += 1;
      w.message(`Cash drop ${m.data.got}/3 collected`);
      if (m.data.got >= m.data.total) completeMission(w);
    };
    m.marker = { x: 450, y: 450, label: 'Cash drop 1/3', color: '#ffd166' };
  } else if (i === 4) {
    m.data.points = [
      { x: 450, y: 450 }, { x: 1950, y: 450 }, { x: 1950, y: 1950 }, { x: 750, y: 1950 },
    ];
    m.data.pointIndex = 0;
    m.marker = { x: 450, y: 450, label: 'Checkpoint 1/4', color: '#ffd166' };
  } else if (i === 5) {
    const bank = world.city.landmarks.bank;
    m.marker = { x: bank.x + bank.w / 2, y: bank.y + bank.h + 40, label: 'Solano First Bank', color: '#ffd166' };
  }
}

export function completeMission(world) {
  const m = world.mission;
  const reward = MISSION_REWARDS[m.index] || 0;
  world.cash += reward;
  world.message(`Mission passed! +$${reward}`);
  world.audio.jingle();
  world.missionPassed = { name: MISSION_NAMES[m.index], reward, t: 3.5 };
  m.active = false;
  m.marker = null;
  m.onPickup = null;
  world.save();
  world.missionNextAt = world.time + 3;
}

export function failMission(world, reason) {
  const m = world.mission;
  m.active = false;
  m.marker = null;
  m.onPickup = null;
  world.missionFailed = { name: MISSION_NAMES[m.index], reason, t: 4 };
  world.message(`Mission failed: ${reason}`);
  world.audio.fail();
}

export function updateMissions(world, dt) {
  const m = world.mission;
  if (m.banner) {
    m.banner.t -= dt;
    if (m.banner.t <= 0) m.banner = null;
  }
  if (world.missionPassed) {
    world.missionPassed.t -= dt;
    if (world.missionPassed.t <= 0) world.missionPassed = null;
  }
  if (world.missionFailed) {
    world.missionFailed.t -= dt;
    if (world.missionFailed.t <= 0) world.missionFailed = null;
  }
  // Queue the next mission a few seconds after a pass.
  if (!m.active && !m.done && world.missionNextAt && world.time >= world.missionNextAt) {
    world.missionNextAt = null;
    startMission(world, m.index + 1);
  }
  if (!m.active) return;
  const p = world.player;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 0;
      failMission(world, 'Out of time');
      return;
    }
  }

  const near = (x, y, r) => dist(p.x, p.y, x, y) < r;
  if (m.index === 0) {
    // Steal a car and drive to Rico.
    if (p.inCar && near(m.marker.x, m.marker.y, 80)) completeMission(world);
  } else if (m.index === 1) {
    const drop = m.data.drops[m.data.dropIndex];
    if (drop && near(drop.x, drop.y, 70)) {
      m.data.dropIndex += 1;
      world.audio.cash();
      if (m.data.dropIndex >= m.data.drops.length) completeMission(world);
      else {
        const next = m.data.drops[m.data.dropIndex];
        m.marker = { x: next.x, y: next.y, label: `Drop ${m.data.dropIndex + 1}/3`, color: '#ffd166' };
        world.message(`Drop ${m.data.dropIndex}/3 delivered`);
      }
    }
  } else if (m.index === 2) {
    if (world.wanted >= 3) m.data.heated = true;
    if (m.data.heated && world.wanted === 0) completeMission(world);
  } else if (m.index === 3) {
    // Drops are collected via onPickup; keep the marker on the nearest one.
    const left = world.drops.filter((d) => d.mission && !d.taken);
    if (left.length > 0) {
      let best = left[0]; let bd = Infinity;
      for (const d of left) { const dd = dist(p.x, p.y, d.x, d.y); if (dd < bd) { bd = dd; best = d; } }
      m.marker = { x: best.x, y: best.y, label: `Cash drop (${m.data.total - left.length + 1}/3)`, color: '#ffd166' };
    }
  } else if (m.index === 4) {
    const pt = m.data.points[m.data.pointIndex];
    if (pt && near(pt.x, pt.y, 75)) {
      m.data.pointIndex += 1;
      world.audio.cash();
      if (m.data.pointIndex >= m.data.points.length) completeMission(world);
      else {
        const next = m.data.points[m.data.pointIndex];
        m.marker = { x: next.x, y: next.y, label: `Checkpoint ${m.data.pointIndex + 1}/4`, color: '#ffd166' };
      }
    }
  } else if (m.index === 5) {
    const bank = world.city.landmarks.bank;
    if (m.stage === 0) {
      if (near(m.marker.x, m.marker.y, 70)) {
        m.stage = 1;
        world.cash += 800;
        world.message('Bank hit! +$800 — now run!');
        world.audio.cash();
        addWanted(world, 4, '4 stars! Lose the cops at the safehouse!');
        const sh = world.city.landmarks.safehouse;
        m.marker = { x: sh.x + sh.w / 2, y: sh.y + sh.h / 2, label: 'Safehouse', color: '#2ecc71' };
      }
    } else if (m.stage === 1) {
      const sh = world.city.landmarks.safehouse;
      if (near(sh.x + sh.w / 2, sh.y + sh.h / 2, 90)) {
        clearPolice(world);
        completeMission(world);
      }
    }
  }
}

/** One-line objective text for the HUD. */
export function objectiveText(world) {
  const m = world.mission;
  if (m.done) return 'Story complete — free roam. Taxis and packages still pay.';
  if (!m.active) {
    if (world.missionFailed) return `Mission failed — press Enter to retry ${MISSION_NAMES[m.index]}.`;
    return 'Next mission incoming…';
  }
  switch (m.index) {
    case 0: return world.player.inCar ? 'Drive to the Rico marker.' : 'Steal a car (E near a car) and drive to the marker.';
    case 1: return `Deliver the package — drop ${m.data.dropIndex + 1}/3.`;
    case 2: return m.data.heated ? 'Now lose them all — stay clean and out of sight.' : 'Raise your wanted level to 3 stars (steal cars, hit peds).';
    case 3: return `Collect the cash drops: ${m.data.got}/3.`;
    case 4: return `Hit the checkpoints: ${m.data.pointIndex}/4.`;
    case 5: return m.stage === 0 ? 'Get to Solano First Bank.' : 'Escape to the safehouse — lose the 4-star heat!';
    default: return '';
  }
}

// ------------------------------------------------------------- side jobs

/** Start a taxi fare with the ped standing by the player. */
export function startTaxi(world, ped) {
  const rng = world.rng;
  const dest = world.city.randomRoadPoint(rng);
  const fare = Math.round((TAXI_FARE_MIN + rng.next() * (TAXI_FARE_MAX - TAXI_FARE_MIN)) / 5) * 5;
  ped.state = 'fare';
  ped.taxi = false;
  world.taxi = {
    ped, destX: dest.x, destY: dest.y,
    fare, timer: 75,
    marker: { x: dest.x, y: dest.y, label: 'Fare destination', color: '#2ecc71' },
  };
  world.message(`Taxi fare: take them to the marker — $${fare}`);
  world.audio.pickup();
}

export function updateTaxi(world, dt) {
  const t = world.taxi;
  if (!t) return;
  const p = world.player;
  t.timer -= dt;
  // The passenger rides in the player's car.
  if (p.inCar) {
    t.ped.x = p.inCar.x - Math.cos(p.inCar.angle) * 8;
    t.ped.y = p.inCar.y - Math.sin(p.inCar.angle) * 8;
  }
  if (t.timer <= 0) {
    world.message('Fare cancelled — too slow.');
    t.ped.state = 'walk';
    world.taxi = null;
    return;
  }
  if (p.inCar && dist(p.inCar.x, p.inCar.y, t.destX, t.destY) < 70) {
    world.cash += t.fare;
    world.message(`Fare complete! +$${t.fare}`);
    world.audio.cash();
    t.ped.state = 'walk';
    t.ped.x = t.destX + 20; t.ped.y = t.destY + 20;
    world.taxi = null;
    world.faresDone = (world.faresDone || 0) + 1;
  }
}

/** Spawn a taxi-hailing ped near the player when none is waiting. */
export function maybeSpawnTaxiPed(world) {
  if (world.taxi) return;
  if (world.peds.some((q) => q.state === 'taxi')) return;
  if (world.rng.chance(0.004)) {
    const cands = world.peds.filter((q) => !q.dead && q.state === 'walk' && dist(q.x, q.y, world.player.x, world.player.y) < 500);
    if (cands.length > 0) {
      const ped = cands[0];
      ped.state = 'taxi';
      ped.taxi = true;
      world.message('Someone is hailing a cab nearby — press E next to them with a car.');
    }
  }
}
