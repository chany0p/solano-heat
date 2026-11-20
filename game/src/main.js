// SOLANO HEAT — boot, the game loop and the screens. The world simulation
// lives in world.js; this file owns the canvas, the loop, the screen state
// machine (title / play / pause / wasted / busted), saving, and the
// ?shot= / ?autotest= modes used for screenshots and playtests.
import { createWorld, resetWorld, stepWorld } from './world.js';
import { drawWorld } from './render.js';
import { drawHUD, drawTitle, drawPause, drawWasted, drawBusted } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, applySave, hasSave } from './save.js';
import { stageShot, driveToTarget, walkToTarget } from './shots.js';
import { startMission } from './missions.js';
import { clearPolice } from './police.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 1337) || 1337;
const shotName = params.get('shot');
const autotest = params.get('autotest') === '1';
const debug = params.get('debug') === '1';

const input = new Input(canvas);
const audio = new AudioEngine();
const world = createWorld(seed);
world.audio = audio;
world.save = () => saveGame(world);
world.debug = debug;

let screen = 'title'; // title | play | pause | wasted | busted
let saveData = null;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * window.devicePixelRatio);
  canvas.height = Math.floor(h * window.devicePixelRatio);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  world.cam.viewW = w;
  world.cam.viewH = h;
  world.cam.zoom = Math.max(0.7, Math.min(w / 1280, h / 720));
}
window.addEventListener('resize', resize);
resize();

// First gesture unlocks audio.
window.addEventListener('pointerdown', () => audio.ensure(), { once: false });
window.addEventListener('keydown', () => audio.ensure(), { once: false });

function startNewGame() {
  resetWorld(world);
  world.audio = audio;
  world.save = () => saveGame(world);
  resize(); // resetWorld swaps in a fresh cam — re-apply the real window size.
  screen = 'play';
  world.message('Welcome to Port Solano. Rico needs wheels — steal a car!');
}

function continueGame() {
  resetWorld(world);
  world.audio = audio;
  world.save = () => saveGame(world);
  resize(); // resetWorld swaps in a fresh cam — re-apply the real window size.
  const data = loadGame();
  if (data) applySave(world, data);
  screen = 'play';
  world.message('Welcome back to Port Solano.');
}

function respawnAfterIncident() {
  const p = world.player;
  const sh = world.city.landmarks.safehouse;
  clearPolice(world);
  if (p.inCar) { p.inCar.driver = 'none'; p.inCar = null; }
  p.x = sh.x + sh.w / 2;
  p.y = sh.y + sh.h + 30;
  p.health = 100;
  p.armor = 50;
  p.dead = false;
  world.cash = Math.floor(world.cash * 0.9);
  world.save();
  screen = 'play';
  world.message('You are back on your feet. Stay sharp.');
}

function handleScreens() {
  if (input.pressed('KeyM')) {
    audio.setMuted(!audio.muted);
    world.message(audio.muted ? 'Sound muted (M to unmute)' : 'Sound on');
  }
  if (screen === 'title') {
    if (input.pressed('Enter')) {
      if (hasSave() && saveData) continueGame();
      else startNewGame();
    }
    if (input.pressed('KeyN')) startNewGame();
    return;
  }
  if (screen === 'play') {
    if (input.pressed('Escape')) { screen = 'pause'; return; }
    if (input.pressed('Enter') && world.missionFailed) {
      world.missionFailed = null;
      startMission(world, world.mission.index);
      world.message('Mission restarted.');
      return;
    }
    return;
  }
  if (screen === 'pause') {
    if (input.pressed('Escape')) { screen = 'play'; return; }
    if (input.pressed('KeyR')) {
      startMission(world, world.mission.index);
      screen = 'play';
      world.message('Mission restarted.');
      return;
    }
    if (input.pressed('KeyQ')) { screen = 'title'; saveData = loadGame(); return; }
    return;
  }
  if (screen === 'wasted' || screen === 'busted') {
    if (input.pressed('Enter')) respawnAfterIncident();
  }
}

function consumeEvents() {
  for (const e of world.events) {
    if (e.type === 'wasted') {
      audio.engineOff();
      audio.fail();
      screen = 'wasted';
    } else if (e.type === 'busted') {
      audio.engineOff();
      audio.busted();
      screen = 'busted';
    }
  }
  world.events = [];
}

