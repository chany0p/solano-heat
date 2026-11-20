// SOLANO HEAT — tuning constants for the whole game. One place for every number
// a designer would want to tweak: world size, speeds, money, police pressure.
export const WORLD_W = 2400;
export const WORLD_H = 2400;
export const ROAD_W = 64;
// Road centre lines: an 8x8 grid, 300 apart. Blocks sit between them.
export const GRID = [150, 450, 750, 1050, 1350, 1650, 1950, 2250];
export const BEACH_Y = 2290; // sand begins
export const OCEAN_Y = 2360; // water begins (south edge of the map)
export const VIEW_W = 1280;
export const VIEW_H = 720;

// On-foot player
export const PLAYER = {
  radius: 11,
  walkSpeed: 170,
  sprintSpeed: 265,
  health: 100,
  armor: 50,
  punchDamage: 25,
  punchRange: 30,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
  pistolClip: 12,
  pistolReserveMax: 60,
  bulletSpeed: 780,
};

// Cars: type -> physics and looks
export const CAR_TYPES = {
  sedan:   { name: 'Sedan',   length: 46, width: 22, accel: 260, maxSpeed: 400, reverse: 150, turn: 2.6, grip: 6.5, hp: 100, colors: ['#c0392b', '#2e6fb0', '#d8d8d8', '#3a3f44', '#7d5ba6'] },
  taxi:    { name: 'Taxi',    length: 46, width: 22, accel: 250, maxSpeed: 390, reverse: 150, turn: 2.6, grip: 6.5, hp: 100, colors: ['#f7c948'] },
  coupe:   { name: 'Coupe',   length: 44, width: 21, accel: 300, maxSpeed: 430, reverse: 160, turn: 2.9, grip: 7.0, hp: 90,  colors: ['#e74c3c', '#1abc9c', '#e67e22', '#ecf0f1'] },
  van:     { name: 'Van',     length: 54, width: 24, accel: 200, maxSpeed: 330, reverse: 130, turn: 2.1, grip: 5.5, hp: 140, colors: ['#95a5a6', '#5d6d7e', '#a569bd'] },
  truck:   { name: 'Truck',   length: 62, width: 26, accel: 170, maxSpeed: 300, reverse: 120, turn: 1.9, grip: 5.0, hp: 180, colors: ['#7f8c8d', '#b9770e', '#2c3e50'] },
  sports:  { name: 'Sports',  length: 46, width: 22, accel: 380, maxSpeed: 540, reverse: 170, turn: 3.3, grip: 8.0, hp: 80,  colors: ['#ff2e63', '#08d9d6', '#ffd166', '#ff6b35'] },
  police:  { name: 'Cruiser', length: 48, width: 23, accel: 330, maxSpeed: 470, reverse: 160, turn: 3.0, grip: 7.5, hp: 130, colors: ['#1c2733'] },
};
export const TRAFFIC_TYPES = ['sedan', 'taxi', 'coupe', 'van', 'truck'];
export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 34;

// Wanted level
export const WANTED = {
  decayDelay: 8,      // seconds with no crime before stars start falling
  decayInterval: 6,   // seconds per star lost while hidden
  maxStars: 5,
  crimeStealCar: 1,
  crimeHitPed: 1,
  crimeKillPed: 1,
  crimeShoot: 0,      // firing alone does not raise stars, hitting does
  crimeKillCop: 2,
  crimeDamageCar: 0,
};
export const RESPRAY_COST = 100;
export const TAXI_FARE_MIN = 25;
export const TAXI_FARE_MAX = 70;
export const PACKAGE_REWARD = 50;
export const PACKAGE_COUNT = 20;
export const START_CASH = 50;

// Missions: cash rewards and timers (seconds, 0 = no timer)
export const MISSION_REWARDS = [150, 300, 250, 500, 450, 1500];
export const MISSION_TIMERS = [0, 90, 0, 0, 120, 0];

// Districts, by region. districtAt() in city.js uses these rectangles.
export const DISTRICTS = [
  { name: 'Old Town',    x: 0,    y: 0,    w: 900,  h: 1800, tint: '#8a7d6b' },
  { name: 'Neon Row',    x: 900,  y: 0,    w: 900,  h: 900,  tint: '#b03060' },
  { name: 'Palm Heights',x: 1800, y: 0,    w: 600,  h: 900,  tint: '#2e7d6b' },
  { name: 'Downtown',    x: 900,  y: 900,  w: 900,  h: 900,  tint: '#5a6b8a' },
  { name: 'The Docks',   x: 1800, y: 900,  w: 600,  h: 900,  tint: '#7a6a4a' },
  { name: 'Marina Bay',  x: 0,    y: 1800, w: 2400, h: 600,  tint: '#2e7d8a' },
];

export const PALETTES = {
  day:    { sky: '#7ec8e3', ground: '#6f9e5a', road: '#3c4148', sidewalk: '#9aa0a6', sand: '#e8d28a', water: '#2b7fb8' },
  sunset: { sky: '#ff9e5e', ground: '#8a7d4a', road: '#4a3a3f', sidewalk: '#a08a7a', sand: '#f0b26a', water: '#c65a3a' },
};
