// Port Solano — the city itself. buildCity(seed) lays out the road grid, fills
// every block with buildings, parks or plazas, places the landmarks, the
// safehouse, the respray garage, the bank and the 20 hidden packages, all
// from the seeded RNG so the same seed always builds the same map.
import { WORLD_W, WORLD_H, GRID, ROAD_W, BEACH_Y, OCEAN_Y, DISTRICTS, PACKAGE_COUNT } from './config.js';
import { makeRng, clamp } from './random.js';

const BUILDING_COLORS = ['#b5654a', '#c98a4b', '#7d8a99', '#a89a7a', '#8a6d8f', '#5f7d8a', '#b0a18a', '#6b7f5e', '#96705a'];
const ROOF_COLORS = ['#5a4a3a', '#6b5a4a', '#4a5560', '#7a6a5a'];
const PARK_TREES = ['#2e7d32', '#388e3c', '#43a047', '#1b5e20'];

// Landmark blocks, by grid cell (col,row) between roads. Each becomes a big
// named building with its own colour and footprint.
const LANDMARKS = [
  { key: 'casino',    name: 'The Golden Palm Casino', col: 3, row: 1, color: '#d4af37', roof: '#8a6d1f', w: 200, h: 130 },
  { key: 'stadium',   name: 'Solano Stadium',         col: 1, row: 5, color: '#7d9b76', roof: '#4a6b44', w: 210, h: 150 },
  { key: 'mall',      name: 'Palm Court Mall',        col: 6, row: 1, color: '#c97b7b', roof: '#8a4a4a', w: 200, h: 130 },
  { key: 'bank',      name: 'Solano First Bank',      col: 4, row: 3, color: '#9aa7b5', roof: '#5a6b7d', w: 160, h: 110 },
  { key: 'hotel',     name: 'Marina Grand Hotel',     col: 2, row: 6, color: '#e8b4b8', roof: '#a06a6a', w: 170, h: 120 },
  { key: 'arena',     name: 'Neon Dome',              col: 5, row: 0, color: '#6a5acd', roof: '#3a2a7a', w: 190, h: 120 },
];

