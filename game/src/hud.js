// HUD and menus, all drawn on the canvas: wanted stars, health and armor,
// cash and mission timer, the minimap, objective text, speed and ammo, the
// message feed, and the title / pause / wasted / busted / mission screens.
import { WORLD_W, WORLD_H, GRID, ROAD_W, BEACH_Y, OCEAN_Y, PLAYER } from './config.js';
import { clamp } from './random.js';
import { MISSION_NAMES, objectiveText } from './missions.js';

/** Draw the in-game HUD over the world. */
export function drawHUD(ctx, world, viewW, viewH) {
  const p = world.player;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Top-left: wanted stars, health, armor.
  let y = 30;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < world.wanted ? '#ffd166' : 'rgba(0,0,0,0.45)';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    drawStar(ctx, 28 + i * 30, y, i < world.wanted ? 13 : 11);
  }
  y += 22;
  bar(ctx, 16, y, 150, 14, p.health / PLAYER.health, '#2ecc71');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.health)}`, 172, y + 11);
  y += 20;
  bar(ctx, 16, y, 150, 10, p.armor / PLAYER.armor, '#3498db');
  ctx.fillText(`ARMOR ${Math.ceil(p.armor)}`, 172, y + 9);
  y += 26;
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(world.city.districtAt(p.x, p.y), 16, y);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '11px sans-serif';
  ctx.fillText(world.sun < 0.8 ? 'Sunset — Port Solano' : 'Port Solano', 16, y + 15);

  // Top-right: cash, mission timer, packages.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`$${world.cash}`, viewW - 16, 36);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  if (world.mission.active && world.mission.timer > 0) {
    ctx.fillStyle = world.mission.timer < 15 ? '#ff5b5b' : '#ffd166';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`⏱ ${Math.ceil(world.mission.timer)}s`, viewW - 16, 62);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Packages ${world.packagesFound}/20   Fares ${world.faresDone}`, viewW - 16, 82);
  ctx.textAlign = 'left';

  // Message feed, top-centre.
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  let my = 30;
  for (const m of world.messages) {
    ctx.globalAlpha = Math.min(1, m.t);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(m.text).width + 20;
    ctx.fillRect(viewW / 2 - w / 2, my - 16, w, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(m.text, viewW / 2, my);
    my += 26;
  }
  ctx.globalAlpha = 1;

  // Mission banner.
  if (world.mission.banner) {
    const b = world.mission.banner;
    ctx.globalAlpha = Math.min(1, b.t);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 120, viewW, 74);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(b.title, viewW / 2, 150);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.fillText(b.sub, viewW / 2, 176);
    ctx.globalAlpha = 1;
  }
  if (world.missionPassed) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 120, viewW, 60);
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`MISSION PASSED — ${world.missionPassed.name}`, viewW / 2, 148);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(`+$${world.missionPassed.reward}`, viewW / 2, 170);
  }
  if (world.missionFailed) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 120, viewW, 60);
    ctx.fillStyle = '#ff5b5b';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`MISSION FAILED — ${world.missionFailed.name}`, viewW / 2, 148);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${world.missionFailed.reason} — press Enter to retry`, viewW / 2, 170);
  }

  // Bottom-centre: objective.
  ctx.font = 'bold 15px sans-serif';
  const obj = objectiveText(world);
  const ow = ctx.measureText(obj).width + 24;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(viewW / 2 - ow / 2, viewH - 52, ow, 28);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(obj, viewW / 2, viewH - 33);

  // Bottom-right: speed and weapon.
  ctx.textAlign = 'right';
  if (p.inCar) {
    const kmh = Math.round(Math.abs(p.inCar.speed) * 0.32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`${kmh}`, viewW - 16, viewH - 66);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('km/h', viewW - 16, viewH - 48);
    ctx.fillText(p.inCar.spec.name, viewW - 16, viewH - 28);
    if (p.inCar.hp < p.inCar.maxHp * 0.4) {
      ctx.fillStyle = '#ff5b5b';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('CAR DAMAGED — find a respray (R)', viewW - 16, viewH - 96);
    }
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`Pistol  ${p.ammoClip} / ${p.ammoReserve}`, viewW - 16, viewH - 66);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Click to shoot — F to punch', viewW - 16, viewH - 46);
  }
  ctx.textAlign = 'left';

  // Minimap, bottom-left.
  drawMinimap(ctx, world, 16, viewH - 196, 180, 180);
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(frac, 0, 1), h - 2);
}

function drawStar(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** The minimap: roads, water, player, mission marker, police blips. */
export function drawMinimap(ctx, world, x, y, w, h) {
  const s = w / WORLD_W;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#3f7a44';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2b7fb8';
  ctx.fillRect(x, y + BEACH_Y * s, w, (OCEAN_Y - BEACH_Y) * s);
  ctx.fillRect(x, y + OCEAN_Y * s, w, h - OCEAN_Y * s);
  ctx.fillStyle = '#e8d28a';
  ctx.fillRect(x, y + BEACH_Y * s, w, (OCEAN_Y - BEACH_Y) * s);
  ctx.fillStyle = '#555c66';
  for (const cx of GRID) ctx.fillRect(x + (cx - ROAD_W / 2) * s, y, ROAD_W * s, h);
  for (const cy of GRID) ctx.fillRect(x, y + (cy - ROAD_W / 2) * s, w, ROAD_W * s);
  // Mission marker
  const mm = world.mission.marker;
  if (mm) {
    ctx.fillStyle = '#ffd166';
    const pulse = 5 + Math.sin(world.time * 5) * 2;
    ctx.beginPath(); ctx.arc(x + mm.x * s, y + mm.y * s, pulse, 0, Math.PI * 2); ctx.fill();
  }
  if (world.taxi) {
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(x + world.taxi.destX * s, y + world.taxi.destY * s, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Police blips (blue/red)
  for (const c of world.police.cruisers) {
    ctx.fillStyle = Math.floor(world.time * 3) % 2 === 0 ? '#ff2e2e' : '#2e7bff';
    ctx.beginPath(); ctx.arc(x + c.x * s, y + c.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow
  const p = world.player;
  ctx.save();
  ctx.translate(x + p.x * s, y + p.y * s);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Border + label
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('PORT SOLANO', x, y - 8);
}

// ------------------------------------------------------------- screens

function panel(ctx, viewW, viewH, title, lines, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,22,0.82)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#ffd166';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, viewW / 2, viewH / 2 - 110);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  let y = viewH / 2 - 60;
  for (const line of lines) {
    ctx.fillText(line, viewW / 2, y);
    y += 26;
  }
  ctx.restore();
}

export function drawTitle(ctx, world, viewW, viewH, hasSave) {
  // A live city backdrop behind the title: draw the world first, then dim it.
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,20,0.72)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff9e5e';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLANO HEAT', viewW / 2, 150);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('An open-world crime story in Port Solano', viewW / 2, 186);
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  const lines = [
    'WASD move / drive   •   Mouse aim, Click shoot   •   F punch',
    'E enter / exit car   •   Shift sprint   •   Space handbrake',
    'Esc pause   •   M mute   •   Steal cars, lose the heat, run Rico\'s jobs',
    '',
    hasSave ? 'Press ENTER to continue your story — or N for a new game' : 'Press ENTER to start',
  ];
  let y = 250;
  for (const line of lines) { ctx.fillText(line, viewW / 2, y); y += 28; }
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Six missions. Twenty hidden packages. Taxis that pay. The whole city is yours.', viewW / 2, y + 20);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px sans-serif';
  ctx.fillText('SOLANO HEAT is an original game. Port Solano, Rico and every character are invented for it.', viewW / 2, viewH - 24);
  ctx.restore();
}

export function drawPause(ctx, viewW, viewH) {
  panel(ctx, viewW, viewH, 'PAUSED', [
    'Esc — resume',
    'R — restart mission',
    'M — mute / unmute',
    'Q — quit to title (progress autosaves after missions)',
  ]);
}

export function drawWasted(ctx, viewW, viewH, cash) {
  panel(ctx, viewW, viewH, 'WASTED', [
    'The streets of Port Solano got you.',
    `You dropped $${Math.floor(cash * 0.1)} to the hospital bill.`,
    '',
    'Press ENTER to wake up at the safehouse',
  ], '#ff5b5b');
}

export function drawBusted(ctx, viewW, viewH, cash) {
  panel(ctx, viewW, viewH, 'BUSTED', [
    'The Solano PD caught up with you.',
    `Bail cost $${Math.floor(cash * 0.1)}. Your heat is gone — for now.`,
    '',
    'Press ENTER to walk out of the precinct',
  ], '#5b8cff');
}

export function drawMissionFailed(ctx, viewW, viewH, name) {
  panel(ctx, viewW, viewH, 'MISSION FAILED', [
    `${name} did not go to plan.`,
    '',
    'Press ENTER to retry the mission',
    'Press Esc for the title screen',
  ], '#ff5b5b');
}
