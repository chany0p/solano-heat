// Canvas drawing for the world: ground, roads, buildings with long shadows,
// beach and ocean, cars, peds, the player, effects and markers. All art is
// procedural — no images. The palette shifts with world.sun (day -> sunset).
import { WORLD_W, WORLD_H, GRID, ROAD_W, BEACH_Y, OCEAN_Y, PALETTES } from './config.js';
import { lerp } from './random.js';

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

function palette(sun) {
  const t = 1 - sun; // 0 = day, 1 = sunset
  const p = {};
  for (const k of Object.keys(PALETTES.day)) p[k] = mix(PALETTES.day[k], PALETTES.sunset[k], t);
  return p;
}

export function drawWorld(ctx, world, viewW, viewH) {
  const cam = world.cam;
  const pal = palette(world.sun);
  const zoom = cam.zoom;
  ctx.save();
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x, -cam.y);
  const vx0 = cam.x - 40, vy0 = cam.y - 40;
  const vx1 = cam.x + viewW / zoom + 40, vy1 = cam.y + viewH / zoom + 40;

  // Ground
  ctx.fillStyle = pal.ground;
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  // Beach and ocean (south edge)
  if (vy1 > BEACH_Y) {
    ctx.fillStyle = pal.sand;
    ctx.fillRect(vx0, Math.max(vy0, BEACH_Y), vx1 - vx0, Math.min(vy1, OCEAN_Y) - Math.max(vy0, BEACH_Y));
    ctx.fillStyle = pal.water;
    ctx.fillRect(vx0, Math.max(vy0, OCEAN_Y), vx1 - vx0, vy1 - Math.max(vy0, OCEAN_Y));
    // Wave lines
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const wy = OCEAN_Y + 12 + i * 14 + Math.sin(world.time * 1.5 + i * 2) * 3;
      if (wy < vy0 || wy > vy1) continue;
      ctx.beginPath();
      for (let x = vx0; x <= vx1; x += 40) {
        const y = wy + Math.sin(x * 0.02 + world.time * 2 + i) * 3;
        if (x === vx0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Parks and plazas
  for (const park of world.city.parks) {
    if (park.x > vx1 || park.x + park.w < vx0 || park.y > vy1 || park.y + park.h < vy0) continue;
    ctx.fillStyle = park.plaza ? '#b8b0a0' : '#5da24a';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    if (park.pond) {
      ctx.fillStyle = pal.water;
      ctx.beginPath();
      ctx.ellipse(park.x + park.w / 2, park.y + park.h / 2, park.w / 4, park.h / 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (park.plaza) {
      ctx.fillStyle = '#7fb3d5';
      ctx.beginPath();
      ctx.arc(park.x + park.w / 2, park.y + park.h / 2, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sidewalks: light border around each block.
  ctx.fillStyle = pal.sidewalk;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const x0 = GRID[col] + ROAD_W / 2;
      const y0 = GRID[row] + ROAD_W / 2;
      const x1 = GRID[col + 1] - ROAD_W / 2;
      const y1 = GRID[row + 1] - ROAD_W / 2;
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  // Roads
  ctx.fillStyle = pal.road;
  for (const cx of GRID) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, Math.min(vy1, 2360) - Math.max(vy0, 0));
  for (const cy of GRID) ctx.fillRect(0, cy - ROAD_W / 2, Math.min(vx1, WORLD_W) - Math.max(vx0, 0), ROAD_W);
  // Centre dashes
  ctx.strokeStyle = 'rgba(240,220,120,0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const cx of GRID) {
    ctx.beginPath(); ctx.moveTo(cx, Math.max(vy0, 0)); ctx.lineTo(cx, Math.min(vy1, 2360)); ctx.stroke();
  }
  for (const cy of GRID) {
    ctx.beginPath(); ctx.moveTo(Math.max(vx0, 0), cy); ctx.lineTo(Math.min(vx1, WORLD_W), cy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Trees
  for (const t of world.city.trees) {
    if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1) continue;
    ctx.fillStyle = '#3a5a2a';
    ctx.beginPath(); ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
  }

  // Buildings: shadow, walls, roof, windows. Long shadows at sunset.
  const shadowLen = lerp(6, 26, 1 - world.sun);
  for (const b of world.city.buildings) {
    if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + shadowLen, b.y + shadowLen * 0.6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Windows on the roof edge for tall buildings.
    if (b.hgt > 30) {
      ctx.fillStyle = 'rgba(255,240,180,0.85)';
      const cols = Math.floor(b.w / 18);
      const rows = Math.floor(b.h / 18);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if ((i * 7 + j * 13 + b.x) % 5 === 0) ctx.fillRect(b.x + 8 + i * 18, b.y + 8 + j * 18, 8, 6);
        }
      }
    }
    if (b.landmark) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y - 8);
    }
  }

  // Skid marks
  ctx.strokeStyle = 'rgba(20,20,20,0.55)';
  ctx.lineWidth = 4;
  for (const s of world.skids) {
    ctx.globalAlpha = Math.min(1, s.life);
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
    ctx.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Hidden packages (gold glow) and cash drops
  for (const pkg of world.city.packages) {
    if (pkg.found) continue;
    if (pkg.x < vx0 || pkg.x > vx1 || pkg.y < vy0 || pkg.y > vy1) continue;
    const pulse = 0.6 + Math.sin(world.time * 4 + pkg.x) * 0.4;
    ctx.fillStyle = `rgba(255,215,0,${0.25 + pulse * 0.25})`;
    ctx.beginPath(); ctx.arc(pkg.x, pkg.y, 16 + pulse * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(pkg.x - 7, pkg.y - 5, 14, 10);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(pkg.x - 7, pkg.y - 1, 14, 2);
    ctx.fillRect(pkg.x - 1, pkg.y - 5, 2, 10);
  }
  for (const d of world.drops) {
    if (d.taken) continue;
    if (d.x < vx0 || d.x > vx1 || d.y < vy0 || d.y > vy1) continue;
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(d.x, d.y, 14 + Math.sin(world.time * 5) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', d.x, d.y + 5);
  }
  // Pickups
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (pk.x < vx0 || pk.x > vx1 || pk.y < vy0 || pk.y > vy1) continue;
    ctx.fillStyle = pk.kind === 'ammo' ? '#f39c12' : pk.kind === 'health' ? '#e74c3c' : '#3498db';
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'ammo' ? 'A' : pk.kind === 'health' ? '+' : 'S', pk.x, pk.y + 4);
  }

  // Mission / taxi markers: beacon column + bouncing diamond.
  drawMarker(ctx, world);

  // Particles (blood, smoke)
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Vehicles
  for (const car of world.vehicles) {
    if (car.x < vx0 - 60 || car.x > vx1 + 60 || car.y < vy0 - 60 || car.y > vy1 + 60) continue;
    drawCar(ctx, car, world);
  }

  // Peds, cops, player
  for (const ped of world.peds) {
    if (ped.dead) { drawDeadPed(ctx, ped); continue; }
    if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
    drawPed(ctx, ped, world);
  }
  for (const cop of world.police.cops) {
    if (cop.dead) continue;
    if (cop.x < vx0 || cop.x > vx1 || cop.y < vy0 || cop.y > vy1) continue;
    drawCop(ctx, cop, world);
  }
  const p = world.player;
  if (!p.dead && !p.inCar) drawPlayerOnFoot(ctx, p, world);

  // Bullets
  ctx.strokeStyle = '#ffe08a';
  ctx.lineWidth = 2;
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (world.muzzle > 0 && !p.inCar) {
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Explosions
  for (const e of world.explosions) {
    const a = Math.max(0, e.life / 0.7);
    ctx.fillStyle = `rgba(255,${Math.floor(120 + 100 * a)},0,${a})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,60,0,${a * 0.8})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  // Sunset wash over everything.
  if (world.sun < 0.9) {
    ctx.fillStyle = `rgba(255,120,40,${(0.9 - world.sun) * 0.22})`;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  }
  ctx.restore();
}

function drawMarker(ctx, world) {
  const markers = [];
  if (world.mission.marker) markers.push(world.mission.marker);
  if (world.taxi) markers.push(world.taxi.marker);
  // Safehouse and respray icons (small, always).
  const sh = world.city.landmarks.safehouse;
  markers.push({ x: sh.x + sh.w / 2, y: sh.y + sh.h / 2, label: 'H', color: '#2ecc71', small: true });
  const g = world.city.landmarks.respray;
  markers.push({ x: g.x + g.w / 2, y: g.y + g.h / 2, label: 'R', color: '#9b59b6', small: true });
  for (const m of markers) {
    if (m.small) {
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, m.x, m.y + 4);
      continue;
    }
    // Beacon column
    const grad = ctx.createLinearGradient(m.x, m.y - 120, m.x, m.y);
    grad.addColorStop(0, 'rgba(255,209,102,0)');
    grad.addColorStop(1, 'rgba(255,209,102,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(m.x - 8, m.y - 120, 16, 120);
    const bob = Math.sin(world.time * 3) * 5;
    ctx.save();
    ctx.translate(m.x, m.y - 26 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = m.color;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, m.x, m.y - 44 + bob);
  }
}

function drawCar(ctx, car, world) {
  const spec = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = spec.length, W = spec.width;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // Body
  ctx.fillStyle = car.exploded ? '#222' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  if (!car.exploded) {
    // Windshield + roof
    ctx.fillStyle = 'rgba(20,30,40,0.85)';
    ctx.fillRect(L / 2 - 16, -W / 2 + 3, 9, W - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-6, -W / 2 + 3, 14, W - 6);
    // Headlights
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 4);
    ctx.fillRect(L / 2 - 2, W / 2 - 6, 3, 4);
    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-L / 2 + 6, -W / 2 - 2, 10, 4);
    ctx.fillRect(-L / 2 + 6, W / 2 - 2, 10, 4);
    ctx.fillRect(L / 2 - 16, -W / 2 - 2, 10, 4);
    ctx.fillRect(L / 2 - 16, W / 2 - 2, 10, 4);
    if (car.type === 'police') {
      // Livery + light bar
      ctx.fillStyle = '#fff';
      ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L - 4, 5);
      ctx.fillRect(-L / 2 + 2, W / 2 - 7, L - 4, 5);
      const flash = Math.floor(world.time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
      ctx.fillRect(-4, -W / 2 - 1, 8, 5);
      ctx.fillStyle = flash ? '#2e7bff' : '#ff2e2e';
      ctx.fillRect(-4, W / 2 - 4, 8, 5);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    // Damage smoke is handled by particles; cracked look when hurt.
    if (car.hp < car.maxHp * 0.4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L / 2 - 14, -W / 2 + 4);
      ctx.lineTo(L / 2 - 6, 0);
      ctx.lineTo(L / 2 - 12, W / 2 - 4);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#444';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WRECK', 0, 3);
  }
  ctx.restore();
}

function drawPed(ctx, ped, world) {
  const bob = Math.sin(ped.walkPhase) * 1.5;
  ctx.save();
  ctx.translate(ped.x, ped.y + bob * 0.3);
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2); ctx.fill();
  // Fleeing: exclamation; taxi: dollar sign above.
  if (ped.state === 'flee') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -14);
  }
  if (ped.state === 'taxi') {
    const pulse = 0.7 + Math.sin(world.time * 5) * 0.3;
    ctx.fillStyle = `rgba(46,204,113,${pulse})`;
    ctx.beginPath(); ctx.arc(0, -16, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, -12);
  }
  ctx.restore();
}

function drawDeadPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(160,24,24,0.5)';
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, ped.angle, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, ped.angle, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCop(ctx, cop, world) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c2733';
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2e7bff';
  ctx.beginPath(); ctx.arc(Math.cos(cop.angle) * 3, Math.sin(cop.angle) * 3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PD', 0, 3);
  ctx.restore();
}

function drawPlayerOnFoot(ctx, p, world) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.hurtTimer > 0 && Math.floor(world.time * 12) % 2 === 0) ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 5, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Legs animate when moving.
  const legSwing = p.moving ? Math.sin(world.time * (p.sprinting ? 16 : 11)) * 4 : 0;
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(-3 + legSwing * 0.4, 4, 5, 7);
  ctx.fillRect(-2 - legSwing * 0.4, 4, 5, 7);
  // Body: teal jacket, the player's signature colour.
  ctx.fillStyle = '#0e9b8a';
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  // Head + cap
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f7c948';
  ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3, 5.5, p.angle - 1.2, p.angle + 1.2); ctx.fill();
  // Pistol
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(Math.cos(p.angle) * 8, Math.sin(p.angle) * 8);
  ctx.lineTo(Math.cos(p.angle) * 17, Math.sin(p.angle) * 17);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