function blockRect(col, row) {
  const x0 = GRID[col] + ROAD_W / 2 + 6;
  const y0 = GRID[row] + ROAD_W / 2 + 6;
  const x1 = GRID[col + 1] - ROAD_W / 2 - 6;
  const y1 = GRID[row + 1] - ROAD_W / 2 - 6;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return 'Port Solano';
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const trees = [];
  const landmarks = {};
  const landmarkCells = new Set(LANDMARKS.map((l) => `${l.col},${l.row}`));

  // The bottom row of blocks (row 6) is beachfront: no buildings, just palms.
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const r = blockRect(col, row);
      const key = `${col},${row}`;
      const lm = LANDMARKS.find((l) => l.col === col && l.row === row);
      if (lm) {
        const bx = r.x + (r.w - lm.w) / 2;
        const by = r.y + (r.h - lm.h) / 2;
        const b = { x: bx, y: by, w: lm.w, h: lm.h, color: lm.color, roof: lm.roof, hgt: 26, landmark: lm.key, name: lm.name, district: districtAt(bx, by) };
        buildings.push(b);
        landmarks[lm.key] = b;
        continue;
      }
      if (landmarkCells.has(key)) continue;
      if (row === 6) {
        // Beachfront strip: palms and sand, no buildings.
        for (let i = 0; i < 5; i++) trees.push({ x: rng.range(r.x + 10, r.x + r.w - 10), y: rng.range(r.y + 10, r.y + r.h - 10), r: rng.range(7, 11), color: rng.pick(PARK_TREES) });
        continue;
      }
      const roll = rng.next();
      if (col === 1 && row === 1) {
        // Rico's safehouse takes this whole block: a house with a yard, no
        // other buildings, so it never touches a road.
        const b = { x: r.x + (r.w - 70) / 2, y: r.y + (r.h - 54) / 2, w: 70, h: 54, color: '#e8b4b8', roof: '#a06a6a', hgt: 16, landmark: 'safehouse', name: "Rico's Safehouse", district: districtAt(r.x, r.y) };
        buildings.push(b);
        landmarks.safehouse = b;
        continue;
      }
      if (col === 3 && row === 4) {
        // Spray & Go respray garage: its own block, clear of the roads.
        const b = { x: r.x + (r.w - 80) / 2, y: r.y + (r.h - 60) / 2, w: 80, h: 60, color: '#4a6b8a', roof: '#2a4a6a', hgt: 14, landmark: 'respray', name: 'Spray & Go Garage', district: districtAt(r.x, r.y) };
        buildings.push(b);
        landmarks.respray = b;
        continue;
      }
      if (roll < 0.16) {
        // Park block: grass + trees + a pond in some.
        const park = { x: r.x, y: r.y, w: r.w, h: r.h, pond: rng.chance(0.35), district: districtAt(r.x, r.y) };
        parks.push(park);
        const n = rng.int(6, 12);
        for (let i = 0; i < n; i++) trees.push({ x: rng.range(r.x + 12, r.x + r.w - 12), y: rng.range(r.y + 12, r.y + r.h - 12), r: rng.range(6, 11), color: rng.pick(PARK_TREES) });
        continue;
      }
      if (roll < 0.22) {
        // Plaza: open paved block with a fountain circle.
        parks.push({ x: r.x, y: r.y, w: r.w, h: r.h, plaza: true, district: districtAt(r.x, r.y) });
        continue;
      }
      // Building block: 1 big, 2 medium or 4 small buildings.
      const count = rng.pick([1, 2, 2, 4]);
      const cols = count === 1 ? 1 : count === 2 ? 2 : 2;
      const rows = count === 1 ? 1 : count === 2 ? 1 : 2;
      const cw = r.w / cols;
      const ch = r.h / rows;
      for (let by = 0; by < rows; by++) {
        for (let bx = 0; bx < cols; bx++) {
          const inset = 8;
          const bw = cw - inset * 2 - rng.range(0, 14);
          const bh = ch - inset * 2 - rng.range(0, 14);
          const bx0 = r.x + bx * cw + inset + rng.range(0, 6);
          const by0 = r.y + by * ch + inset + rng.range(0, 6);
          const tall = rng.chance(0.18);
          buildings.push({
            x: bx0, y: by0, w: bw, h: bh,
            color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS),
            hgt: tall ? rng.int(34, 60) : rng.int(14, 26),
            district: districtAt(bx0, by0),
          });
        }
      }
    }
  }

  // Lighthouse on the beach, south-west of the marina.
  landmarks.lighthouse = { x: 320, y: BEACH_Y + 18, w: 34, h: 34, color: '#f5f5f5', roof: '#c0392b', hgt: 44, landmark: 'lighthouse', name: 'Solano Lighthouse', district: 'Marina Bay' };
  buildings.push(landmarks.lighthouse);

  // Hidden packages: tucked against building corners and park edges.
  const packages = [];
  const spots = [];
  for (const b of buildings) {
    if (b.landmark) continue;
    spots.push({ x: b.x - 14, y: b.y + b.h / 2 });
    spots.push({ x: b.x + b.w + 14, y: b.y + b.h / 2 });
  }
  for (const p of parks) spots.push({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
  const shuffled = rng.shuffled(spots);
  for (let i = 0; i < PACKAGE_COUNT && i < shuffled.length; i++) {
    packages.push({ x: clamp(shuffled[i].x, 90, WORLD_W - 90), y: clamp(shuffled[i].y, 90, BEACH_Y - 20), found: false });
  }

  const city = {
    seed, buildings, parks, trees, landmarks, packages,
    roadsX: GRID.slice(), roadsY: GRID.slice(),
    isRoadAt(x, y) {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
      for (const cx of GRID) if (Math.abs(x - cx) <= ROAD_W / 2) return true;
      for (const cy of GRID) if (Math.abs(y - cy) <= ROAD_W / 2) return true;
      return false;
    },
    isWaterAt(x, y) { return y >= OCEAN_Y; },
    isBeachAt(x, y) { return y >= BEACH_Y && y < OCEAN_Y; },
    districtAt,
    /** Circle (x,y,r) overlapping any building; returns the building or null. */
    buildingHit(x, y, r) {
      for (const b of buildings) {
        if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
      }
      return null;
    },
    /** A random point on a road, for spawning traffic and police. */
    randomRoadPoint(rng2) {
      if (rng2.chance(0.5)) {
        return { x: rng2.pick(GRID) + rng2.range(-14, 14), y: rng2.range(120, BEACH_Y - 60), axis: 'y' };
      }
      return { x: rng2.range(120, WORLD_W - 120), y: rng2.pick(GRID) + rng2.range(-14, 14), axis: 'x' };
    },
    /** Nearest road centre line point to (x,y). */
    nearestRoadPoint(x, y) {
      let best = null; let bd = Infinity;
      for (const cx of GRID) {
        const d = Math.abs(x - cx);
        if (d < bd) { bd = d; best = { x: cx, y: clamp(y, 100, BEACH_Y - 40), axis: 'y' }; }
      }
      for (const cy of GRID) {
        const d = Math.abs(y - cy);
        if (d < bd) { bd = d; best = { x: clamp(x, 100, WORLD_W - 100), y: cy, axis: 'x' }; }
      }
      return best;
    },
  };
  return city;
}