// ------------------------------------------------------------ autotest
// ?autotest=1 plays the game itself: walk to a parked car, steal it, drive
// to Rico's marker and finish mission 1, logging each step to the console.
const test = { phase: 'walk', t: 0, log: [] };
function autotestStep(dt) {
  const p = world.player;
  test.t += dt;
  const log = (s) => { test.log.push(s); console.log(`AUTOTEST ${s}`); };
  if (test.phase === 'walk') {
    const car = world.nearestCar(p.x, p.y, 900);
    if (!car) { log('FAIL no car near spawn'); test.phase = 'done'; return; }
    if (Math.hypot(car.x - p.x, car.y - p.y) < 46) {
      input.setSynthetic({ KeyE: 'press' });
      test.phase = 'enter';
      return;
    }
    walkToTarget(world, input, car.x, car.y);
    if (test.t > 30) { log('FAIL walk timeout'); test.phase = 'done'; }
  } else if (test.phase === 'enter') {
    // The E press was set last step; the world step has processed it by now.
    if (p.inCar) { log('PASS stole car, wanted=' + world.wanted); test.phase = 'drive'; test.t = 0; input.clearSynthetic(); }
    else if (test.t > 3) { log('FAIL could not enter car'); test.phase = 'done'; }
  } else if (test.phase === 'drive') {
    if (world.mission.index > 0 || world.missionPassed) {
      log(`PASS mission 1 complete, cash=${world.cash}, wanted=${world.wanted}`);
      test.phase = 'done';
      document.title = 'AUTOTEST PASS';
      return;
    }
    const m = world.mission.marker;
    if (!m) { log('FAIL no mission marker'); test.phase = 'done'; return; }
    driveToTarget(world, input, m.x, m.y);
    if (Math.floor(test.t * 2) !== Math.floor((test.t - STEP) * 2)) {
      const c = p.inCar;
      const near = world.vehicles.filter((v) => v !== c && Math.hypot(v.x - p.x, v.y - p.y) < 150)
        .map((v) => `${v.type}@(${Math.round(v.x)},${Math.round(v.y)},${v.driver})`).join(' ');
      const hit = world.city.buildingHit(p.x, p.y, 19);
      console.log(`AUTOTRACE t=${test.t.toFixed(1)} car=(${Math.round(p.x)},${Math.round(p.y)}) sp=${Math.round(c ? c.speed : 0)} ang=${c ? c.angle.toFixed(2) : '-'} hit=${hit ? `b(${Math.round(hit.x)},${Math.round(hit.y)},${Math.round(hit.w)}x${Math.round(hit.h)})` : 'none'} near=[${near}]`);
    }
    if (test.t > 40) { log(`FAIL drive timeout at (${Math.round(p.x)},${Math.round(p.y)}) marker (${m.x},${m.y})`); test.phase = 'done'; }
  } else if (test.phase === 'done') {
    input.clearSynthetic();
    console.log('AUTOTEST DONE ' + test.log.join(' | '));
    document.title = 'AUTOTEST ' + (test.log.some((l) => l.startsWith('FAIL')) ? 'FAIL' : 'PASS');
    test.reported = true;
  }
}

// ------------------------------------------------------------ loop
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  handleScreens();
  if (screen === 'play') {
    if (autotest) {
      // Headless virtual time jumps far per frame; run up to 240 fixed steps
      // per frame so the simulated clock keeps up with the virtual clock.
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 240) {
        if (test.phase !== 'done' || !test.reported) autotestStep(STEP);
        stepWorld(world, STEP, input);
        input.endFrame();
        acc -= STEP;
        n++;
      }
      if (n === 240) acc = 0;
    } else {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        stepWorld(world, STEP, input);
        input.endFrame();
        acc -= STEP;
        n++;
      }
      if (n === 5) acc = 0;
    }
    consumeEvents();
  } else {
    // Title screen: let the city idle behind the menu.
    if (screen === 'title') {
      stepWorld(world, STEP, input);
      input.endFrame();
      // Keep the player parked at the spawn so the backdrop is stable.
      world.player.x = 510;
      world.player.y = 650;
    } else {
      input.endFrame();
    }
  }
  drawWorld(ctx, world, world.cam.viewW, world.cam.viewH);
  if (screen === 'play' || screen === 'pause') drawHUD(ctx, world, world.cam.viewW, world.cam.viewH);
  if (screen === 'title') drawTitle(ctx, world, world.cam.viewW, world.cam.viewH, hasSave());
  if (screen === 'pause') drawPause(ctx, world.cam.viewW, world.cam.viewH);
  if (screen === 'wasted') drawWasted(ctx, world.cam.viewW, world.cam.viewH, world.cash);
  if (screen === 'busted') drawBusted(ctx, world.cam.viewW, world.cam.viewH, world.cash);
}

// Shot mode: stage the scene once, then hold the frame (no live stepping).
if (shotName) {
  saveData = null;
  screen = stageShot(shotName, world, input);
  drawWorld(ctx, world, 1280, 720);
  drawHUD(ctx, world, 1280, 720);
  // Keep rendering the staged frame so the headless screenshot catches it.
  requestAnimationFrame(function hold() {
    requestAnimationFrame(hold);
    drawWorld(ctx, world, 1280, 720);
    drawHUD(ctx, world, 1280, 720);
  });
} else {
  saveData = loadGame();
  if (autotest) {
    screen = 'play';
    world.message('Autotest running…');
  }
  requestAnimationFrame(frame);
}

// Debug handle for playtests.
window.__solano = { world, input, audio, get screen() { return screen; }, set screen(s) { screen = s; } };
console.log('SOLANO HEAT ready — seed ' + seed + (shotName ? ' shot=' + shotName : '') + (autotest ? ' autotest' : ''));
