// 1-config.js: CONFIG, every tunable and derived constant (brain tunables: 7a-ml.js). May import nothing.

// World size: `scale` sets wilderness extent and populations; levels 1..10 give scale 20 + 10 per level.
export const MAP_SIZE_SCALES = Array.from({ length: 10 }, (_, i) => 20 + 10 * i);
export const WORLD_SIZES = {
  small: { mapSize: 4, people: 1000 },
  medium: { mapSize: 5, people: 2000 },
  large: { mapSize: 6, people: 4000 }
};
export const CITY_LADDER = [500, 350, 200];
export const DEFAULT_LEVELS = 3;
export const METERS_PER_LVL = 3.2;
export const HEAD_CLEAR = 0.15;   // eye to head top
export const PLAYER_HEIGHT = 1.753;   // metres (5'9"), feet to crown
export const EYE_HEIGHT = PLAYER_HEIGHT - HEAD_CLEAR;
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 10.0;
export const RUN_SPEED = 15.0;
export const JUMP_SPEED = 7.0;
export const CROUCH_SPEED = 4.0;
// On foot: the body turns to the move; the view turns only by look input (mouse, the look side of the screen).
export const FOOT_TURN_RATE = 10;    // rad/s body turn toward the move
export const LOOK_PITCH_MAX = Math.PI / 2 - 0.01;   // look up/down limit
export const FLY_SPEED = 2 * WALK_SPEED;   // horizontal and vertical
export const CROUCH_RATE = 3.0;     // m/s the eye moves into or out of a crouch
export const GRAVITY = 22.0;
export const GRID_CELL = 24;      // broadphase cell, metres
export const LAND_EPS = 0.01;    // slack so a snapped-to roof reads clear
export const SUBSTEP = 0.25;    // max move per pass, under PLAYER_RADIUS

// Buildings: hollow shells with a doorway.
export const WALL_T = 0.3;     // exterior wall thickness, metres inward
export const WALL_T_MIN = 0.06;    // thinnest retry when mitres fold
export const MITER_MAX = 4;
export const DOOR_W = 1.2;
export const DOOR_MIN_W = 0.9;     // comfortably wider than 2 * PLAYER_RADIUS
export const DOOR_H = 2.2;
export const PIER = 0.35;
export const PIER_MIN = 0.12;
export const FRAME_W = 0.09;
// FACADE WINDOWS, metres: punched on low buildings, curtain wall on towers (FACADE_TALL_M).
export const FACADE_FLOOR_JITTER_M = 0.6;
export const FACADE_SILL_M = 0.6;
const FACADE_WIN_HEADROOM_M = 0.45;
export const FACADE_WIN_H_M = PLAYER_HEIGHT + FACADE_WIN_HEADROOM_M;
export const FACADE_CURTAIN_SILL_M = 0.15;
export const FACADE_CURTAIN_TOP_GAP_M = 0.2;
export const FACADE_TALL_M = [30, 60];   // heights where punched windows blend into curtain wall
// Windows light as the sun sinks through FACADE_LIGHTS_DEG; keep the low end above ~-18.
export const FACADE_LIGHTS_DEG = [8, -16];
export const FLOOR_Y = 0.055;
export const CEIL_GAP = 0.02;
export const ENTRANCE_REACH = 1.2;
export const ROAD_NEAR = 35;
export const ROAD_FAR = 300;
export const ROAD_CELL = 32;
export const FEATURES_VERSION = 5;     // bump when featuresFrom changes shape; drops stale caches
export const OVERPASS_TIMEOUT_MS = 50000;
export const OVERPASS_QUERY_TIMEOUT = 45;   // seconds, server side
export const OVERPASS_HEDGE_MS = 15000;     // a mirror this slow gets the next mirror asked too
export const OVERPASS_MAX_PARALLEL = 2;
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Elevation: AWS Terrain Tiles (Terrarium). Credit: Mapzen, AWS Open Data, USGS 3DEP.
export const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const TERRAIN_MAX_Z = 15;      // deepest level (~3.7 m/px at 40 N)
export const TERRAIN_MIN_Z = 12;
export const TERRAIN_TILE_PX = 256;
export const TERRAIN_MAX_TILES = 16;
export const TERRAIN_TIMEOUT_MS = 10000;
export const ELEV_STEP = 5;       // metres between height samples and mesh vertices
export const ELEV_MARGIN = 100;
export const STEP_UP = 0.45;    // highest ledge walked onto without a jump
export const GROUND_SNAP = 0.5;

// Flat layers get depth biases; higher wins.
export const LAYER_BIAS = { area: 2, water: 3, road: 4, mark: 4.5, path: 5 };


// LAYER TABLES

// Fixed y order for flat layers instead of depth fighting.
export const LAYER_Y = { area: 0.010, water: 0.018, road: 0.032, path: 0.048 };

export const ROAD_WIDTH = {
  motorway: 14, trunk: 13, primary: 12, secondary: 10, tertiary: 9,
  motorway_link: 7, trunk_link: 7, primary_link: 6.5, secondary_link: 6, tertiary_link: 6,
  residential: 7, unclassified: 6.5, living_street: 6, service: 4.5, road: 6.5,
  pedestrian: 6, track: 3.5, footway: 2, path: 1.8, cycleway: 2.2, steps: 1.6, bridleway: 2
};
export const PATH_KINDS = new Set(['pedestrian', 'track', 'footway', 'path', 'cycleway', 'steps', 'bridleway']);
export const ROAD_COLOR = 0x3f4247;
export const PATH_COLOR = 0x8c8578;

// leisure, landuse, natural values painted on the ground
export const AREA_COLOR = {
  water: 0x3d6b85, wetland: 0x4f6b58, basin: 0x3d6b85, reservoir: 0x3d6b85,
  park: 0x53753f, garden: 0x5c8046, grass: 0x5c8046, village_green: 0x5c8046,
  recreation_ground: 0x578040, pitch: 0x4f7f45, playground: 0x8a7a55, golf_course: 0x578040,
  forest: 0x3c5a33, wood: 0x3c5a33, meadow: 0x6d8a4c, farmland: 0x8f8a5e,
  cemetery: 0x5d6a54, allotments: 0x6a7847, scrub: 0x5b6b45, sand: 0xc4b48c,
  orchard: 0x5f7f45, greenfield: 0x6d8a4c
};

// Green cover takes the wild grass palette.
export const MIX_GREEN_PULL = 0.8;
export const MIX_EDGE_FADE = 0.25;   // outer share of the square where the pull rises to 1
export const MIX_GREEN_KINDS = new Set([
  'park', 'garden', 'grass', 'village_green', 'recreation_ground', 'pitch', 'golf_course',
  'forest', 'wood', 'meadow', 'scrub', 'orchard', 'greenfield', 'cemetery', 'allotments', 'wetland'
]);

export const WATERWAY_WIDTH = { river: 14, canal: 9, stream: 3, ditch: 1.6, drain: 1.6 };

export const BARRIER = {
  wall: { h: 2.0, t: 0.36, color: 0xb5ad9f },
  city_wall: { h: 4.0, t: 0.80, color: 0xb5ad9f },
  retaining_wall: { h: 1.4, t: 0.50, color: 0xb5ad9f },
  fence: { h: 1.7, t: 0.10, color: 0x8a8272 },
  hedge: { h: 1.6, t: 0.80, color: 0x44653a }
};

// fallbacks for a material with no colour
export const WALL_MATERIAL_COLOR = {
  brick: 0xd9a58a, red_brick: 0xd39177, brick_block: 0xd9a58a,
  concrete: 0xdedcd6, cement_block: 0xd8d4cb, stone: 0xd8d1c2, sandstone: 0xe3c9a3,
  limestone: 0xe6e0cd, marble: 0xf0ece6, granite: 0xc8c5c2,
  glass: 0xbcd6e6, mirror: 0xc8dce8, metal: 0xcfd4d9, steel: 0xc7ccd2,
  wood: 0xd0a878, timber_framing: 0xdcc39c, plaster: 0xeae4d8, stucco: 0xe6dccb,
  plastic: 0xdedad0, tiles: 0xd9c3ae, vinyl_siding: 0xe4e0d5, asbestos: 0xdad7cf
};
export const ROOF_MATERIAL_COLOR = {
  roof_tiles: 0xb0654a, tiles: 0xb0654a, clay: 0xb96b4e, terracotta: 0xb96b4e,
  slate: 0x7b828d, shingle: 0x8a7f70, asphalt: 0x6a6a6c, tar_paper: 0x5f5f63,
  bitumen: 0x5f5f63, gravel: 0xa39d8c, concrete: 0xc0bcb3, metal: 0xafb5bb,
  copper: 0x7fb3a0, zinc: 0xa8afb5, eternit: 0xb2afa8, thatch: 0xc0a56d,
  glass: 0xb6d0dc, wood: 0xbb9268
};

export const ROOF_SHAPE = {
  gabled: 'gabled', gable: 'gabled', gambrel: 'gabled', round: 'gabled',
  hipped: 'hipped', 'half-hipped': 'hipped', mansard: 'hipped',
  pyramidal: 'pyramidal', dome: 'pyramidal', onion: 'pyramidal',
  skillion: 'skillion', 'lean_to': 'skillion', monopitch: 'skillion'
};

export const TREE_ROW_SPACING = 9;
export const SIGN_COLS = 8;
export const SIGN_CELL_W = 256;
export const SIGN_CELL_H = 48;
export const SIGN_MAX = 192;

// Overpass asks only for the cover and barrier values we paint.
export const LANDUSE_RE = 'grass|forest|meadow|farmland|cemetery|allotments|orchard|greenfield'
  + '|village_green|recreation_ground|basin|reservoir';
export const LEISURE_RE = 'park|garden|pitch|playground|golf_course|recreation_ground';
export const BARRIER_RE = Object.keys(BARRIER).join('|');

// Places by purpose; first hit wins.
export const PLACE_KINDS = {
  grocery: {
    shop: ['supermarket', 'convenience', 'grocery', 'greengrocer', 'general',
      'butcher', 'bakery', 'deli', 'health_food', 'farm']
  },
  food: { amenity: ['restaurant', 'fast_food', 'cafe', 'food_court', 'pub', 'bar'] },
  drinking_water: { amenity: ['drinking_water', 'water_point'] },
  hospital: { amenity: ['hospital'], healthcare: ['hospital'] },
  clinic: { amenity: ['clinic', 'doctors', 'dentist'], healthcare: ['clinic', 'doctor', 'dentist'] },
  pharmacy: { amenity: ['pharmacy'], healthcare: ['pharmacy'], shop: ['chemist'] },
  school: { amenity: ['school', 'college', 'university', 'kindergarten'] },
  police: { amenity: ['police'] },
  fire_station: { amenity: ['fire_station'] }
};
export const PLACE_KEYS = ['healthcare', 'amenity', 'shop'];
export const PLACE_OF = {};
export const PLACE_RE = { healthcare: [], amenity: [], shop: [] };
for (const [kind, byKey] of Object.entries(PLACE_KINDS)) {
  for (const [key, vals] of Object.entries(byKey)) {
    for (const v of vals) { PLACE_OF[`${key}=${v}`] = kind; PLACE_RE[key].push(v); }
  }
}
for (const key of PLACE_KEYS) PLACE_RE[key] = PLACE_RE[key].join('|');
// A city load: the city, then the wilderness around it.
export const CITY_STEPS = [
  ['address', 'Finding the address', 'Turning the address into coordinates (OpenStreetMap Nominatim).'],
  ['map', 'Downloading map data', 'Buildings, streets, water, trees and places around the point (OpenStreetMap, Overpass API).'],
  ['terrain', 'Fetching elevation', 'Height tiles for the rise and fall of the ground (AWS Terrain Tiles).'],
  ['sort', 'Sorting map features', 'Splitting the download into buildings, roads, land cover, trees and places.'],
  ['build', 'Building the city', 'Walls, doors, roofs, signs, ground layers and collision.'],
  ['wilderness', 'Growing the wilderness', 'Seeded terrain around the city, blended into the measured ground; lakes, cabins, pebbles.'],
  ['people', 'Populating', 'Spawning people, deer and plants and wiring the brains.'],
  ['scene', 'Preparing the scene', 'Compiling shaders and uploading textures so the first frame does not stall.']
];
// City off: the wilderness alone, nothing downloaded.
export const WILDERNESS_STEPS = [
  ['terrain', 'Shaping the land', 'Seeded fractal terrain: plains, a mountain mask and ridges.'],
  ['water', 'Filling the lakes', 'A water level over 30% of the ground, lake beds carved below it.'],
  ['cabins', 'Building cabins and groves', 'Log cabins on dry ground, groves of trees, pebbles scattered.'],
  ['people', 'Populating', 'Spawning people, coyotes, deer and plants and wiring the brains.'],
  ['scene', 'Preparing the scene', 'Compiling shaders and uploading textures so the first frame does not stall.']
];


// LOW-POWER (Graphics: low).
export const LOW_PIXEL_RATIO = 1.5;
export const LOW_RENDER_FPS = 60;
export const HIGH_FOG_FAR = 900, LOW_FOG_FAR = 500;        // metres; fog near stays FOG_NEAR
export const FOG_NEAR = 120;
export const HIGH_CAMERA_FAR = 2000, LOW_CAMERA_FAR = 600;  // past the fog's far edge, so nothing pops
export const LOW_NPC_LOD_DIST = 70;     // metres (high: HIGH_NPC_LOD_DIST)
export const LOW_FAR_STAT_DIST = 120;    // metres (high: HIGH_FAR_STAT_DIST)
export const HIGH_LABEL_TICKS = 2, LOW_LABEL_TICKS = 4;    // ticks between stat-label target picks
export const HIGH_HUD_TICKS = 60, LOW_HUD_TICKS = 120;     // ticks between HUD refreshes
export const LOW_WATER_FPS = 15;
// AUTO GRAPHICS: with no saved choice, a city load drops to low below AUTO_GRAPHICS_LOW_FPS.
export const AUTO_GRAPHICS_LOW_FPS = 30;
export const AUTO_GRAPHICS_SAMPLE_MS = 1500;
export const AUTO_GRAPHICS_WARMUP_FRAMES = 10;        // water-flow offsets advance at most this often on low
export const MSAA_SAMPLES_WANTED = 8;   // high's MSAA, capped by the GPU
// high's MSAA colour target: true RGBA16F (where the GPU renders to half float), false RGBA8 sRGB (half the bytes per
// sample; with no tone mapping both clip at 1, so the image matches but for edge-resolve rounding)
export const MSAA_HALF_FLOAT = false;
export const GRAPHICS_KEY = 'graphics';  // localStorage: 'high' | 'low'
// PERF PROBE (debug only): per-frame ms in named buckets, shown as medians and means in the Debug readout. On when
// the page URL has ?perf (PERF_PROBE_PARAM), or set perfProbe.on from the console. Off costs one boolean read per
// bucket per frame.
export const PERF_PROBE_PARAM = 'perf';
export const PERF_PROBE_WINDOW = 300;   // frames per report window
export const DEBUG_COPY_FEEDBACK_MS = 1500;   // how long the Debug Copy button shows Copied or Copy failed

export const HEMI_DAY = 1.5;
export const HEMI_NIGHT = 0.8;
export const MOON_MAX = 0.9;
// Shadow box: SHADOW_BOX_HALF round a centre SHADOW_AHEAD of the player.
export const SHADOW_BOX_HALF = 120;   // ~190 m ahead, ~6 cm per texel at 4096
export const SHADOW_AHEAD = 70;
// shadows fade at the map edges
export const SHADOW_EDGE_FADE = 0.15;
export const SHADOW_MAP_MAX = 4096;          // texels a side (less on lower GPU limits)
export const SHADOW_DEPTH = 800;             // metres the box reaches along the light
export const SHADOW_BIAS_M = 0.25;           // depth bias, metres
// building cull cell size
export const BUILDING_CHUNK_M = 150;
// ground cull cell size
export const GROUND_CELL_M = 150;
// height meshes have fewer triangles a cell, so wider cells
export const TERRAIN_CELL_M = 300;
export const SHADOW_SOFTNESS = 2.5;   // filter radius in texels, smooths shadow edges
export const MOON_BLEND_DEG = 5;

// HOSTED CITY FILES: saved Overpass answers.
export const CITY_FILE_DIR = 'maps/';    // folder relative to this page, ending in '/'
export const CITY_FILE_RADIUS = 500;
export const CITY_FILES = {
  'New York, NY': {
    file: 'new-york.json', lat: 40.7127281, lon: -74.0060152,
    label: 'New York, United States'
  },
  'Union Square, San Francisco, CA': {
    file: 'san-francisco.json', lat: 37.7879363, lon: -122.4075174,
    label: 'Union Square, Tenderloin, San Francisco, California, United States'
  },
  'Millennium Park, Chicago, IL': {
    file: 'chicago.json', lat: 41.8825754, lon: -87.6225361,
    aliases: ['The Loop, Chicago, IL', 'The Loop, IL', 'The Loop'],
    label: 'Millennium Park, 201, Loop, Chicago, South Chicago Township, Cook County, Illinois, 60601, United States'
  },
  '1 Park Place, Athens, OH': {
    file: 'athens.json', lat: 39.325158, lon: -82.101506,
    label: '1, Park Place, Athens, Athens Township, Athens County, Ohio, 45701, United States'
  }
};

// TREES: trunks are pole solids.
export const TREE_TRUNK_TOP_R = 0.14;
export const TREE_TRUNK_BASE_R = 0.2;
export const TREE_TRUNK_SOLID_R = TREE_TRUNK_BASE_R * 0.9;   // half side of the trunk solid
export const SIGN_FONT = '"Iowan Old Style", Palatino, Georgia, serif';

// SHELL RASTER: shellAt in one read.
export const SHELL_CELL = 0.5;    // metres; finer cells shrink the AMBIG band
export const SHELL_MAX_CELLS = 4_000_000;  // ~8 MB at Int16, the coarsening cap
export const SHELL_OUT = -1;
export const SHELL_AMBIG = -2;
export const SHELL_EPS = 1e-4;       // cell growth for the edge test, erring to AMBIG

// NPCS: the AIEcosystemArena engine.

// One NPC tick is NPC_TICK_S of sim time.
export const NPC_TICK_S = 0.016;
// One day for sky and NPCs (20 minutes).
export const DAY_S = 1200;
// With a city, starting people split by NPC_CITY_PEOPLE_WEIGHT : NPC_WILD_PEOPLE_WEIGHT.
export const NPC_CITY_PEOPLE_WEIGHT = 3000;
export const NPC_WILD_PEOPLE_WEIGHT = 900;
export const NPC_DEER_POPULATION = 125;   // city deer
export const NPC_PLANT_POPULATION = NPC_DEER_POPULATION * 10; // the Arena's 300:5 plant-to-human ratio
// Share of water that comes with food (~30% for people).
export const DIET_WATER_SHARE = 0.3;
export const PLANT_REGROW_P = 0.03;
export const PLANT_SPOT_TRIES = 30;
export const PLANT_SIGHT_CELL = 15;      // plant cell for vision queries, metres
export const NPC_CONTACT_CELL = 1.5;     // ContactGrid cell, ~two contact radii, metres
// DEER AI (ported from species.py)
export const DEER_CRUISE = 0.3;      // speed share when not fleeing
// Deer decide once per DEER_THINK_TICKS (a third of a second).
export const DEER_THINK_TICKS = 20;
// Deer near a predator (DEER_SPRINT_DIST) sprint.
export const DEER_SPRINT_DIST = 10;     // metres
export const DEER_SPRINT_OVER = 1;
export const DEER_SPRINT_ENERGY = 2;
// Long NPC steps are split at walls.
export const NPC_SUBSTEP = 0.1;           // metres
// GAIT: cadence follows speed, capped at GAIT_MAX_HZ; a sprinting deer gallops.
export const GAIT_MAX_HZ = 4;
export const GAIT_GALLOP_SWING = 0.9;     // leg swing while sprinting, radians
export const GAIT_CADENCE_SCALE = 0.6;    // slows every leg cycle; 1 = feet match ground speed
export const DEER_EXPLORE_P = 0.0001;   // chance per tick of a new explore point
export const NPC_ATTACK_COOLDOWN_S = 0.5;     // sim seconds between a hunter's attacks
export const NPC_ATTACK_DAMAGE_PER_S = 0.2;   // victim health share lost per second
export const NPC_BITE_COOLDOWN_S = 0.5;       // sim seconds between a grazer's bites
export const NPC_HIT_NO_EAT_S = 2;
export const PLANT_MAX_HEALTH = 10;           // a plant's bites when whole
export const PLANT_BITE_NUTRITION = 5;        // a bite's nutrition per point of the plant's max health
// FIGHTS: hits scale with fighting mass x health (Ecosystem.fightHit).
export const NPC_FIGHT_DAMAGE_PER_S = 24;     // reference fighter's health per second
// KNOCKDOWNS (Ecosystem.applyHit): push = fighting mass x NPC_HIT_ACCEL_MS2 x condition; hold = fighting mass x
// NPC_HOLD_ACCEL_MS2 x condition. Past the hold, down for NPC_DOWN_* seconds.
export const NPC_HIT_ACCEL_MS2 = 10;       // placeholder: attacker's acceleration into a hit
export const NPC_HOLD_ACCEL_MS2 = 15;      // placeholder: what a body braces against
export const NPC_DOWN_MIN_S = 1;           // seconds down just past the hold
export const NPC_DOWN_S_PER_EXCESS = 1;    // seconds per unit of push over hold past 1
export const NPC_DOWN_MAX_S = 6;           // most seconds down per hit
export const NPC_NEED_FULL = 100;          // need at which the bar is empty (energy share 0)
// REGEN (regenStep), the player and every animal alike: with food and water both at least REGEN_MIN_SHARE full, the
// health bar refills at the body's drink rate (the share of the water bar drinking fills per second), and the food and
// water bars each drop REGEN_COST_SHARE of what the health bar gains.
export const REGEN_MIN_SHARE = 0.75;   // fullness share both bars need for healing
export const REGEN_COST_SHARE = 0.5;   // food and water bar share lost per health bar share healed
// BUMPING (Ecosystem.bump): a body walking into another pushes with mass x closing speed / NPC_BUMP_CONTACT_S against
// the hit hold.
export const NPC_BUMP_CONTACT_S = 0.25;    // placeholder: seconds a bump takes to stop
// BUMP IMPACTS (Ecosystem.impact): the player's and the car's bumps. A contact's first touching tick is one impact; later
// touching ticks move the pair together. Both bodies get the same impulse, reduced mass x closing speed x
// (1 + BUMP_RESTITUTION) (Newton's third law), pushing with it over NPC_BUMP_CONTACT_S. The impact energy, reduced mass x
// closing speed^2 / 2, past BUMP_SAFE_J costs each body health at its own rate per joule.
// Reference energies: two people walking into each other ~40 J, a run into a still person ~500 J, the car at
// 10 m/s into a person ~3.6 kJ, at 20 m/s ~14.5 kJ.
export const BUMP_RESTITUTION = 0;         // placeholder: closing speed share bounced back; 0 = the pair moves together
export const BUMP_SAFE_J = 400;            // placeholder: impact energy that hurts nothing
export const BUMP_HEALTH_PER_J = 0.02;     // placeholder: a body's (player's or animal's) health per joule past BUMP_SAFE_J
// CORPSES (Ecosystem.addCorpse): an animal dead of health loss lies where it fell, drawn only, until CORPSE_S passes or
// CORPSE_MAX newer ones push it out. Ragdolls on: it lies where its fall body settles (Ecosystem.stepFalls).
export const CORPSE_S = 60;      // placeholder: sim seconds a body lies
export const CORPSE_MAX = 256;   // placeholder: most bodies lying at once
// drawn fall over NPC_FALL_S and rise over the hold's last NPC_GETUP_S
export const NPC_FALL_S = 0.35;
export const NPC_GETUP_S = 0.6;
// FIGHT MOVES (moveS seconds; key t is a share of it). Strikers play theirs on landing a hit; a `flees` species on
// being hit, then runs. anchor: the leg joint a box rig tips about.
export const NPC_FIGHT_HOLD_PAD_S = 0.1;   // a striker's hold outlasts its next hit by this
export const NPC_FIGHT_MOVES = {
  // punch: alternating fists from a guard; arm angles as HUMAN_CROUCH's
  human: { moveS: 0.4, peak: 0.35, guardEaseS: 0.12, guardShoulder: -0.4, guardElbow: -2.35, punchShoulder: -1.55, punchElbow: -0.05, punchLean: 0.18 },
  // lunge and pounce: coil, leap, bite, back
  coyote: {
    moveS: 0.8, anchor: null, keys: [
      { t: 0, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 },
      { t: 0.22, rise: -0.8, lunge: -1, pitch: 0, head: 0.25, front: 0.25, back: -0.35 },
      { t: 0.45, rise: 4.5, lunge: 7, pitch: -0.2, head: -0.15, front: -1.0, back: 0.9 },
      { t: 0.62, rise: 0.3, lunge: 5, pitch: 0.18, head: 0.5, front: -0.25, back: 0.35 },
      { t: 1, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 }
    ]
  },
  // buck: head down, hind legs kicked back, then a sprint away
  deer: {
    moveS: 0.55, flees: true, fleeS: 3, anchor: 'legFL', keys: [
      { t: 0, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 },
      { t: 0.18, rise: 0, lunge: 0, pitch: 0.12, head: 0.3, front: 0, back: -0.2 },
      { t: 0.45, rise: 0, lunge: 0, pitch: 0.4, head: 0.5, front: 0, back: 1.3 },
      { t: 0.72, rise: 0, lunge: 0, pitch: 0.1, head: 0.2, front: 0, back: 0.3 },
      { t: 1, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 }
    ]
  }
};

// NIGHT HUNTS: below NIGHT_SUN_ALT_DEG a species chases its nightPrey (the player too); a `pack` joins a packmate's
// hunt.
export const NIGHT_SUN_ALT_DEG = -6;
// PREY CHOICE (coyotes): smallest first by PREY_SIZE_STEP_KG steps, then nearest. A pack attacks only quarry within its
// summed mass or height.
export const PREY_SIZE_STEP_KG = 1;
// POUNCES: crouch until leapAt, then leap at leapOver x sprint speed, landing short of the quarry.
const COYOTE_LEAP_AT = 0.25;
export const NPC_POUNCES = {
  coyote: {
    moveS: 0.5, leapAt: COYOTE_LEAP_AT, leapOver: 1.6, cooldownS: 1.2, anchor: null, keys: [
      { t: 0, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 },
      { t: COYOTE_LEAP_AT, rise: -1.2, lunge: -0.5, pitch: 0.12, head: 0.3, front: 0.35, back: -0.45 },
      { t: 0.6, rise: 9, lunge: 0, pitch: -0.25, head: -0.2, front: -1.1, back: 1.0 },
      { t: 0.85, rise: 1, lunge: 0, pitch: 0.2, head: 0.45, front: -0.3, back: 0.4 },
      { t: 1, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 }
    ]
  }
};
// a pounce lands this share of CONTACT_DIST short, so it bites
export const POUNCE_LAND_SHORT = 0.5;

// A box rig's move pose at share u into `out`.
export const FIGHT_KEY_FIELDS = ['rise', 'lunge', 'pitch', 'head', 'front', 'back'];
export const NPC_AGE_DEPLETION_RATE = 0;  // health per sim second of age; 0 = off
export const DEER_REPRO_SHARE = 0.4;      // reproduction increment as a share of food's
export const MATE_TIME_MULT = 4;
export const REPRO_NEED_MAX = 100;       // ceiling of a brained animal's reproduction need, which doubles every tick
const NPC_DAY_TICKS = Math.round(DAY_S / NPC_TICK_S);   // ticks per sky day
const NPC_MATURITY_S = 120;   // sim seconds birth to full size; no mating before
export const NPC_MATURITY_TICKS = Math.round(NPC_MATURITY_S / NPC_TICK_S);   // NPC_MATURITY_S in ticks
export const GROWTH_MIN_SCALE = 0.25;   // body scale at birth, growing to 1 over NPC_MATURITY_TICKS
export const NPC_ADULT_AGE = 18;                 // years shown at maturity
export const NPC_TICKS_PER_YEAR = 365 * NPC_DAY_TICKS;
export const NPC_START_AGE = [18, 40];           // age range of spawned people, years
export const HUMAN_TURN_RATE = 3;      // rad/s people turn toward their brain's heading
export const DEER_GREEN_SHARE = 0.8;
export const DEER_AREAS = new Set([
  'park', 'garden', 'grass', 'village_green', 'recreation_ground', 'golf_course',
  'forest', 'wood', 'meadow', 'farmland', 'cemetery', 'scrub', 'orchard', 'greenfield', 'wetland'
]);
// Feet to rig top in Arena units, for the stats sprite.
export const NPC_RIG_TOP = { human: 38.55, deer: 35, coyote: 23 };

export const NPC_UNIT = 0.045;    // metres per Arena unit
export const NPC_RADIUS = 0.3;      // under PLAYER_RADIUS so every doorway fits
export const NPC_BUMP_DIST = 2 * NPC_RADIUS;   // centre distance when collision circles touch
export const NPC_COLLIDE_H = 1.35;     // column height; under the lowest lintel
export const NPC_SPAWN_GAP = 8;        // spawn spacing before crowding lowers it
// heightScale of a person the player's height.
export const PLAYER_HS = PLAYER_HEIGHT / (NPC_RIG_TOP.human * NPC_UNIT);
// ADULT SIZE: [mean, std] metres per species and sex; rig: that in rig units.
export const NPC_SIZE = {
  human: { rig: NPC_RIG_TOP.human, male: [1.753, 0.0762], female: [1.613, 0.0711] },
  deer: { rig: 20, male: [0.97, 0.05], female: [0.86, 0.045] },     // body centre 15 + half the 10-unit body
  coyote: { rig: 15, male: [0.61, 0.03], female: [0.58, 0.03] }     // body centre 11.5 + half the 7-unit body
};
export const NPC_SIZE_Z_MAX = 4;          // draws are cut at this many sd
export const NPC_SIZE_HERITABILITY = 0.8;   // mid-parent z weight in a child's; rest is noise
// BMI at the base build.
export const NPC_REF_BMI = { male: 24, female: 22 };

// BODY COMPOSITION: Heath-Carter ratings set the lean mass index (fat-free kg/m^2); mass = leanIndex * height^2 / (1 -
// bodyFat). Fitted to US adults (CDC NHANES 2021 to 2023).
export const NPC_SOMATOTYPES = [
  { name: 'ectomorph', weight: 0.13, ratings: { endo: 2.0, meso: 2.5, ecto: 5.5 }, bodyFat: { male: [0.14, 0.030], female: [0.24, 0.035] } },
  { name: 'balanced', weight: 0.29, ratings: { endo: 3.5, meso: 3.5, ecto: 3.5 }, bodyFat: { male: [0.236, 0.040], female: [0.35, 0.040] } },
  { name: 'mesomorph', weight: 0.13, ratings: { endo: 2.5, meso: 5.5, ecto: 2.0 }, bodyFat: { male: [0.184, 0.035], female: [0.274, 0.035] } },
  { name: 'endomorph', weight: 0.25, ratings: { endo: 5.5, meso: 4.5, ecto: 1.5 }, bodyFat: { male: [0.34, 0.045], female: [0.454, 0.045] } },
  { name: 'extreme endomorph', weight: 0.20, ratings: { endo: 7.0, meso: 5.0, ecto: 1.0 }, bodyFat: { male: [0.45, 0.050], female: [0.56, 0.050] } }
];
export const NPC_RATING_SPREAD = 0.5;            // rating sd within a type
export const NPC_RATING_LIMITS = [1, 7];         // Heath-Carter scale
export const NPC_BODY_FAT_LIMITS = [0.04, 0.6];  // share of total mass
export const NPC_LEAN_INDEX_BASE = { male: 19.5, female: 16.5 };   // lean kg/m^2 at reference ratings
export const NPC_LEAN_REF_RATING = 3.5;          // meso and ecto where the base applies
export const NPC_LEAN_PER_MESO = 0.55;           // lean kg/m^2 per meso point above reference
export const NPC_LEAN_PER_ECTO = -0.35;          // lean kg/m^2 per ecto point above reference
// INHERITANCE: a child takes a parent's type (NPC_BODY_TYPE_HERITABILITY) and mid-parent z-scores
// (NPC_BODY_HERITABILITY).
export const NPC_BODY_TYPE_HERITABILITY = 0.6;
export const NPC_BODY_HERITABILITY = { endo: 0.6, meso: 0.6, ecto: 0.6, bodyFat: 0.5 };
export const NPC_BODY_TRAITS = Object.keys(NPC_BODY_HERITABILITY);
// Population mean and sd per trait.
export const NPC_BODY_POP = (() => {
  const total = NPC_SOMATOTYPES.reduce((s, t) => s + t.weight, 0);
  const mix = pick => {
    let mean = 0, second = 0;
    for (const t of NPC_SOMATOTYPES) { const [m, sd] = pick(t), w = t.weight / total; mean += w * m; second += w * (sd * sd + m * m); }
    return { mean, sd: Math.sqrt(second - mean * mean) };
  };
  const pop = {};
  for (const k of ['endo', 'meso', 'ecto']) pop[k] = mix(t => [t.ratings[k], NPC_RATING_SPREAD]);
  pop.bodyFat = { male: mix(t => t.bodyFat.male), female: mix(t => t.bodyFat.female) };
  return pop;
})();
// PLAYER BODY (pov.newBody): Custom sliders [min, max, start]: age, body fat %, height in, weight lb
export const PLAYER_CUSTOM = {
  age: [NPC_ADULT_AGE, 80, 25],
  bodyFat: [NPC_BODY_FAT_LIMITS[0] * 100, NPC_BODY_FAT_LIMITS[1] * 100, 24],
  heightIn: [54, 84, 69],
  weightLb: [80, 400, 170]
};
export const LB_PER_KG = 2.20462;
export const M_PER_IN = 0.0254;
// DRAWN BODY SHAPE (render only): build is NPC_BUILD_BASE_MEAN + sqrt(BMI / NPC_REF_BMI) - 1, shared among torso
// regions by NPC_BUILD_BASE, plus NPC_BODY_SHAPE per trait sd.
export const NPC_TORSO_REGIONS = ['shoulder', 'chest', 'waist', 'hip'];
// Women: narrower shoulders, chest and waist, wider hips.
export const NPC_BUILD_BASE = {
  male: { shoulder: 1, chest: 1, waist: 1, hip: 1, limb: 1 },
  female: { shoulder: 0.88, chest: 0.92, waist: 0.89, hip: 1.03, limb: 0.92 }
};
// base build: mean of NPC_BUILD_BASE's torso widths
export const NPC_BUILD_BASE_MEAN = Object.fromEntries(Object.entries(NPC_BUILD_BASE).map(([sex, w]) =>
  [sex, NPC_TORSO_REGIONS.reduce((s, k) => s + w[k], 0) / NPC_TORSO_REGIONS.length]));
export const NPC_WIDTH_LIMITS = [0.7, 1.8];   // room for BMI 50+
export const NPC_GIRTH_STEPS = 200;   // limb girth steps per unit width, in iLook.w
export const NPC_BODY_SHAPE = {
  shoulder: { meso: 0.05, ecto: -0.01, bodyFat: 0.01 },
  chest: { meso: 0.04, ecto: -0.015, bodyFat: 0.03 },
  waist: { meso: -0.01, ecto: -0.015, bodyFat: 0.07 },
  hip: { meso: 0, ecto: -0.01, bodyFat: 0.05 },
  limb: { meso: 0.035, ecto: -0.015, bodyFat: 0.03 }
};
// Adult kg at mean height, scaled by height cubed.
export const NPC_REF_MASS_KG = {
  deer: { male: 70, female: 50 },      // white-tailed deer
  coyote: { male: 15, female: 13 }
};

// SPECIES: per-type stats in Arena units; relation fields (hunts, carrion, shootsOnSight, crates...) name kinds (NPC_KINDS).
export const SPECIES = {
  // carrion: the dead bodies (Ecosystem.corpses) a species eats on contact; the player harvests the human list's as meat
  human: { brain: true, hunts: { deer: true, coyote: true }, carrion: { deer: true, coyote: true }, shootsOnSight: { zombie: true }, food: null, grazes: true, crates: true, speed: 35, health: 120, fovH: [0.90, 1.30], fovV: [0.25, 0.45], eye: 12, lift: 21.25, grace: 1, childDrop: 20 },
  coyote: { brain: false, hunts: { deer: true, human: true }, carrion: { deer: true, human: true }, nightPrey: { human: true }, pack: true, food: 'deer', grazes: false, speed: 25, health: 100, fovH: [2.10, 2.80], fovV: [0.20, 0.40], eye: 6.5, lift: 11.5, grace: 1, childDrop: 10 },
  deer: { brain: false, hunts: {}, food: 'plant', grazes: true, speed: 25, health: 100, fovH: [2.10, 2.80], fovV: [0.20, 0.40], eye: 10, lift: 15, grace: 1, childDrop: 10 }
};
export const NPC_TYPES = Object.keys(SPECIES);
// ZOMBIES: a flag on a person (Animal.zombie); a zombie runs the rule AI and relates to others as kind `zombie`.
export const ZOMBIES = {
  startCount: 3,                         // people turned when a world loads (Ecosystem.startOutbreak)
  infectChance: 0.25,                    // per zombie contact hit on a living person or the Survivor player
  turnS: 10,                             // sim seconds from infection to turning; the infected act and look normal till then
  hunts: { human: true },                // living people; the player too in Survivor (avatar.isFoodFor)
  carrion: { human: true, zombie: true }, // any person's body
  food: 'human',                         // the rule AI's food: living people
  grazes: false, crates: false           // no plants, no food boxes
};
// RELATION KINDS: each species plus `zombie`; species kinds share their type ids, so kind id = type id for non-zombies.
export const NPC_KIND_SPECS = { ...SPECIES, zombie: ZOMBIES };
export const NPC_KINDS = Object.keys(NPC_KIND_SPECS);
// HERITABLE GENES (every animal, mate()'s rule): strength scales contact hits and their push; toughness scales maxHealth.
export const NPC_GENE_START = { strength: 1, toughness: 1 };   // founders' values
// ENERGY (Animal.setBodyRates): food need per tick = health x this x speed gene share x strength x toughness x mass share.
export const NPC_FOOD_PER_HEALTH_TICK = 0.000003;
// BROKEN BONES: a hit of sureDamageShare of maxHealth breaks one; a smaller hit with chanceBelowSure (NPCs: / toughness).
export const BROKEN_BONE = { sureDamageShare: 0.5, chanceBelowSure: 0.05 };
// PEOPLE WITHOUT BRAINS: a share of people, rolled at spawn and at birth, run the deer and coyote rules (thinkDeer)
// instead of a learning brain, hunting `food` as a coyote does. Some of them carry a gun with endless rounds; an armed
// one never strikes by hand, it shoots: at whoever hit it last (the player included) for foeS, else at the prey it chases.
export const RULE_PEOPLE = {
  share: 0.1,           // of people, with no brain
  food: 'deer',         // the species they hunt for food
  armedShare: 0.5,      // of the people with no brain, carrying a gun
  weapon: 'glock19',    // WEAPONS entry for its bullets
  rangeM: 40,           // a target in sight within this is shot at
  shotS: 0.8,           // seconds between shots
  aimHoldS: 1.5,        // seconds the arms stay raised to aim after a shot, then back to low ready (drawn only)
  huntHungerShare: 0.5, // prey is shot only with hunger at least this share of full (NPC_NEED_FULL); attackers always
  spreadRad: 0.02,      // aim error each way, radians
  foeS: 30              // seconds an attacker stays its target after its last hit
};

// BODY PERFORMANCE: reference body is NPC_REF_BMI at the base lean index.
export const NPC_REF_BODY_FAT = Object.fromEntries(Object.keys(NPC_REF_BMI).map(sex =>
  [sex, 1 - NPC_LEAN_INDEX_BASE[sex] / NPC_REF_BMI[sex]]));
// Strength: lean mass counts in full, fat at NPC_FAT_STRENGTH_SHARE.
const NPC_FAT_STRENGTH_SHARE = 0.25;
// fighting mass over total mass at fat share f
export const fightMassShare = f => 1 - f + NPC_FAT_STRENGTH_SHARE * f;
// Animals fight with the reference man's share.
export const NPC_ANIMAL_FIGHT_SHARE = fightMassShare(NPC_REF_BODY_FAT.male);
// reference fighter: average man, reference body, full health; strength = fighting mass x health, as Ecosystem.fightHit
export const NPC_FIGHT_REF_STRENGTH = (() => {
  const h = NPC_SIZE.human.male[0];   // height sets his mass through BMI
  return NPC_REF_BMI.male * h * h * NPC_ANIMAL_FIGHT_SHARE * SPECIES.human.health;
})();
// Speed: pace from lean share.
export const NPC_PACE_LEAN_EXP = 1;
export const NPC_PACE_LIMITS = [0.5, 1.2];
// Jumps: height is base x pace^NPC_JUMP_PACE_EXP.
const NPC_JUMP_PACE_EXP = 1;
export const bodyJumpSpeed = (baseSpeed, pace) => baseSpeed * Math.sqrt(pace ** NPC_JUMP_PACE_EXP);
// Species ids (index in NPC_TYPES); masks are bit sets of ids.
export const NPC_TYPE_IDS = {};
NPC_TYPES.forEach((t, i) => { NPC_TYPE_IDS[t] = i; });
export const NPC_TYPE_COUNT = NPC_TYPES.length;
export const HUMAN_TYPE_ID = NPC_TYPE_IDS.human;
// Kind ids (index in NPC_KINDS); relation masks are bit sets of kind ids, indexed by kind id.
export const NPC_KIND_IDS = Object.fromEntries(NPC_KINDS.map((k, i) => [k, i]));
export const NPC_KIND_COUNT = NPC_KINDS.length;
export const HUMAN_KIND_ID = NPC_KIND_IDS.human;
export const ZOMBIE_KIND_ID = NPC_KIND_IDS.zombie;
// bit set of the kinds whose spec field `field` lists as true, per kind
const kindMask = field => NPC_KINDS.map(h => NPC_KINDS.reduce((m, t, i) => NPC_KIND_SPECS[h][field]?.[t] === true ? m | (1 << i) : m, 0));
export const HUNTS_MASK = kindMask('hunts');
export const HUNTED_BY_MASK = NPC_KINDS.map(t => NPC_KINDS.reduce((m, h, i) => NPC_KIND_SPECS[h].hunts[t] === true ? m | (1 << i) : m, 0));
// dead bodies each kind eats (carrion), as bit sets of kind ids
export const CARRION_MASK = kindMask('carrion');
// night quarry
export const NIGHT_PREY_MASK = kindMask('nightPrey');
// kinds an armed person shoots on sight (shootsOnSight)
export const SHOOTS_ON_SIGHT_MASK = kindMask('shootsOnSight');
// ids of each kind's hunts keys, in key order
export const HUNTS_LIST = NPC_KINDS.map(h => Object.keys(NPC_KIND_SPECS[h].hunts).filter(t => t in NPC_KIND_IDS).map(t => NPC_KIND_IDS[t]));
export const FOOD_KIND_ID = NPC_KINDS.map(t => NPC_KIND_IDS[NPC_KIND_SPECS[t].food] ?? -1);   // -1: plants or nothing
export const WATER_SIGHT_CELL = 20;
export const HIGH_NPC_LOD_DIST = 120;      // metres to billboard on high (perf.npcLodDist)
export const HIGH_FAR_STAT_DIST = 240;    // metres past which far stats hide (perf.farStatDist)
export const NPC_BODY_R = 1.2;     // metres: cull sphere round a body's centre
export const NPC_STATS_R = 0.7;
export const NPC_STATS_UP = 0.55;
export const WATER_CELL = 1;
export const OCC_CELL = 0.25;     // occupancy grid cell, metres
export const OCC_INV = 1 / OCC_CELL;
export const OCC_CARVE_KEEP = 0.2;      // a doorway lane keeps clear of solids

// HUMAN RIG: one merged low-poly body posed in the vertex shader.
export const HUMAN_ATLAS = 512;                   // atlas texels a side
export const HUMAN_FACE_TILE = [128, 64];         // head tiles, 4 male, 4 female
export const HUMAN_BODY_TILE = [256, 128];        // below the neck; one tile per outfit
export const HUMAN_FACE_VARIANTS = 4;             // per sex
export const HUMAN_OUTFITS = 6;                   // 0 tee, 1 shirt, 2 jacket, 3 hoodie, 4 tank, 5 suit
export const HUMAN_OUTFIT_TILES = [[256, 0], [256, 128], [0, 256], [256, 256], [0, 384], [256, 384]];   // atlas texels, as the shader finds them
// Gait: stride in leg lengths grows with speed; cadence is capped.
export const HUMAN_STRIDE_BASE = 0.95;
export const HUMAN_STRIDE_PER_V = 0.48;
export const HUMAN_STRIDE_MAX = 4.6;
export const HUMAN_CADENCE_MAX = 2.6;             // cycles per second; faster slides
export const HUMAN_SWING_MAX = 0.62;              // hip swing, radians
export const HUMAN_IDLE_SPEED = 0.45;             // m/s under which the stride eases to idle
export const HUMAN_GAIT_EASE = 0.15;              // per-tick gait speed easing
export const HUMAN_GAIT_JUMP = 1;                 // metres in one tick past which a move is a teleport
// Rig landmarks: origin at body centre; joints at z = 0.
export const HUMAN_RIG = (() => {
  const foot = -SPECIES.human.lift, at = f => foot + f * NPC_RIG_TOP.human;
  // shoulderX: shoulder joint's offset from the centre line
  return {
    at, foot, crown: at(1), hip: at(0.53), knee: at(0.285), ankle: at(0.045), shoulder: at(0.795), elbow: at(0.625), shoulderX: 4.25,
    // legX: leg axis offset at the hip
    legX: 1.85, legSplay: 0.02,
    // widthAt: torso rings where each region's width is full
    widthAt: { shoulder: at(0.814), chest: at(0.725), waist: at(0.6), hip: at(0.545) }
  };
})();
export const HUMAN_JOINT_BLEND = 0.5;   // bend share a seam ring takes
export const HUMAN_LEG = HUMAN_RIG.hip - HUMAN_RIG.foot;   // hip to sole, rig units
// CROUCH POSE (radians): the body drops what the legs lose.
export const HUMAN_CROUCH = { hip: -1.0, knee: 1.9, lean: 0.35, arm: -0.4, elbow: -0.5, swingKept: 0.6 };
export const HUMAN_LEAN = { swing: 0.12, run: 0.16 };   // upper body's forward lean per hip swing and per run share, radians
export const HUMAN_BOB = 0.85;   // the body's drop per unit of a leg's swing rise
export const HUMAN_FIGHT = NPC_FIGHT_MOVES.human;   // guard and punch arm angles, radians
export const HUMAN_CROUCH_DROP = (HUMAN_RIG.hip - HUMAN_RIG.knee) * (1 - Math.cos(HUMAN_CROUCH.hip)) +
  (HUMAN_RIG.knee - HUMAN_RIG.foot) * (1 - Math.cos(HUMAN_CROUCH.knee + HUMAN_CROUCH.hip));   // rig units
export const CROUCH_DROP = HUMAN_CROUCH_DROP * NPC_UNIT * PLAYER_HS;   // eye drop at full crouch, metres
export const HUMAN_ARM_FLARE = 0.06;   // arm axis outward offset per unit down the arm
// PET (`petting`): one arm reaches its hand (handAt) to the cat's head and rubs it `strokes` times, using the
// shallowest PET_BEND_LEVELS bend that reaches. Packed in iAct.w (humanPetPack).
export const HUMAN_PET = {
  arm: -1, bend: [0.3, 0.9], elbow: -0.3, handAt: 0.4, reachS: 0.35, strokes: 3, strokeS: 0.7, sweepM: 0.07,
  shoulder: [-1.6, 0.4], turnMax: 1.2, stayM: 0.05
};
export const PET_BEND_LEVELS = 4;   // bits for the bend level

// HUMAN LOOK: skin, face, build inherit.
export const HUMAN_SKIN = [0xf2d0b8, 0xe0b391, 0xc89068, 0xa56f48, 0x7a4e32, 0x4e3222];   // light to dark, sRGB
export const HUMAN_SHIRTS = [0xd8d6cf, 0x8e9093, 0x2a2b2e, 0x2d3f66, 0x9c2f2a, 0x5b2430, 0x3f6a3c, 0x6d6b3a,
  0xc59a37, 0x6c98c8, 0x6a4a33, 0xc8b48c, 0xc98299, 0x5e4a86, 0xc86f2e, 0x2f7576];
export const HUMAN_PANTS = [0x3a5378, 0x24324d, 0x232325, 0x67686b, 0xa8956c, 0x5a4330, 0x4f5235, 0x283150, 0x6a86a8];
export const HUMAN_SUITS = [0x26272a, 0x2b3346, 0x3e3f43, 0x4b3e31];
export const HUMAN_HAIR = [[0x17120f, 0x2e1d12, 0x5c3b21, 0x9c7b48], [0x1b1411, 0x4b2c17, 0x86522b, 0xc4a062]];   // [female][face], sRGB

// FAR BILLBOARDS: past perf.npcLodDist, cards baked at load.
export const BB_CELL = 40;                          // texels a side per frame
export const BB_DIRS = 8;                           // views 45 degrees apart
export const BB_BAKED_DIRS = BB_DIRS / 2 + 1;       // front round the left to the back; right views mirror these
export const BB_PHASES = 8;                         // walk frames per gait cycle
export const BB_POSES = BB_PHASES + 1;              // pose 0 stands, 1.. walk
export const BB_BLOCK = BB_BAKED_DIRS * BB_POSES;   // frames per look
export const BB_FRAME = { human: [40, -22], deer: [50, -15.75], coyote: [40, -12.25] };   // rig units: frame side, bottom below the body centre
export const BB_FACE_VARIANT = 3;                   // face baked for people; light hair keeps the hair weight precise
// walk frames' hip swing: an adult's at the species' speed
export const BB_HUMAN_SWING = Math.min(HUMAN_SWING_MAX, Math.asin(Math.min(1, (HUMAN_STRIDE_BASE + HUMAN_STRIDE_PER_V * SPECIES.human.speed / HUMAN_LEG) / 4)));
export const BB_STAND_SWING = BB_HUMAN_SWING / 2;   // a far person swinging less shows the standing frame
export const BB_PHASE_K = BB_PHASES / (2 * Math.PI);
export const BB_MIP_BIAS = -1.5;                    // finer mip so thin limbs stay solid as a card shrinks

// Plants drawn per PLANT_GRID cell, so culling skips whole cells.
export const PLANT_GRID = 3;

// FOOD BOXES: one crate per restaurant or grocery.
export const FOOD_BOX_KINDS = { food: true, grocery: true };
export const FOOD_BOX_SIZE = 0.35;      // cube edge, metres
export const FOOD_BOX_REACH = 1.1;      // touching distance from the centre
export const FOOD_BOX_HEIGHT = 2.5;     // height difference past which out of reach
export const FOOD_BOX_SLOTS = 4;        // crates per place at once
export const FOOD_BOX_OUTDOOR_CHANCE = 0.25;   // share of spawns outdoors instead of at a place

// INDOOR CLIP: ground layers are discarded inside buildings.
export const INDOOR_CELL = 0.25;

// STREETS: markings, parked cars and lamps; cars and posts are solids.
export const CURB_PIECE = 2;                  // metres per piece a road edge is walked in
export const CURB_KINDS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'road',
  'primary_link', 'secondary_link', 'tertiary_link']);   // roads with lamps (and parking, PARKING_KINDS)

export const MARK_KINDS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified',
  'road', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
export const MARK_MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link',
  'primary_link', 'secondary_link']);
export const MARK_MIN_WIDTH = 5.5;            // narrower streets go unmarked
export const MARK_W = 0.12;                   // metres, line width
export const MARK_DASH = 3, MARK_GAP = 6;     // dash and gap
export const MARK_Y = LAYER_Y.road + 0.004;
export const MARK_JUNCTION_CLEAR = 0.3;       // where a line stops outside another road's edge
export const MARK_WHITE = 0xe6e4dc, MARK_YELLOW = 0xd6ac34;
export const LANE_W = 3.4;                    // per lane when the tag is missing

export const PARKING_KINDS = new Set(['secondary', 'tertiary', 'residential', 'unclassified', 'road']);
export const PARK_MIN_HALF = 3.4;             // a street narrower than twice this has no parking
export const PARK_GAP = 1.6;                  // between parked cars
export const PARK_CURB_GAP = 0.2;             // car to curb
export const PARK_P = 0.275;                  // chance a slot is taken
export const PARK_CLEAR = 8;                  // kept from a crossing road's edge
export const PARKED_COLORS = [0x1c1f24, 0xe4e4e2, 0x9ea3a8, 0x5a5f66, 0x7a1f1f, 0x1f3a6b, 0x2f4a3a, 0xb8a98a, 0x3a3f46, 0xc9c9c4];

export const LAMP_SPACING = 30;               // between generated lamps on one side
export const LAMP_H = 5.4;                    // pole height
export const LAMP_ARM = 1.3;                  // head reach over the road
export const LAMP_CURB_IN = 0.45;             // road edge to pole
export const LAMP_NEAR = 12;                  // kept from other lamps (mapped first)
export const LAMP_DOOR_CLEAR = 2.5;           // kept from a doorway
export const LAMP_POLE_R = 0.15;              // half side of the pole collider
export const LAMP_ROAD_REACH = 12;            // within which a mapped lamp's arm turns roadward
export const LAMP_REACH = 10;                 // ground a lamp lights
export const LAMP_MAP_CELL = 1;               // per light map cell
export const LAMP_GAIN = 2.2;                 // ground lamp brightness, times surface colour

export const COVER_CELL = 8;                  // cover grid cell

// NPC OCCUPANCY GRID: solids grown by NPC_RADIUS, 0.25 m cells.
export const OCC_TILE_BITS = 7;                                   // cells a tile side
export const OCC_TILE_MASK = (1 << OCC_TILE_BITS) - 1;
export const OCC_TILE_WORDS = (1 << (2 * OCC_TILE_BITS)) >>> 5;

export const SPAWN_CLEAR = 1.5;   // kept between spawn and any footprint edge

export const STREET_STEP = 2;   // between candidate points along a street

// WILD: procedural world in metres.

// Wild coyote : deer from northern Yellowstone (Crabtree; NPS).
const YELLOWSTONE_COYOTES = 275;
const YELLOWSTONE_DEER = 1875;

class WorldConfig {
  constructor(scale = 20) {
    this.BASE = {
      worldWidth: 850,   // per unit of world scale
      worldHeight: 600,
    };
    // starting wild animals and plants
    this.initialDeer = 400;
    this.initialCoyotes = Math.round(this.initialDeer * YELLOWSTONE_COYOTES / YELLOWSTONE_DEER);
    this.initialPlants = 9000;
    this.probSpawnPlant = 0.03;
    this.groundY = 5;
    this.applySize(scale, 3000);
  }

  // Map size and starting people; each sets only its own thing.
  applySize(scale, people) {
    const B = this.BASE;
    this.scale = scale;
    this.people = people;
    this.worldWidth = Math.trunc(B.worldWidth * scale);
    this.worldHeight = Math.trunc(B.worldHeight * scale);
  }
}

export const CONFIG = new WorldConfig();
export const DEFAULT_SEED = '03132024';
export const WILD_FLOAT_DEPTH = 5 * NPC_UNIT;

// WATER: one surface; land falls to sea at the edges.
export const COAST_SEA = 30;
export const COAST_LAND = 70;
export const COAST_WOBBLE = 20;     // coastline wander (under COAST_SEA, so the edge is water)
export const OCEAN_DEPTH = 6;      // sea floor under the water level
export const OCEAN_REACH = 2000;   // sea past the edge (camera's far plane)

// CABINS: the Arena's log cabins, player-sized, as solids.
export const CABIN_SCALE = 1.75;
export const CABIN_M = NPC_UNIT * PLAYER_HS;        // rig units to metres

// CAT COMPANION: Nibbler, house-cat sized.
export const CAT_HEAD_TOP = 0.3;
export const CAT_SCALE = CAT_HEAD_TOP / 12.5;
export const CAT_SEAT = { x: 0.3, y: 0.45, z: 0 };     // seat in the car's frame (+x passenger, -z forward)
export const CAT_DOOR = 0.95;         // centre line to where he waits at the door
export const CAT_RUN_FROM = 25;       // m: farther than this (or the car moving) he runs...
export const CAT_WALK_WITHIN = 4;     // m: ...until this close, then walks
export const CAT_RUN_SPEED = 11;      // m/s catch-up sprint
export const CAT_BOARD_SPEED = 2.2;   // m/s trot to the door
export const CAT_JUMP_TIME = 0.55;    // s door to seat
export const CAT_BOARD_TIMEOUT = 8;   // s until he hops in anyway
export const CAT_HEAD_FWD = 9 * CAT_SCALE;   // head ahead of the body centre
export const CAT_PET_STEP_SPEED = 0.6;       // m/s step to where he is petted
export const CAT_PET_SETTLED = 0.01;         // m that counts as there
export const CAT_PET_TURN_RATE = 8;          // per second turn toward the petting's facing
export const CAT_RADIUS = 0.15;              // m collision radius against walls
export const CAT_BODY_H = 0.35;              // m collision height above his feet

// CAMERA POV: '1st' or '3rd'; third person shows the player's body.
export const TPP_BACK = 70 * NPC_UNIT * PLAYER_HS;   // the Arena's TPP_OFFSET, player-sized
export const TPP_UP = 18 * NPC_UNIT * PLAYER_HS;

export const PLAYER_JOG_ANIM = 0.5;   // share of the step the gait animates when not sprinting

// GRAPHICS: high has shadow maps; blobs on both.
export const SHADOW_FOLLOW_STEP = 20;       // box centre drift before a redraw
const SHADOW_SUN_STEP_DEG = 0.5;
export const SHADOW_SUN_STEP_COS = Math.cos(SHADOW_SUN_STEP_DEG * Math.PI / 180);
export const SHADOW_ANIMAL_HZ = 15;     // most animal-caused redraws a second
// only animals this close trigger a redraw
export const SHADOW_ANIMAL_DIST = 60;
export const SUN_DIST = 300;                // box centre to light, inside SHADOW_DEPTH
export const SHADOWS_ENABLED = true;        // master switch

// WILD_GROVES: Millennium Park's trees as groves, "|"-separated, dx dz in decimetres.
export const WILD_GROVES = [
  '303 -242 325 -256 334 -223 304 -289 297 -126 332 -98 315 -27 278 9 233 -53 173 -89 69 -77 22 126 4 87 -15 75',
  '-44 67 176 221 274 267 270 306 239 321 241 372 265 344 188 376 187 346 187 307 -177 291 -198 313 -223 327',
  '-254 332 -280 334 -335 380 -305 337 -322 352 -322 302 -287 99 -225 49 -282 -38 -282 6 -192 -41 -86 -101 -117',
  '-110 -137 -131 -153 -151 -157 -171 -155 -190 -29 -225 -36 -242 -35 -266 -40 -285 -42 -315 -59 -260 157 -248',
  '141 -223 -157 -226 -148 -252 -103 -256 -144 -272 -160 -282 -163 -307 -77 -258 -126 -262 -257 -316 -282 -271',
  '-295 -216 -302 -142 -300 -101 -324 160 -262 148 -220 159 191 200 205 236 219 211 255 222 255 262 174 282 141',
  '270 108 264 78 264 26 312 12 289 -30 200 -8 187 13 167 -165 145 -163 177 -165 204 -166 229 -169 262 -123 145',
  '-118 170 -107 192 -90 200 -66 207 -119 117 -166 47 -135 27 -118 -2 -112 -40 -166 -28 -18 9 27 -46 -54 -95 1',
  '-149 0 -174 -10 -201 11 -193 24 -191 47 -191 101 -97 62 -194 76 -196 80 -178 141 -183 194 -166 221 -156 246',
  '-167 249 -199 275 -193 266 -157 276 -134 183 -294 184 -259 224 -267 211 -308 285 -219|-50 346 54 316 35 261',
  '74 230 156 291 266 230 386 140 376 65 439 43 314 86 325 -25 243 5 210 11 191 35 148 46 134 77 69 -5 35 24 6',
  '49 -28 82 -60 55 -8 5 -221 98 -116 127 -192 97 -223 189 -191 187 -228 -308 -226 -275 -198 -310 -196 -276 -51',
  '-168 18 -246 67 -240 117 -250 192 -196 144 -188 230 -195 268 -211 291 -250 315 -216 161 -277 200 -303 222',
  '-285 -52 -323 -24 -273 -226 -235 -226 -193 -226 -155 -197 -195 -197 -157 -196 -236 -221 -21 -221 19 -221 60',
  '-116 48 -114 -11 -192 59 -191 17 -191 -23 -223 -55 -193 -56 -106 -72 -45 -84 82 -64 222 -128 169 -69 263 110',
  '163 169 210 139 114 200 104 110 -9 297 -221 342 -190 340 -221 304 -221 223 -221 263 -190 302 -189 221 -189',
  '261|116 315 109 269 161 285 47 77 77 113 68 162 -11 188 111 -37 174 -43 216 -26 340 -2 249 -15 225 37 352 44',
  '377 -131 344 -225 356 -296 264 -290 240 -365 174 -236 125 -173 99 -281 -132 -108 -81 -92 -244 -35 -231 39',
  '-259 41 -249 -307 -246 -71 -247 -107 -247 -145 -141 -168 -247 -186 -247 -226 -248 -270 -26 -251 -84 -267',
  '-134 -235 -73 -169 190 -319 242 -107 283 -80 316 -51 327 -119 147 -131 191 -125 1 -162 -13 -97 99 -125 56',
  '-107 20 -71 29 44 47 -1 80 39 -47 105 -34 147 -48 44 -118 65 24 233 70 258 56 297 -4 263 90 344 -68 314 -48',
  '266 -55 202 -258 194 -256 230 -255 266 -229 192 -228 228 -226 264 -258 156 -257 75 -257 115 -229 154 -229 73',
  '-229 113|349 159 394 197 384 229 380 168 351 242 306 199 320 167 224 234 316 230 192 260 125 262 53 264 -34',
  '264 -112 266 -72 239 -178 267 -146 241 -204 242 -179 216 -37 40 -115 42 -36 106 -114 108 50 40 51 106 122',
  '-25 121 -88 222 -23 121 -207 119 -271 118 -334 214 -278 213 -333 212 -379 41 -271 39 -335 -44 -206 -116 -202',
  '-239 -200 -314 -39 -314 -82 -329 -237 -329 -195 -331 -314 -330 -278 -242 -320 -239 -242 -241 -284 -45 -270',
  '-117 -266 -47 -333 -119 -330 42 -207 50 -23 49 -86 -37 -23 -115 -21 -38 -86 -116 -84 -239 -85 -240 -42 -313',
  '99 -315 15 -313 55 -113 215 -34 213 52 213 93 237 11 237 124 210 191 209 157 235 122 38 123 104 221 97 222',
  '33|193 295 119 308 273 296 268 172 197 166 111 58 118 155 -5 125 83 156 80 58 -91 174 -38 178 -52 278 -91',
  '291 -238 165 -229 67 -191 73 -146 81 -213 -22 -252 -180 -157 -91 -55 -284 78 -95 76 -171 77 -135 107 -171',
  '108 -135 109 -95 106 -245 106 -207 106 -286 104 -360 106 -327 75 -286 75 -245 75 -207 -6 -381 73 -360 75',
  '-326 -140 -308 -109 -329 -106 -387 -151 -345 -217 -212 -169 -261 -338 -101 -290 -142 -339 108 -298 125 -321',
  '-26 -99 86 -44 112 -108 117 -49 -9 6 37 80 -61 80 -21 80 20 111 20 111 -21 111 -62 270 229 197 228 119 269',
  '120 188 120 228 -6 187 -3 238 11 291 85 189 85 229 85 271 85 309 -106 319|118 320 115 262 118 193 118 126',
  '115 49 115 -9 113 -60 115 -118 111 -184 110 -243 108 -306 108 -366 182 -369 -66 -303 -124 -303 -66 -364 -124',
  '-363 -63 -182 -121 -181 -64 -240 -121 -239 -60 -7 -117 -6 -61 -57 -119 -57 -60 -115 -117 -115 -59 52 -116 53',
  '-57 196 -114 196 -56 128 -113 129 -57 323 -114 324 -60 265 -117 265 -56 388 -113 389 45 -366 45 -305 -7 -303',
  '-7 -364 48 -183 -4 -182 48 -242 -5 -240 52 -9 -1 -7 50 -59 -2 -57 52 -117 -1 -116 53 50 0 52 55 321 2 323 52',
  '263 -1 265 55 194 2 195 56 127 3 128 118 386 56 387 3 388|258 -443 251 -502 246 -311 268 9 255 169 260 187',
  '-357 -490 -107 168 -43 171 91 179 55 184 19 182 -53 137 -108 103 -79 80 10 23 51 -3 56 -35 52 -149 100 -185',
  '-63 -105 1 -128 -125 -87 -297 22 -259 -7 -344 52 -292 167 -277 141 -261 117 -241 95 -387 85 -387 41 -71 -9',
  '-64 33 -9 -30 -219 -36 -178 -62 -153 37 -120 17 -170 158 -147 155 -216 75 -175 52 -164 90 -118 56 131 179',
  '244 113 246 68 194 51 169 69 141 91 128 115 130 150 157 162 158 129 192 101 131 -29 211 -13 222 27 127 -124',
  '164 -154 198 -200 225 -255 256 -371 83 -509|-302 378 -189 379 -84 375 36 372 155 376 292 354 293 -169 276',
  '-86 245 24 184 14 172 -27 169 96 172 171 243 98 104 5 94 -37 62 -16 126 27 -35 106 -108 174 -255 183 -282',
  '108 -216 99 -345 -19 -346 21 -277 -112 -301 -133 -333 -148 -330 -117 -96 -100 -143 -109 -190 -98 -169 -119',
  '-23 -260 -33 -221 -28 -191 -52 -159 -283 -191 -370 -151 -108 5 -177 10 8 -13 -51 -2 -4 -116 -33 -112 10 -145',
  '117 -129 70 -123 249 -115 218 -109 168 -123 176 -160 158 -174 152 -254 139 -196 136 -230 54 -237 85 -176 297',
  '176 257 285 185 248 90 291 28 207 -59 294|206 175 242 164 -308 -231 -369 -240 -210 -264 -257 -242 -273 -337',
  '-248 -363 -226 -398 -396 -403 -340 -333 -366 -370 -335 -404 -92 265 -162 159 -165 216 -28 148 -24 109 -6 77',
  '48 49 22 58 103 32 142 27 181 19 81 -25 214 2 243 -14 238 23 221 -356 239 -383 77 -319 163 -415 185 -421 79',
  '-105 79 -154 30 -29 -19 -14 -83 -1 -281 109 -179 261 -244 220 -265 178 62 278 39 256 14 226 -3 205 -20 179',
  '24 187 117 266 96 237 74 202 84 168 95 202 117 209 149 201 165 180 183 166 117 58 252 142 252 101 265 69|118',
  '409 99 383 118 295 191 250 116 138 118 84 180 34 97 -79 115 -114 48 -197 276 -215 -82 -274 -109 -229 -99',
  '-205 -76 -194 -103 -160 -142 -165 -144 -133 -141 -112 -115 -117 -94 -107 -80 16 -148 6 -132 -71 -104 -64 -74',
  '-66 -121 329 -95 349 -113 371 -40 -101 9 -107 39 -154 -62 -154 -54 -183 -29 -190 41 -240 43 -280 -50 -249',
  '-17 -282 3 -264 -38 -235 -56 -230 117 38 110 -2 106 -53 72 -47 32 95 -29 119 -30 85 44 -27 23 13 -42 -74 103',
  '264 104 231 114 194 -53 163 -22 370 -2 370 16 382 38 385|205 182 209 243 48 34 -54 90 21 150 21 69 21 109',
  '-103 280 -103 207 -148 241 -166 221 -166 250 -106 142 -166 159 -161 116 -148 77 -206 -26 -172 -87 -116 -110',
  '-150 -95 32 -201 32 -241 32 -279 79 -280 79 -242 79 -202 255 -285 255 -247 255 -207 254 -325 78 -320 31 -319',
  '-116 -242 -265 -192 -256 -265 -234 -300 -177 15 -103 6 -162 -49 35 -50 19 35 33 -86 32 -122 32 -160 79 -161',
  '254 -166 202 119 139 121 50 149 50 68 50 108 139 182 137 245 50 187 51 223 52 259 21 188 22 224 24 260 -176',
  '303|110 377 47 378 108 312 45 313 117 250 54 250 117 194 55 195 85 67 122 9 59 10 120 -55 57 -54 121 -116 58',
  '-115 122 -178 60 -177 122 -229 60 -228 122 -293 60 -292 120 -353 57 -352 -109 -290 -112 -349 -109 -175 -109',
  '-226 -112 -52 -111 -113 -110 12 -114 198 -114 80 -124 316 -115 253 -122 380 7 -291 -52 -291 5 -350 -54 -350',
  '7 -175 -52 -175 7 -226 -52 -226 5 -52 -54 -52 5 -114 -54 -113 2 80 -57 80 6 11 -53 11 2 197 -57 197 -7 315',
  '-66 315 1 252 -58 252 -5 379 -64 379|111 358 183 343 113 298 113 237 181 273 111 173 109 110 108 47 107 -22',
  '90 -167 87 -290 87 -227 84 -412 84 -353 24 -413 24 -354 -37 -412 -37 -353 -96 -288 -95 -225 -150 -287 -98',
  '-410 -98 -351 -153 -408 -153 -349 27 -291 28 -228 -34 -290 -34 -227 30 -168 -31 -167 -67 49 -63 176 -121 177',
  '-65 113 -123 113 -62 301 -119 301 -61 239 -118 240 -63 360 -121 361 45 47 -8 49 44 -22 -8 -20 48 174 -4 176',
  '46 111 -6 112 50 299 -3 300 51 238 -2 239 48 358 -4 360|-77 399 -134 400 45 330 47 390 -20 333 -18 393 106',
  '332 108 392 102 206 105 269 102 147 106 -53 109 -1 105 -172 106 -110 102 -233 104 -292 183 -352 -71 -345',
  '-128 -344 -72 -230 -130 -229 -70 -289 -128 -288 -69 -169 -127 -169 -68 -107 -125 -106 -68 -50 103 -348 41',
  '-347 -12 -345 39 -232 -13 -230 41 -291 -11 -289 42 -171 -10 -169 44 -109 -9 -107 44 -52 -9 -50 47 0 -6 1 41',
  '145 -24 148 41 204 44 267 -24 207 -21 270 -79 339 -136 340 -83 213 -80 276 -137 277|-112 146 -49 150 -108',
  '211 -50 209 13 269 72 268 14 332 74 330 134 388 288 387 285 325 286 271 131 265 132 327 76 391 16 392 11 147',
  '11 206 70 205 -109 271 -50 270 -44 333 -21 2 -80 2 91 -111 28 -110 32 -50 96 -174 33 -174 92 -241 29 -240 87',
  '-303 24 -302 88 -362 25 -361 -144 -359 -145 -300 -140 -237 -136 -171 -27 -359 -86 -359 -23 -238 -28 -301 -87',
  '-301 -82 -238 -19 -172 -78 -172 -24 -108 -83 -108 -21 -48 -80 -48 -141 -108 -137 -47 -137 3|131 373 69 374',
  '131 312 68 313 130 250 67 251 126 188 64 189 126 122 64 123 62 60 9 -3 -50 -3 -45 -159 16 -160 72 -283 73',
  '-220 127 -284 69 -405 69 -346 124 -406 124 -347 -51 -404 -51 -345 10 -405 10 -346 -112 -403 -112 -344 -48',
  '-282 -47 -219 13 -283 14 -220 -109 -281 -109 -218 -105 126 -107 63 -102 254 -105 192 -100 376 -101 315 -107',
  '-2 -106 -158 11 125 -48 125 9 62 -50 62 15 253 -45 253 11 191 -48 191 16 376 -43 376 15 315 -44 315|264 208',
  '249 118 240 -70 106 21 24 27 103 -57 109 121 104 68 17 76 5 117 -19 80 -49 103 -174 89 -185 61 -127 89 -276',
  '114 -316 61 -377 108 -364 -83 -288 -85 -323 -165 -224 -83 -146 -86 -228 -167 -159 -165 -373 -4 -272 36 -310',
  '30 -187 -11 -14 24 -93 43 -107 -18 -73 -86 30 -80 116 -282 113 -341 9 -312 110 -413 175 -284 174 -345 175',
  '-413 194 17 243 17 195 -67 236 163 200 125 190 75 245 71 191 259 226 275 196 366 194 303 247 353|274 193 118',
  '195 164 194 226 193 71 195 -10 197 -59 198 -107 198 -144 320 -194 321 -194 245 -147 244 -201 199 -153 199',
  '-159 135 -203 135 -112 -98 -64 -98 -16 -100 61 -105 109 -105 102 -169 59 -170 155 -106 203 -106 204 -171 151',
  '-171 251 -108 251 -167 -155 -242 -212 -242 -212 -331 -156 -331 198 -339 182 -253 -16 -159 -63 -163 -116 -163',
  '-165 -161 -208 -162 -206 -97 -158 -97 -10 137 -58 133 -111 133 112 131 68 130 160 129 223 129 267 129|60 247',
  '65 166 64 99 63 25 60 -55 204 -243 269 -76 315 -78 316 -16 270 -14 315 42 269 44 314 108 268 110 319 168 272',
  '170 320 243 274 245 258 -244 261 -314 -70 -188 -73 -268 -75 -313 -224 -71 -170 -70 -223 77 -168 78 -173 13',
  '-227 12 -223 232 -169 232 -168 155 -223 155 -173 -136 -227 -137 -228 -217 -173 -217 -216 -325 -143 -321 -210',
  '-276 -144 -272 -67 -113 -69 -50 -72 25 -68 85 -71 152 -65 230 -63 304 -164 300 -218 300|80 120 112 126 242',
  '228 315 359 230 -282 165 -276 252 -217 227 -235 86 -67 -46 -67 -83 -164 -201 -45 -193 135 -153 94 -97 208',
  '-190 284 -193 208 -91 325 -59 308 -310 194 -308 235 -260 275 -276 60 -241 -10 -289 16 -231 -130 -293 -89',
  '-121 -122 -158 -81 -186 -166 -117 -266 -150 -213 -27 -268 -49 -219 349 -274 325 -245 292 -259 315 -193 282',
  '-204 165 -176 197 352 90 353 173 174 167 -50 61 187 147 -28 35 -56 -5 182 17 -19|232 -264 265 -290 305 -345',
  '40 -174 72 -154 87 -182 74 -222 48 -73 43 -130 23 53 29 12 36 -23 110 184 328 324 311 267 295 226 -166 329',
  '-209 349 -60 257 -116 291 -234 190 -190 165 -206 55 -181 19 -152 -43 -151 -110 -185 -125 -192 -178 -215 -203',
  '-151 -347 -288 200 -290 304 306 182 339 149 243 134 36 300 5 103 -129 121 -89 77 -60 1 -72 33 -47 -86 -44',
  '-45 -98 -264 -56 -181 -75 -215 142 -226 105 -205 183 -237|149 -46 173 -59 102 -25 223 -143 347 -233 365 -145',
  '400 -239 154 4 97 59 26 155 15 321 360 323 -245 261 -199 285 -178 196 -156 109 -183 52 -132 -68 -85 -31 -59',
  '-227 -124 -227 -80 -138 -218 -351 -223 -423 -159 -136 -146 -7 -177 -53 -194 -17 -226 -118 307 320 -87 327',
  '-40 276 -134 285 -104 243 -142 178 -28 191 -35 67 -27 117 167 -229 150 -143 28 25 40 103 75 10 -6 -77 27 -40',
  '93 -225 24 -227 -5 -138 70 -142|45 -305 87 -242 181 -244 135 -243 232 -246 -37 -241 46 -243 -88 -239 -134',
  '-238 -182 -237 -229 -238 -85 -305 -136 -303 -179 -302 -230 -302 187 400 188 312 182 144 100 1 153 -2 144 63',
  '102 62 54 2 55 64 -36 -6 -33 60 -149 124 -158 305 -154 406 -213 406 -214 308 -202 129 -178 64 -176 -1 -226',
  '63 -227 -1 -84 62 -130 63 -82 -4 -133 -2 204 233 266 232 246 144 242 181 193 61 232 62 191 -2 232 -3|-66 372',
  '-152 338 36 279 -15 327 122 191 176 83 159 140 115 -63 154 -21 172 22 317 -134 266 -168 233 -202 66 -227 -36',
  '-298 -98 -121 -125 -156 -135 -128 -126 27 -118 -19 -94 -68 -155 -12 -86 145 -116 101 -135 69 -130 135 -195',
  '106 -130 -205 -130 -263 -73 -277 -96 -255 291 -283 196 -234 153 -252 111 -248 42 -179 47 -129 71 -91 2 -5 49',
  '31 32 102 73 235 12 168 -152 236 -101 176 -47 171 -201 204 -186 379|331 180 256 185 92 190 136 153 40 217 58',
  '149 32 176 -46 251 0 207 -24 231 -106 48 -186 46 -219 84 -84 -17 74 3 232 -8 374 -118 -127 -10 -229 -126',
  '-229 -172 -229 -220 -215 -290 -195 -340 -174 -400 -154 -449 -237 142 -281 106 -282 54 -262 6 -285 -58 -227',
  '-1 -223 -62 -28 67 -39 22 -52 40 -64 63 116 83 83 115 59 18 202 13 165 45 366 -4 342 -39 336 -86 299 -52 262',
  '-32 342 -411|143 159 124 189 102 225 209 80 176 132 196 -59 231 -26 234 12 178 -92 66 -301 56 -228 93 -236',
  '136 -236 123 -208 -81 -287 -84 -29 -58 17 -253 138 -92 161 -138 254 -174 214 -251 289 -206 178 -234 219 -221',
  '236 -276 254 -66 -253 -27 -219 -44 -306 25 -265 27 -211 -52 -378 -68 -350 156 -125 79 -102 94 -147 142 -38',
  '109 -75 32 108 -17 62 -21 122 -57 202 33 185 -32 168 -115 278 -196 288|37 -241 128 -117 194 -131 282 -62 300',
  '19 241 27 255 -142 257 -232 133 -35 17 55 166 214 161 304 12 305 98 304 -55 304 -201 300 -125 301 -154 214',
  '-215 216 -278 70 -148 5 -225 -42 -136 -109 -288 13 -317 -29 -258 -64 1 212 78 213 -71 214 -119 215 -46 68 -4',
  '-12 -103 -59 -21 -70 89 47 229 -194 197 -307 58 -154 92 -179 57 -87 -68 -147 -29 -116 -6 -213 -56 -268 -27',
  '-308 -130 -305|-150 365 -17 344 -20 276 15 163 36 117 63 68 92 10 133 -48 162 -234 337 -270 7 -248 13 -283',
  '-133 -304 -200 -308 -247 -336 168 -258 48 -257 82 -252 131 -263 67 -140 30 -155 20 -191 33 -221 130 -206 -85',
  '-167 -98 -227 -64 -29 -68 -89 -176 111 -115 96 -236 216 -253 77 -287 45 -280 -2 -84 26 -3 210 -203 233 -144',
  '321 -161 279 305 371 233 364 315 288 285 258 318 253|281 318 136 322 293 65 285 -30 292 -170 238 -165 231',
  '-217 231 -268 273 -270 229 -347 266 -353 225 -387 -345 137 -347 77 -242 229 -318 227 -92 222 -164 225 -79 78',
  '150 76 69 -28 39 17 81 20 47 66 85 66 151 -19 -68 35 22 -26 3 50 -172 4 -131 11 -129 65 -184 54 -168 137',
  '-264 137 -313 -34 -269 -24 -222 -12 -232 37 -297 27 -347 9 271 -408 242 68 246 -22|-226 254 -110 258 -43 337',
  '-44 261 51 336 127 332 130 265 43 263 47 200 115 205 48 48 49 126 116 53 117 132 40 -91 45 -19 41 -163 45',
  '-314 41 -242 39 -384 294 264 295 194 296 42 297 121 -118 -358 -117 -263 -115 -176 -114 -87 -115 19 -111 123',
  '-245 -86 -245 -156 -247 -293 -248 -378 -25 -382 -19 -312 -23 -241 -23 -161 -24 -89 -19 -18 -16 49 -15 128',
  '-17 202|249 -262 307 -263 304 -216 252 -212 78 -262 78 -208 119 -263 123 -208 45 -71 44 -152 -10 -72 -10',
  '-152 48 -5 -7 -6 50 143 45 78 -5 142 -10 77 50 220 -6 297 -5 220 54 366 49 297 -1 365 -76 306 -138 196 -133',
  '290 -80 252 -80 213 -141 106 -79 159 -80 107 -146 -6 -82 41 -82 -24 -144 -107 -85 -74 -83 -126 -140 -263',
  '-142 -201 -78 -199 -78 -263 26 -259|107 -108 108 -46 167 -112 169 -50 234 -1 234 58 235 115 111 122 172 118',
  '46 122 -13 122 -74 124 -139 122 -203 8 -203 66 -264 3 -79 -106 -77 -44 -143 -108 -142 -45 -207 -107 -205 -44',
  '-267 -112 -266 -50 -76 9 -75 67 -140 7 -140 65 231 -115 232 -53 110 7 110 65 170 3 171 61 44 6 45 65 -15 7',
  '-14 65 41 -108 42 -46 -18 -108 -17 -45|280 136 274 81 279 35 197 67 270 3 242 -48 219 -93 191 -130 161 -191',
  '74 -140 102 -92 -2 -32 -16 6 31 -4 -38 67 -50 107 -41 164 15 159 -277 70 -243 38 -319 -5 -198 -132 -289 -142',
  '-328 -129 -312 133 -182 167 -130 97 -157 128 -132 -79 -123 18 -164 -109 -78 -170 41 -96 -8 -190 -36 -136 150',
  '-34 166 12 87 25 155 115 70 159 119 163|182 179 156 195 119 199 111 263 140 295 95 221 -83 301 -85 197 -183',
  '198 -139 84 -115 136 -172 20 -187 -28 -141 -159 45 -165 80 -137 174 -260 -1 -186 89 -174 48 -203 14 -219 -99',
  '-186 -57 -193 -35 -229 -98 -224 -141 -216 -176 -209 -183 -109 -255 -134 -278 -78 29 -8 72 47 132 21 131 -36',
  '111 -104 140 -98 113 -135 217 154 220 341 119 317 -112 323|311 296 342 -252 350 -295 341 67 305 50 227 160',
  '159 281 -110 307 -157 311 -286 -263 -253 -266 -205 -277 -135 -119 -183 -110 -28 -134 56 -138 -42 -260 -162 7',
  '-126 -13 -107 -25 -274 72 -219 40 -170 -303 -117 -201 -72 -225 -146 -329 -114 -373 -243 -369 -185 207 -242',
  '182 -287 180 -150 246 171 143 274 33 346 177 304 173 267 167 209 238 236 301 116 311|272 57 276 1 325 -6 236',
  '126 27 200 95 173 -8 135 -39 214 -210 297 -135 253 -268 -55 -156 -66 -69 -53 45 -139 122 -140 123 -225 204',
  '-142 203 -223 281 -143 -41 -227 -99 -139 -22 -138 -200 -219 -118 -224 -184 -137 -266 -134 -290 233 -255 133',
  '-154 177 -112 96 -165 104 -134 32 -202 -5 -54 68 129 94 32 56 102 32 175 11 229 2 305 -79|-339 -273 -193',
  '-106 -81 -11 -139 21 50 68 25 107 -30 80 126 214 205 211 206 -12 272 23 237 71 208 121 184 61 144 116 79 -86',
  '89 -20 115 -57 164 -33 136 8 61 217 -5 217 -78 218 -141 220 -221 219 -19 -78 22 -60 52 -37 -24 21 -31 -147',
  '11 -119 44 -108 -114 67 -111 -184 -143 -146 -99 -118 -69 -163 -55 -93 -211 -76 -330 -356|-223 118 -163 117',
  '-30 114 -95 117 31 113 94 111 158 110 207 107 155 48 204 45 201 -7 152 -6 199 -66 197 -123 148 -122 150 -65',
  '89 -120 91 -63 26 -119 29 -62 -37 -117 -35 -60 -100 -114 -98 -57 -167 -111 -164 -55 -227 -54 29 51 92 48 93',
  '-5 30 -3 -32 52 -98 55 -33 -1 -96 2 -165 55 -162 4 -226 56 -225 5|310 131 257 194 58 199 106 198 -36 200 9',
  '199 -96 202 -185 208 -233 208 -232 -89 -234 -155 -187 -87 -106 -89 -195 -155 -103 -153 -46 -91 0 -92 -53',
  '-155 -4 -157 48 -92 96 -93 96 -153 49 -157 260 -96 260 -155 20 -307 23 -230 -35 -308 -32 -231 -237 143 -93',
  '138 -184 143 -43 136 6 134 106 138 59 134 258 135 311 198|180 293 206 287 62 288 -3 162 73 78 -48 133 -86 92',
  '-195 34 -149 -21 -156 -67 -77 -155 62 -323 228 -270 -114 -375 209 -391 103 -333 -25 -313 -48 -280 -58 -226',
  '-157 -232 -146 -270 -137 -314 -157 -122 -156 -168 -121 167 -121 198 -115 91 -142 103 -136 37 76 250 98 238',
  '117 236 105 177 43 186 224 164 174 176 183 242 200 229|67 307 64 233 64 85 65 157 286 5 282 -59 -215 -290',
  '-164 -292 -12 -286 37 -287 -59 -286 82 -288 133 -290 301 -290 80 11 83 -55 128 -57 131 9 -14 13 34 11 -11',
  '-52 32 -53 -62 12 -62 -52 -68 145 -87 99 -113 191 -91 313 -220 304 -199 -44 -196 25 -147 -47 -151 21 0 86 1',
  '159 0 235 3 308|-193 13 -192 72 -139 9 -138 68 -82 127 -18 122 47 121 174 2 174 60 171 -113 172 -50 233 -2',
  '230 -116 231 -54 43 -109 44 -47 111 -114 112 -52 46 5 46 64 114 0 115 59 116 116 -83 11 -83 70 -19 7 -19 65',
  '-86 -104 -85 -41 -22 -108 -21 -45 -191 129 -137 125 -196 -101 -194 -39 -142 -105 -141 -43|-250 -89 -250 -27',
  '-297 -87 -71 -53 -69 8 -67 75 65 172 212 251 290 245 294 167 304 -24 302 58 311 -103 316 -188 320 -351 170',
  '-351 259 -353 60 -163 56 -243 55 -325 111 -349 216 173 66 239 -64 220 67 52 66 -19 62 -89 -64 142 -250 30',
  '-297 33 -296 -25 -252 97 -247 157 -293 159 -298 99 -245 231 -292 233|255 253 264 359 241 187 248 72 147 -88',
  '170 -43 262 -114 259 -197 193 -261 111 -262 -108 -206 -94 -129 -32 -152 -225 -41 -156 -31 -131 -89 -221 46',
  '-216 214 -160 214 -217 314 -160 314 -212 405 -156 405 -227 -122 -234 -206 -172 -206 -171 -276 -233 -277 -112',
  '-274 197 -195 114 -195 41 -152 104 -130 205 402 202 319 224 142|-190 106 -63 107 0 105 123 100 120 38 117',
  '-14 179 98 177 35 173 -17 229 96 227 33 223 -19 115 -73 -7 -68 -10 -125 56 -70 53 -127 -130 -70 -132 -127',
  '-70 -66 -73 -123 -197 -67 -200 -123 -2 43 -5 -9 63 103 61 41 58 -12 -122 103 -125 41 -128 -12 -65 45 -69 -7',
  '-192 44 -195 -8|-92 335 54 352 13 353 50 233 52 288 12 289 10 234 47 113 49 169 8 170 7 114 -101 62 -100 -9',
  '47 -58 45 -122 7 -58 5 -122 154 -193 153 -267 152 -339 40 -297 0 -297 43 -178 41 -241 3 -177 1 -241 -104',
  '-212 -103 -281 -101 -79 -101 -142 -99 137 -94 268 -98 198|-97 -213 -16 -212 114 -73 116 -7 214 21 214 109',
  '219 184 219 250 182 307 117 311 52 309 -17 308 -88 306 -302 301 -252 163 -87 58 -107 156 -56 135 117 187 116',
  '57 116 125 65 -213 144 -213 162 -304 86 -303 7 -302 -63 -300 -131 -299 -268 -6 -202 -298 -277 -297 -297',
  '-246|97 292 149 290 126 236 117 159 108 77 102 11 92 -65 73 -238 71 -326 68 -383 -36 -416 -33 -64 -80 -64',
  '-32 86 -32 6 -80 86 -79 6 -31 151 -78 151 -32 296 -87 294 -30 226 -78 226 -35 -196 -81 -201 -36 -271 -37',
  '-336 -82 -276 -83 -341 53 294 4 292|407 105 365 -11 404 -38 417 -114 352 -104 299 5 206 -30 250 -12 235 -104',
  '-53 251 -49 193 -38 117 -110 4 -83 -32 -31 -59 -128 -77 -75 -92 -166 -113 -190 -107 -220 -123 -221 -86 -152',
  '-22 -184 -54 -157 -332 -198 87 -211 42 -226 109 -140 188 -146 150 -154 257|-59 -330 -9 -330 -10 -282 -60',
  '-282 140 -171 139 -60 143 48 146 156 144 253 8 332 3 234 -48 234 4 286 -47 286 -4 114 -55 114 -3 174 -53 174',
  '-6 17 -56 17 -5 65 -55 65 -7 -113 -57 -113 -3 -46 -54 -46 -8 -172 -58 -172 -9 -226 -60 -226|-84 60 -83 132',
  '-33 208 85 312 -30 281 -30 353 -81 281 -81 353 -33 60 -31 132 -14 -17 60 -19 23 -83 115 -85 231 -27 258 57',
  '145 -310 92 -312 -96 -304 -47 -308 -5 -302 45 -310 -17 -84 71 -85 -84 208 -67 -18 -119 -14 -122 -78 -68',
  '-82|84 328 46 200 90 199 -8 196 78 253 -8 137 86 137 44 134 -59 137 -96 -90 -52 -94 -56 -154 -98 -156 48 -90',
  '92 -94 -6 -94 -5 -153 88 -154 47 -156 70 -306 67 -228 -33 -232 -87 -232 -90 -309 -35 -309 -54 197 -20 290',
  '-65 355 -66 285|-185 254 -182 176 -102 253 -100 175 -27 253 -24 175 108 243 175 238 106 170 243 237 200 -21',
  '269 -63 271 44 201 -120 190 -391 -150 -383 -144 -203 -147 -296 -144 -112 -141 -16 -204 -14 -205 -115 -207',
  '-203 -211 -296 -207 -382 199 71 242 165 173 162|-117 419 -62 430 127 299 -56 197 49 9 50 77 102 116 204 -16',
  '96 -128 104 -179 94 -212 -152 -140 -109 -149 -85 -165 -131 -46 -160 -71 -91 -16 -5 -224 15 -199 31 -219 36',
  '-196 100 -3 91 -45 79 -108 -49 18 8 32 -118 194 -51 327|28 -287 106 -292 24 -195 102 -201 26 -121 104 -126',
  '22 -36 100 -41 24 45 103 40 22 126 100 120 23 216 101 211 25 296 103 290 -108 295 -108 225 -113 158 -106 80',
  '-113 -5 -116 -82 -116 -159 -116 -243 -117 -313|-313 292 -210 349 -168 288 -29 123 25 300 -14 212 110 210 221',
  '127 -16 29 50 21 89 73 112 -152 211 -88 211 -174 172 -229 67 -286 -128 -272 17 -267 61 -67 43 -164 -46 -145',
  '-132 -108 -81 -71 -69 34 -183 -35|180 241 100 238 42 203 -136 339 -130 432 -373 349 -301 350 -207 344 32 146',
  '28 78 34 1 -59 9 29 -89 -62 -153 28 -222 -64 -232 -65 -307 28 -343 195 -193 82 -87 82 -178 138 -153 168 -297',
  '97 -268 133 -208|88 -237 125 -237 94 -174 125 -171 92 -96 125 -96 91 -47 124 -48 125 -1 1 51 1 127 113 148',
  '-79 369 -69 464 -178 340 -185 206 -195 30 -195 -57 -196 -197 -4 -50 -3 -204 2 -120|-63 -398 -114 -398 -113',
  '-212 -54 -212 -112 -284 -57 -285 -111 -132 -54 -131 -111 -57 -53 -57 -33 144 -36 66 83 263 352 259 212 263',
  '306 261 255 263 -31 217 -87 220 -87 143 -92 68|-208 67 -142 67 -210 -7 -143 -7 -61 65 -62 -8 6 65 77 61 4 -8',
  '155 61 234 61 301 61 154 -13 154 -79 76 -13 4 -74 76 -79 -62 -74 -210 -73 -143 -73|291 153 94 -11 257 -88',
  '-124 -81 -133 -6 -148 64 -158 153 -233 160 -221 73 -354 -55 -211 -24 166 -88 86 -87 -55 -12 31 -11 32 -89',
  '-32 -86 176 -13 262 -11 274 58|32 -315 27 -244 28 -164 26 -92 31 -21 34 46 35 125 33 199 -71 336 -6 329 -4',
  '270 -18 199 -17 46 -16 125 -25 -92 -21 -21 -24 -164 -20 -315 -24 -244|-171 71 -172 -3 -93 71 -14 71 -94 -3',
  '-15 -3 53 71 51 -3 126 70 204 70 124 -4 202 -4 124 -69 202 -69 51 -69 -94 -69 -15 -69 -172 -69 -298 10|34',
  '268 33 154 34 96 34 205 4 103 5 137 6 172 6 211 33 48 10 -142 15 -90 -44 -26 -45 -88 -49 -140 10 -258 13',
  '-197 -49 -199 -49 -255|-94 205 87 146 -6 44 -9 -31 -94 53 -95 -23 -2 -109 -95 -92 -83 -159 65 -169 80 -258',
  '164 -170 -38 -231 -6 112 -4 174 -94 129 63 257 161 125|119 -253 24 -105 144 2 150 69 148 162 28 245 35 341',
  '-154 166 30 70 35 154 27 -16 -160 31 -156 -88 -149 -214 27 -253 -148 -312|78 -243 81 -151 106 -65 -6 20 -12',
  '116 100 221 104 297 -4 235 -6 320 -188 176 -205 2 -10 -89 -9 -183 -13 -375 -16 -282|-96 -479 137 -2 135 28',
  '137 110 137 63 12 57 26 10 -204 117 -168 111 -165 64 -107 26 -45 -5 14 -34 76 -41 111 -25|-134 5 14 -22 136',
  '-15 99 -37 244 40 259 69 279 45 165 -25 195 -34 -86 -15 -159 -45 -199 16 -252 1 -286 56 -276 -37|143 -230',
  '123 -87 135 -156 116 -21 96 124 -34 37 -99 95 -200 277 -135 299 -41 332 -72 -75 -61 -191 70 -136 -42 -267|85',
  '-316 134 -225 260 -114 75 -109 101 -41 56 -174 -70 -28 -102 63 -137 207 -118 138 -75 237 -74 323 -178 290 42',
  '-253|-150 -242 -144 -330 -21 -126 79 -78 132 -68 160 -206 106 25 30 32 -31 189 -27 272 -28 330 -105 326 -29',
  '95 28 -217|72 -230 68 -139 72 -50 73 47 77 133 79 226 80 322 83 410 -42 -106 -160 -60 -173 -156 -186 -229',
  '-43 -166|74 -179 152 -184 74 -86 152 -92 -53 104 -49 23 -57 183 -65 334 -61 261 -48 -29 -59 -144 -61 -192|2',
  '-107 63 -40 61 18 60 79 -69 92 0 83 59 -106 -77 -24 -77 25 -14 24 -7 -45|21 -184 25 -109 24 -22 33 48 33 140',
  '33 213 29 355 33 285 17 -258 -123 -201 -124 -267|-175 35 -176 -13 30 -18 33 89 242 157 311 155 32 30 30 -146',
  '29 -77 -178 -72 -177 -141|-228 2 -117 1 -180 3 0 2 -57 0 119 -2 61 0 225 -3 178 -2|72 0 118 -2 -22 3 21 2',
  '-73 4 -179 -4 -225 -2 287 -1|-243 20 -82 31 3 24 100 28 200 -2 100 -33 5 -36 -83 -32|33 -50 33 -5 -38 -50',
  '-38 -106 33 43 33 90 -18 75 -38 3|285 -10 123 -2 197 -3 35 -4 -288 9 -197 6 -115 5 -40 0|1 190 3 140 2 86 0',
  '33 2 -35 -2 -83 -2 -140 -3 -191|-49 56 -10 -29 -29 -3 43 25 57 -123 -36 156 24 -82|3 359 -1 257 -3 145 -7 26',
  '1 -139 2 -245 4 -402|-77 -137 56 85 123 87 199 86 -96 32 -99 -51 -106 -101|5 207 4 133 -2 21 1 -36 -5 -125',
  '-4 -199|-130 6 -82 4 -32 7 7 2 139 -14 98 -5|-33 84 11 76 32 -87 17 -20 -27 -53|-3 -152 -2 -72 -2 1 2 79 5',
  '143|-1 76 1 139 0 -3 1 -67 -1 -144|-20 -21 23 -20 -24 23 20 18|39 79 37 24 -11 -53 -64 -50|-56 -46 17 31 95',
  '-27 -55 42|3 60 3 93 -2 -52 -4 -102|-120 0 -57 1 57 0 120 -1|0 31 0 -32 1 104 -1 -103|0 26 1 86 0 -24 -1',
  '-87|9 -116 -24 -115 7 69 8 162|-21 -42 -16 19 37 23|-19 -85 -18 13 37 72|-22 89 43 40 -21 -129|-1 3 2 49 -1',
  '-52|-2 53 2 -5 -1 -48|1 52 0 1 -1 -53|76 -2 -1 0 -75 2|1 48 0 1 -1 -49|-3 -104 2 7 1 97|-1 -99 -1 0 2 100|89',
  '1 -89 -1|-23 1 23 -1|-2 18 2 -18|-57 0 57 0|-48 1 48 -1|0 27 0 -27|-21 1 21 -1|-30 1 30 -1|-30 1 30 -1|0 0|0',
  '0|0 0|0 0|0 0|0 0|0 0|0 0|0 0|0 0|0 0|0 0|0 0|0 0|0 0'
].join(' ');

// WILDERNESS: procedural land round the city, blending over MIX_BLEND metres.
export const MIX_BLEND = 250;    // measured edge to pure wilderness
export const MIX_RING_MIN = 300;    // wilderness width round the city
export const MIX_RING_MAX = 1500;
export const MIX_PARK_SHARE = 0.25;   // share of wild animals starting in parks
export const MIX_HABITAT = { forest: 2, wood: 2, scrub: 1.5, wetland: 1.5, meadow: 1.25 };
export const MIX_SINK = 0.6;    // wild mesh dip under the city's terrain where they overlap

// BLOB SHADOWS: one ellipse per nearby animal.
export const BLOB_DIST = 40;            // metres from the camera
export const BLOB_MAX = 2048;
export const BLOB_OPACITY = 0.42;
export const BLOB_FULL_SUN = 1.35;      // sun intensity where blobs reach BLOB_OPACITY
export const BLOB_LIFT = 0.04;          // above the feet, against z-fighting
export const BLOB_SPREAD = 1.25;        // size over the footprint

// ICONS: single-colour SVG on a 24-unit grid, all in currentColor (shading by opacity), so every icon takes its button's
// text colour and a lit button inverts it. Sized where shown by ICON_STYLE (showIcon in 8b). Items name theirs in
// SURVIVOR_CONFIG.inventory; an item or injury icon may also be plain emoji text.
export const ICON_STYLE = {
  buttonPx: 24,    // Aim, Draw/Holster, the car door, the action button's Harvest and Loot
  firePx: 26,      // the attack button's fire icon (inside GUN_BUTTON_FACE's ring)
  slotPx: 18,      // inventory and craft slots
  slotColor: 'rgba(232, 228, 220, 0.85)'   // the slots' icon colour (the slot buttons set none of their own)
};
// one icon's svg around its shapes
const iconSvg = body => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' + body + '</svg>';
// a pistol side view, muzzle right: slide with sights, frame and grip raked back (bottom toward the rear), trigger guard
const ICON_GUN = '<rect x="2" y="7.2" width="20" height="4.6" rx="0.9"/>' +
  '<rect x="2.7" y="6.1" width="1.5" height="1.3"/><rect x="19.6" y="6.1" width="1.4" height="1.3"/>' +
  '<path opacity="0.75" d="M4.8 11.8 H16.4 L15.8 13.4 H12.6 Q12.6 16.4 10.2 16.4 L10.9 15.1 Q11.4 14.9 11.4 13.4 H9.3 L8.0 20.2 Q7.8 21.3 6.9 21.3 H4.1 Q3.2 21.3 3.4 20.2 L4.6 13.4 Z"/>';
// an arrow at x, down (holster) or up (draw)
const ICON_ARROW = (x, down) => down
  ? `<path d="M${x} 3 V12 M${x - 2.2} 9.8 L${x} 12 L${x + 2.2} 9.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  : `<path d="M${x} 12 V3 M${x - 2.2} 5.2 L${x} 3 L${x + 2.2} 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
// the gun turned barrel down (rotate 90: muzzle down, grip to the left), its top `top` units down
const ICON_GUN_DOWN = top => `<g opacity="0.6" transform="translate(21 ${top}) rotate(90) scale(0.82)">${ICON_GUN}</g>`;
// a belt holster: the belt clip, then the pouch from its mouth at y
const ICON_POUCH = y => `<rect x="9" y="${y - 2.2}" width="9.6" height="2" rx="0.7"/>` +
  `<path d="M9.6 ${y} H17.8 L16.7 21 Q16.4 22.6 14.9 22.6 H12.5 Q11 22.6 10.7 21 Z"/>`;
export const ICONS = {
  aim: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="7"/><path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6"/>' +
    '<circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
  holster: iconSvg(ICON_GUN_DOWN(1.2) + ICON_POUCH(13.5) + ICON_ARROW(20.8, true)),
  draw: iconSvg(ICON_GUN_DOWN(-1.6) + ICON_POUCH(16.2) + ICON_ARROW(20.8, false)),
  door: iconSvg('<path fill-rule="evenodd" d="M3.5 21.5 V11.2 L9.2 3.5 H19.3 Q20.5 3.5 20.5 4.7 V21.5 Z M6.4 11 L10.3 5.9 H18.1 V11 Z M14 13.4 H18 V15 H14 Z"/>'),
  fire: iconSvg('<path opacity="0.55" d="M12 1 L13.9 7.4 L19.8 4.2 L16.6 10.1 L23 12 L16.6 13.9 L19.8 19.8 L13.9 16.6 L12 23 L10.1 16.6 L4.2 19.8 L7.4 13.9 L1 12 L7.4 10.1 L4.2 4.2 L10.1 7.4 Z"/>' +
    '<path d="M12 5.5 L13.3 9.6 L17 7.6 L15 11 L18.5 12 L15 13 L17 16.4 L13.3 14.4 L12 18.5 L10.7 14.4 L7 16.4 L9 13 L5.5 12 L9 11 L7 7.6 L10.7 9.6 Z"/>'),
  gun: iconSvg(ICON_GUN),
  plant: iconSvg('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 22 V9"/>' +
    '<path opacity="0.8" d="M12 14 Q5 15 3.5 8.5 Q10.5 7.8 12 14 Z"/><path opacity="0.8" d="M12 11.5 Q19 12.5 20.5 6 Q13.5 5.3 12 11.5 Z"/>' +
    '<path d="M12 9.5 Q9 5 12 1.5 Q15 5 12 9.5 Z"/>'),
  water: iconSvg('<rect x="9.6" y="1.5" width="4.8" height="2.4" rx="0.6"/>' +
    '<path opacity="0.4" d="M10.2 4.4 H13.8 V6 Q17 7.4 17 10.6 V11 H7 V10.6 Q7 7.4 10.2 6 Z"/>' +
    '<path d="M7 14.6 H17 V20.6 Q17 22.5 15.1 22.5 H8.9 Q7 22.5 7 20.6 Z"/><rect x="7" y="11.4" width="10" height="2.8" opacity="0.6"/>'),
  box: iconSvg('<path opacity="0.55" d="M2.5 7.5 L12 3 L21.5 7.5 L12 12 Z"/><path opacity="0.85" d="M2.5 7.5 L12 12 V22 L2.5 17.5 Z"/>' +
    '<path opacity="0.4" d="M21.5 7.5 L12 12 V22 L21.5 17.5 Z"/><path d="M6.6 5.55 L16.1 10.05 L17.6 9.35 L8.1 4.85 Z M16.1 10.05 V15.8 L17.6 15.1 V9.35 Z"/>'),
  meat: iconSvg('<path opacity="0.55" d="M14.8 15.4 L19.2 19.8 A2 2 0 1 1 21.4 22.4 A2 2 0 1 1 18.4 20.6 L14 16.2 Z"/>' +
    '<path d="M15.8 13.4 C17.5 9.5 15.6 3.2 9.8 2.6 C4.6 2.1 1.6 6.8 2.8 11.2 C4 15.6 10 17.6 15.8 13.4 Z"/>'),
  bandage: iconSvg('<g transform="rotate(-45 12 12)"><rect opacity="0.5" x="1" y="7.5" width="22" height="9" rx="4.5"/>' +
    '<path fill-rule="evenodd" d="M8 7.5 H16 V16.5 H8 Z M9.3 10 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M13.3 10 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M11.3 12 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M9.3 14 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M13.3 14 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0"/></g>'),
  // an open hand reaching down, fingers spread: Harvest and Loot (the action button)
  harvest: iconSvg('<rect opacity="0.55" x="8.6" y="0.6" width="6.8" height="2.6" rx="0.8"/>' +
    '<path d="M7.4 4.2 Q7.4 2.9 8.7 2.9 H15.3 Q16.6 2.9 16.6 4.2 V10.6 Q16.6 12 15.2 12 H8.8 Q7.4 12 7.4 10.6 Z"/>' +
    '<g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M8.6 10.8 L6.4 18.6"/>' +
    '<path d="M11.1 11.2 L10.5 21"/><path d="M13.6 11.2 L14.4 20.6"/><path d="M15.9 10.6 L18.2 17.4"/><path d="M7.9 6.4 L3.4 11.6"/></g>')
};

// SURVIVOR MODE: rules in SURVIVOR_CONFIG, applied by `game`.
export const SURVIVOR_CONFIG = {
  maxHealth: 100,
  needs: {
    foodPerS: 100 / (20 * 60),    // per second: fed to starving in 20 min
    waterPerS: 100 / (10 * 60),   // per second: watered to parched in 10 min
    drinkPerS: 10,                // per second removed while Drink is held in water
    sprintCost: 2,                // hunger and thirst multiplier while sprinting
    starvingPerS: 0.5,            // health per second with food empty (0 = off)
    parchedPerS: 1                // health per second with water empty (0 = off)
  },
  reach: { radius: PLAYER_RADIUS + 0.45, height: 1.5 },   // contact with animals, plants and crates, metres
  squatS: 1,                        // seconds of squat for `squat` field actions
  punch: { reachM: 1.1, coneCos: 0.5 },   // attack reach in metres and cone (cos of half angle)
  fall: { safeM: 3, damagePerM: 10 },                    // unhurt to safeM, then damagePerM per metre (~13 m lethal)
  plantShare: 0.01,                 // player's share of a plant bite's nutrition
  meatDeerShare: 0.1,               // meat feeds this share of an adult buck kill
  flash: { minDamage: 0.5, maxOpacity: 0.3, fullAtDamage: 20, fadeS: 0.9 },   // damage edge for hits of minDamage+
  bodyEmptyShare: 0.3,              // share of dead people with nothing on them (game.loot); the rest carry one box draw
  // INVENTORY: each kind names its action; `loot` is its weight in a box and on a dead person; `icon` is ICONS markup or emoji text.
  inventory: {
    keys: ['Digit1', 'Digit2', 'Digit3'],     // one per slot
    items: {
      crate: { icon: ICONS.box, label: 'Box', action: 'open' },
      water: { icon: ICONS.water, label: 'Bottled water', action: 'drink', water: 25, loot: 45 },   // water need removed
      // a whole plant
      plant: { icon: ICONS.plant, label: 'Plant', action: 'eat', loot: 45, get food() { return playerPlantFood(PLANT_MAX_HEALTH); } },
      // a kill feeds its starting health
      meat: { icon: ICONS.meat, label: 'Meat', action: 'eat', loot: 10, get food() { return SPECIES.deer.health * SURVIVOR_CONFIG.meatDeerShare; } },
      // mends its INJURIES
      bandage: { icon: ICONS.bandage, label: 'Bandage', action: 'treat', cures: ['brokenBone'], loot: 10 },
      // a rare find; `weapon` names its WEAPONS entry
      glock: { icon: ICONS.gun, label: 'Glock 19', action: 'equip', weapon: 'glock19', loot: 2 }
    }
  },
  // INJURIES: a hit or hurting fall may cause one until an item that `cures` it is used; noRun stops sprinting.
  // One hit or fall of at least sureDamageShare of maxHealth always causes it; a smaller one with chanceBelowSure.
  injuries: {
    brokenBone: { icon: '🦴', label: 'Broken bone', ...BROKEN_BONE, noRun: true }
  },
  // CRAFTING: the craft slot makes the first recipe the inventory holds.
  craft: {
    key: 'Digit4',                  // craft slot key, after the inventory slots
    recipes: [
      { uses: ['plant', 'plant'], makes: 'bandage' }
    ]
  },
  causes: {
    fall: 'Fell to your death',
    coyote: 'Killed by a coyote',
    starving: 'Starved',
    parched: 'Died of thirst',
    human: 'Shot by a person',  // armed people without brains (RULE_PEOPLE) are the only living people who hurt the player
    zombie: 'Killed by a zombie',
    turned: 'Turned into a zombie'   // ZOMBIES.turnS after an infecting hit
  }
};

// Plant food for the player per bite left.
export function playerPlantFood(bites) { return bites * PLANT_MAX_HEALTH * PLANT_BITE_NUTRITION * SURVIVOR_CONFIG.plantShare; }

// HEALTH BARS: stats sprite and brain over nearby people; bars show fullness.
export const BAR_STEPS = 40;     // redraw only on a whole step
export const BAR_RELEASE_TICKS = 180;   // ~3 s out of range before a slot is freed
export const ARROW_STEPS = 32;    // arrow heading directions
export const BAR_ABOVE = 0.18;
export const BAR_COLORS = ['#e74c3c', '#e67e22', '#3498db', '#9b59b6'];
export const BAR_ICONS = ['\u2764\uFE0F', '\uD83C\uDF7D\uFE0F', '\uD83D\uDCA7', '\uD83D\uDC9E'];
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Past perf.npcLodDist, stats and brains are shared InstancedMeshes in atlas pages.
export const FAR_STAT_MAX = 12000;
export const FAR_PANEL_SCALE = 0.25;   // far atlas px per near canvas px
export const FAR_PAGE_PX = 512;        // atlas page size; pages made as needed
export const FAR_CELL_GUTTER = 2;      // padding px so mipmaps don't bleed
// HealthBars' measured text widths kept at most (font and string pairs; the panels use a few hundred)
export const BAR_TEXT_WIDTHS_MAX = 4096;
export const FAR_REDRAW_MAX = 48;      // far panels redrawn per frame at most
// No stats past this many metres.
export const BAR_PX = 0.8 / 192;                       // metres per canvas px (old 0.8 m, 192 px panel)
export const BAR_CANVAS_W = 272, BAR_CANVAS_H = 96;   // width fits the stat row; height above the info row
export const BAR_ROW_H = 20;                           // px per panel row: stats, body, info
export const BAR_TEXT_FONT = 15;                       // px of panel text and icons, shrunk only to fit
export const BAR_ROW_GAP = 8;                          // least px between a row's items
export const BAR_SPRITE_CANVAS_H = BAR_CANVAS_H + BAR_ROW_H;
export const BAR_W_M = BAR_CANVAS_W * BAR_PX;          // sprite width, metres
export const BAR_H_M = BAR_SPRITE_CANVAS_H * BAR_PX;   // sprite height, metres
export const LOBE_RADIUS = 0.7;
export const LOBE_COLS = [0x00e5ff, 0xaaff00];

// BRAINS OVER HEADS: two draw calls per brain; only changed nodes upload.
export const BRAIN_SCALE = 0.11;   // layout units to metres (~6.2 x 4.2)
export const BRAIN_HALF_H = 2.1;
export const BRAIN_ABOVE = 0.06;
export const BRAIN_SPIN = 0.6;    // rad/s spin
export const BRAIN_TILT = 0.18;
export const BRAIN_DIM = 0.3;
export const BRAIN_IN_GROUPS = [4, 4, 4, 4, 3];
export const BRAIN_GROUP_COLS = [0xe67e22, 0x3498db, 0xe74c3c, 0x9b59b6, 0x2ecc71];

// TOUCH

// Left half: floating stick (double tap crouches). Right half: look-drag.
export const STICK_RADIUS = 55;          // px of travel for full tilt
export const FLICK_RADIUS = 10;
export const TAP_GAP_MS = 300;

// MULTI-TOUCH BUTTONS: a tap during another touch sends no click, so buttons act on their own pointerup.
export const TAP_SLOP = 12;           // px drift still counted as a tap
export const TAP_SWALLOW_MS = 600;    // a click this soon after is the same tap
export const TAP_BUTTONS = '#fly, #car, #gear, #settings button';   // tap buttons (pedals, climb and #use act on press)
// outside-sheet buttons cancel long press at touchstart
export const HOLD_SAFE = '#fly, #car, #use, .pedal, #aim, #draw, #climb button, #gear';

// CAR: kinematic bicycle model, three collision circles, chase camera.

export const CAR_SCALE = 0.75;      // whole car scale vs the original build
export const CAR_LEN = 4.3 * CAR_SCALE;
export const CAR_WID = 1.8 * CAR_SCALE;
export const CAR_TOP = 1.45 * CAR_SCALE;
export const CAR_WHEELBASE = 2.6 * CAR_SCALE;
export const CAR_TRACK = 1.55 * CAR_SCALE;
export const CAR_WHEEL_R = 0.33 * CAR_SCALE;
export const CAR_R = 0.9 * CAR_SCALE;
export const CAR_CIRCLES = [-1.25 * CAR_SCALE, 0, 1.25 * CAR_SCALE];
export const CAR_STEP_UP = 0.25;    // lower solids are driven over
export const CAR_SUBSTEP = 0.25;    // under CAR_R, so a fast car cannot skip a fence
export const CAR_ACCEL_MAX = 4.5;     // m/s^2 traction off the line
export const CAR_POWER = 60;      // W/kg, a = P / v
export const CAR_BRAKE = 9.0;     // m/s^2 brake (~0.9 g)
export const CAR_HANDBRAKE = 6.0;
export const CAR_REV_MAX = 6.0;     // m/s top reverse speed
export const CAR_REV_ACCEL = 3.0;
export const CAR_ROLL = 0.15;    // m/s^2 rolling resistance
export const CAR_ENGINE_BRK = 0.35;    // m/s^2 extra drag off throttle
// CAR MASS AND DRAG: ~700 kg kei car plus the driver (carMassKg); drag 0.5 x air density x CdA / mass.
export const CAR_MASS_KG = 700;      // curb kg (Suzuki Kei 710, Cappuccino 700 to 725)
export const CAR_MAX_HEALTH = 100;      // a new car's health
export const CAR_HEALTH_PER_J = 0.0015;   // placeholder: car health per joule of impact energy past BUMP_SAFE_J
const AIR_DENSITY = 1.225;    // kg/m^3, sea level 15 C
const CAR_CD = 0.35;          // placeholder Cd, small cars ~0.33 to 0.38
const CAR_FRONTAL_FILL = 0.83;   // frontal fill (Jetta and NSX figures ~0.82 to 0.84)
const CAR_CDA = CAR_CD * CAR_FRONTAL_FILL * CAR_WID * CAR_TOP;   // m^2 drag area
export const carDragPerM = massKg => 0.5 * AIR_DENSITY * CAR_CDA / massKg;   // 1/m: drag deceleration over speed squared
export const CAR_GRIP = 8.8;     // m/s^2 lateral (mu ~0.9)
export const CAR_STEER_MAX = 0.6;     // rad at standstill
export const CAR_STEER_FALL = 12;      // m/s where steering lock halves
export const CAR_STEER_RATE = 2.5;     // rad/s wheel turn rate
export const CAR_G = 9.81;
// RAGDOLLS (sim, Ecosystem.stepFalls): with ragdolls on, every knocked-down or dying animal gets a Verlet body, at every
// distance. Its body is where the animal is; it rises where the body lies. Drawn: people near the camera take one of
// HUMAN_RAG_DRAWN texture rows while one is free, else the lying pose; box rigs always draw from their body.
export const HUMAN_RAG_DRAWN = 16;
export const HUMAN_RAG_ROWS = HUMAN_RAG_DRAWN + 1;   // ragdoll texture rows: one per drawn crowd person, the last for the player
export const RAGDOLL_G = CAR_G;              // m/s^2 (CAR_G is the same)
export const RAGDOLL_DAMP = 0.98;            // velocity kept per step
export const RAGDOLL_ITERS = 4;              // constraint passes per step
export const RAGDOLL_FRICTION = 0.4;         // ground speed lost per contact step
export const PLAYER_RAGDOLL_ANCHOR_PER_S = 1.5;   // the player's ragdoll only: share per second of drift from the player's position taken back
export const RAGDOLL_MAX_DV = 4;             // most launch speed, m/s (downDV)
export const RAGDOLL_TOP_SHARE = 1;          // launch share at the top point; rear and front take
export const RAGDOLL_BASE_SHARE = 0.3;       // this share, so the body rolls toward the push
export const FALL_SETTLE_MS = 0.05;          // a body whose every particle moves slower than this, m/s,
export const FALL_SETTLE_S = 0.5;            // for this long, sleeps (no steps) until the car's box reaches it
export const CAR_GLANCE = 0.7;     // |heading . wall normal| under this (~45 deg) deflects
export const CAR_ALIGN = 0.3;     // angle share turned per contact substep
export const CAR_REACH = 3.2 * CAR_SCALE;
export const CAM_DIST = 6.5 * CAR_SCALE;
export const CAM_PIVOT = 1.4 * CAR_SCALE;
export const CAM_PITCH = -0.2;
export const CAM_FOLLOW = 5;       // 1/s yaw catch-up
export const CAM_LOOK_HOLD = 1500;    // ms after the last look before easing back

// Parked beside a cabin's doorway, nose the door's way.
// CAR ENTRY AND EXIT: places beside the car, [right, forward] in metres before CAR_SCALE, tried in order on getting out;
// the first is the driver's door, walked to on getting in. The player walks to it at walking speed (at most walkMaxS),
// then ducks and slides into the seat over slideS (getting out: from the seat to the place found), the head headroomM
// under the roof.
export const CAR_DOOR_SPOTS = [[-1.6, 0], [1.6, 0], [0, 2.9], [0, -2.9]];
export const CAR_TRANSIT = { walkMaxS: 1.5, slideS: 0.5, seat: [-0.3, 0.05], headroomM: 0.1 };
export const CABIN_CAR_GAP = 1.5;       // clear ground from cabin floor edge to the car's rear
export const CABIN_CAR_WALKWAY = 1.2;   // clear ground from doorway edge to the car's side

// WEAPONS: guns by kind (game.fire); their bullets are sim projectiles (Projectiles in 7b-sim).
export const WEAPONS = {
  glock19: {
    magazine: 15,         // rounds per standard magazine
    reserve: 30,          // spare rounds a found gun comes with
    shotS: 0.1,           // least seconds between shots (semi-auto)
    reloadS: 1.5,         // seconds to change magazines, and so the reload animation's length (GUN_RELOAD)
    bulletKg: 0.00804,    // 124 gr 9x19 mm bullet
    diameterM: 0.00901,   // bullet diameter
    muzzleMS: 350,        // approx. 124 gr from a 4 in barrel (~1150 ft/s)
    cd: 0.3,              // placeholder drag coefficient, round nose, subsonic
    flightS: 3            // a bullet still flying after this many seconds is dropped
  }
};
export const BULLET_G = CAR_G;   // m/s^2 bullet drop
// 1/m: drag deceleration over speed squared, 0.5 x air density x Cd x area / mass
export const bulletDragPerM = w => 0.5 * AIR_DENSITY * w.cd * Math.PI * (w.diameterM / 2) ** 2 / w.bulletKg;
export const BULLET_MAX = 64;               // bullets in flight at most; the oldest goes past it
export const BULLET_GROUND_STEP_M = 0.5;    // ground and water sampled this often along a bullet's path
export const BULLET_DOWN_HIT_M = 0.35;      // height a knocked-down or lying body can be hit within
// HIT ZONES (Projectiles.zoneOf): a hit costs this share of the body's full health by where it lands
export const HIT_DAMAGE = { head: 1, body: 1 / 3, limb: 1 / 5 };
// where a standing body's zones lie: limbs under limbBelow (share of body height); people: head over headAbove within
// headR, torso within torsoR (rig units across, by the chest width); animals: head the front headFwd share of the radius.
// A shot at head height past the head misses; a lying body is all body.
export const HIT_ZONES = {
  human: { limbBelow: 0.53, headAbove: 0.864, headR: 1.8, torsoR: 3.75 },   // hip joint, chin ring, head and chest rings (buildHumanGeometry)
  deer: { limbBelow: 0.5, headFwd: 0.5 },     // legs under the 10-unit body (NPC_SIZE.deer)
  coyote: { limbBelow: 0.45, headFwd: 0.5 }   // legs under the 7-unit body (NPC_SIZE.coyote)
};
export const BULLET_AIM_M = 300;            // reach of the crosshair ray that sets where a shot goes
export const TRACER_M = 1.5;                // drawn streak behind a bullet
export const TRACER_COLOR = 0xffe9a0;
// Observer's Weapon chip: this item in hand with this reserve; carried into Survivor, it has the found gun's reserve
export const OBSERVER_WEAPON = { item: 'glock', reserve: Infinity };
// GUN POSE (iAct.w < 0, humanGunPack): the gun arm (-1 right, as HUMAN_PET's) holds low ready, and the Aim button raises
// it straight along the view by the aim share; angles as HUMAN_CROUCH's, radians. gripAt: the grip's height up the rig.
export const GUN_POSE = {
  arm: -1, holdShoulder: -0.4, holdElbow: -0.9, gripAt: 0.44, gripInward: 0.15,
  aimS: 0.2,      // seconds to raise or lower the gun fully
  zoom: 1.6,      // view magnification at full aim
  // two hands at full aim: each arm turns in about its shoulder so its hand's axis lands this far from the centre line,
  // rig units on its own side (the support arm's hand wraps the gun hand)
  twoHand: { gun: 0.3, support: 0.6 }
};
// tucked gun at the small of the back, flat against it: barrel down the waistband, grip pointing to the off-hand side
// (as a gun-hand reach behind the back meets it). Grip centre in rig units from the waist ring's centre: `side` toward
// the gun hand, `up`, and `back` behind; side and back scale with waist width.
export const GUN_WAIST = { side: 0.3, up: 0.5, back: 2.35 };
// DRAW AND HOLSTER over drawS: the gun arm swings from its pose to `reach` (behind the back, at the gun) and takes the gun
// at grabAt of the way, then brings it to low ready (holstering runs it backward). reach: shoulder and elbow angles (the
// elbow bends the arm's other way, which with the turn is the shoulder rolling in), the arm raised out from the side
// (abduct) and its turn about the shoulder's vertical, both times the arm's side: the elbow goes out and back, and the
// forearm crosses behind the back. Solved so the hand meets the grip and no part of the arm passes through the torso on
// the way from hanging or from low ready. Getting in the car holsters first.
export const GUN_DRAW = { drawS: 0.7, grabAt: 0.45, reach: { shoulder: -0.5, elbow: 1.8, abduct: 0.35, turn: -1.65 } };
// RELOAD over WEAPONS' reloadS, keyed by t, its share (eased between keys, smoothstep; the shader draws the same keys,
// gunReloadPose in 8a). Angles as HUMAN_CROUCH's, radians; `inward` turns an arm about its shoulder's vertical toward the
// centre line. The gun arm brings the gun up and in, muzzle raised, then back to low ready (its ends are GUN_POSE's
// hold). The support arm, by its weight (0: its own swing, 1: the key), drops to the belt for a fresh magazine, brings
// it under the grip, seats it and lets go; its keys are solved so the hand meets the belt, then the magazine well
// (GUN_MAG) with the magazine's top at the well, then the well. Aiming waits for the reload.
export const GUN_RELOAD = {
  gun: [   // [t, shoulder, elbow, inward]
    [0, GUN_POSE.holdShoulder, GUN_POSE.holdElbow, 0],
    [0.15, -0.175, -1.8, 0.48],   // gun at mid chest, close in, muzzle ~23 degrees up
    [0.85, -0.175, -1.8, 0.48],
    [1, GUN_POSE.holdShoulder, GUN_POSE.holdElbow, 0]
  ],
  support: [   // [t, shoulder, elbow, inward, weight]; weight 0 at both ends
    [0, 0.5, -1.6, 0.75, 0],
    [0.25, 0.5, -1.6, 0.75, 1],    // at the belt, front of the off-hand hip
    [0.35, 0.5, -1.6, 0.75, 1],    // the grab
    [0.55, -0.3, -1.2, 0.75, 1],   // the magazine under the grip, its top at the well
    [0.7, -0.3, -1.5, 0.75, 1],    // seated
    [0.8, -0.3, -1.5, 0.75, 1],
    [1, -0.3, -1.5, 0.75, 0]
  ],
  magAt: [0.35, 0.7],   // the fresh magazine shows in the support hand from the grab to the seat
  // 1st person: the view model's offset in camera space, metres, and its muzzle-up pitch and cant (roll), radians
  view: [   // [t, x, y, z, pitch, roll]
    [0, 0, 0, 0, 0, 0],
    [0.15, -0.07, 0.05, 0.05, 0.45, 0.55],
    [0.85, -0.07, 0.05, 0.05, 0.45, 0.55],
    [1, 0, 0, 0, 0, 0]
  ],
  viewMagFromM: 0.3   // 1st person: how far below the well (along the grip) the fresh magazine rises from
};
// 1st person: the gun's grip in camera space (metres; -z ahead), low ready to aimed (the sights' tops on the eye line,
// so they sit on the crosshair), and its muzzle-up tilt at low ready, radians (negative: muzzle down)
export const GUN_VIEW = { hold: [0.17, -0.17, -0.38], aim: [0, -0.084, -0.32], holdPitch: -0.12, drawFrom: [0.25, -0.5, -0.3] };   // drawFrom: where a drawn gun rises from
// RECOIL per shot: the view climbs `kick` radians and settles back over recoverS (exponential); the 1st-person gun also
// moves back backM at the kick
export const GUN_RECOIL = { kick: 0.06, recoverS: 0.12, backM: 0.03 };
// GLOCK MODEL, metres, origin at the grip's centre, barrel along +z: [width, height, length, x, y, z, rake]
export const GUN_MODEL = {
  color: 0x1c1d1f,
  parts: [
    [0.028, 0.095, 0.045, 0, 0, 0, 0.35],          // grip, raked back
    [0.026, 0.032, 0.187, 0, 0.062, 0.053, 0],     // slide (Glock 19: 187 mm long)
    [0.024, 0.018, 0.12, 0, 0.037, 0.07, 0],       // frame under the slide
    [0.008, 0.022, 0.04, 0, 0.012, 0.045, 0],      // trigger guard
    // IRON SIGHTS on the slide's top (y 0.078): a front post and a rear notch of two blocks
    [0.0035, 0.006, 0.004, 0, 0.081, 0.138, 0],    // front sight post
    [0.005, 0.006, 0.005, 0.0042, 0.081, -0.032, 0],   // rear sight, left of the notch
    [0.005, 0.006, 0.005, -0.0042, 0.081, -0.032, 0]   // rear sight, right of the notch
  ]
};
// THE FRESH MAGAZINE of a reload (GUN_RELOAD): a box [width, length, depth], metres, in GUN_MODEL's colour; it seats
// up the grip (GUN_MODEL.parts[0], along its rake) from the grip's base, the magazine well.
export const GUN_MAG = { size: [0.022, 0.1, 0.03] };
export const AIM_BUTTON_GAP_PX = 12;   // the Aim button's gap left of the attack button
// THE ATTACK BUTTON'S GUN FACE (gunFace in 8b): ICONS.fire, and over a magazine change a ring fills round it from the
// top, clockwise, while it fades in from loadingAlpha to whole; the magazine's rounds show above it.
export const GUN_BUTTON_FACE = {
  ringPx: 32, ringStrokePx: 2.5, ringColor: '#e8e4dc',   // ring diameter and line width, px (under the label)
  ringSteps: 60,        // ring redraws per reload at most
  loadingAlpha: 0.3,    // fire icon opacity as a reload starts
  ammoFontPx: 9, ammoTopPx: 1    // the rounds label's size and its gap from the button's top, px
};

// SETTINGS

// Presets replace the game's clock and weather ('Game', the first chip).
export const TIMES = ['Game', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Sunset', 'Night'];
// The game clock's hour at every world start, New ecosystem included (12 = midday); the weather is random each start.
export const GAME_START_HOUR = 12;
export const FALLBACK_HOURS = {
  Dawn: 6, Morning: 9, Noon: 12, Afternoon: 15, Sunset: 18.5, Night: 0
};

// cloud drives sky and sun; kind picks the fog branch
export const SKIES = {
  Game: null,
  Clear: { label: 'Clear', kind: 'clear', cloud: 0 },
  Cloudy: { label: 'Partly cloudy', kind: 'cloudy', cloud: 45 },
  Overcast: { label: 'Overcast', kind: 'cloudy', cloud: 100 },
  Fog: { label: 'Fog', kind: 'fog', cloud: 100 },
  Rain: { label: 'Rain', kind: 'rain', cloud: 90 },
  Snow: { label: 'Snow', kind: 'snow', cloud: 85 },
  Storm: { label: 'Thunderstorm', kind: 'storm', cloud: 100 }
};
export const DEBUG_PROBE_LAYER = 7;                       // probe camera sees only people and scene lights
export const DEBUG_PROBE_PX = 64;

// SWIMMING: water deeper than the eye floats the player; looking down dives.
export const SWIM_DEPTH = EYE_HEIGHT + 0.2;   // water depth past which the player swims
export const SWIM_FLOAT = 0.22;               // eye above the surface floating
export const SWIM_SPEED = 0.45;
export const SWIM_JUMP = 0.5;
export const SWIM_DRAG = 4;                  // 1/s, vertical

// NPC ticks: at most one per NPC_TICK_S of real time.
export const NPC_DRINK_SECONDS = 10;   // seconds in water to fill an empty water bar
export const NPC_TICK_SLACK = 0.004;   // rAF jitter allowance so 60 Hz never skips a tick

// Sun altitude (deg), sky and fog colour, sun colour, sun intensity.
export const SKY = [
  [-12, 0x05070f, 0x2a3a5c, 0.00],
  [-6, 0x101a2e, 0x46587c, 0.00],
  [-2, 0x34405e, 0xc27a52, 0.06],
  [0, 0x6e6b74, 0xff8c46, 0.35],
  [4, 0x98979f, 0xffb271, 0.85],
  [12, 0x9fb0c4, 0xffe0bb, 1.35],
  [30, 0x9fb4c8, 0xfff2dd, 1.60]
];

// SUN AND MOON: camera-facing quads along true directions, ~3x real size.
export const SKY_DIST = 1500;   // inside HIGH_CAMERA_FAR, past the loaded area
export const SKY_FAR_FRACTION = 0.9;   // discs at this share of LOW_CAMERA_FAR
export const SKY_BODY_DEG = 1.6;
export const SKY_TEX = 128;

// SKY FADE: cloud and fog ease over SKY_FADE_S on a weather change.
export const SKY_FADE_S = 5;
export const RAIN_SPAN = 44;           // rain box width and depth, metres
export const RAIN_HEIGHT = 26;
export const RAIN_FPS_IDLE = 30;
export const RAIN_FADE_S = 5;          // rain fade seconds
export const RAIN_TIME_WRAP = 600;     // keeps shader float time small
export const ROOF_MAP_N = 128;
export const ROOF_MAP_SIZE = 56;       // metres a side; rain box plus snap slack
export const ROOF_MAP_SNAP = 4;

export const RAIN_BY_CODE = {
  51: 0.25, 53: 0.4, 55: 0.55, 56: 0.3, 57: 0.5,
  61: 0.4, 63: 0.65, 65: 1, 66: 0.45, 67: 0.8,
  80: 0.45, 81: 0.7, 82: 1, 95: 0.85, 96: 0.9, 99: 1
};

// Suggested places: [button text, CITY_FILES key].
export const PICKS = [
  ['New York', 'New York, NY'],
  ['Union Square', 'Union Square, San Francisco, CA'],
  ['The Loop', 'Millennium Park, Chicago, IL'],
  ['Ohio University', '1 Park Place, Athens, OH']
];

// SOUND (8c-audio.js): playback only. Game code reports events through core's `sound` port; nothing here may change what
// any creature does, its update rate or its precision. Fitted model data lives in 1b-sound-models.js (tools/sound).
export const SOUND = {
  onAtLoad: false,                 // the Sound switch (start card) and chip (settings) start off
  volume: 0.8,                     // master gain, before the compressor
  compressor: { thresholdDb: -12, kneeDb: 6, ratio: 4, attackS: 0.003, releaseS: 0.25 },
  noiseS: 2,                       // length of the one shared looping white-noise buffer every model reads
  curveMinStepMs: 1,               // fitted envelopes are resampled once, for setValueCurveAtTime, at each model's smallest
                                   // breakpoint gap but no finer than this
  voices: { high: 16, low: 8 },    // most sounds playing at once, per Graphics quality; the quietest is stolen
  panning: { high: 'HRTF', low: 'equalpower' },   // PannerNode panningModel per Graphics quality
  distance: { model: 'inverse', refM: 1, rolloff: 1, maxM: 1000 },   // PannerNode distance law (the voice manager uses the same); a sound may set its own refM
  cullGain: 0.03,                  // an emission quieter than this at the listener is not played
  stealFadeS: 0.01,                // a stolen voice fades out over this
  randomSeed: 1,                   // audio's own generator (noise, read points), so it never draws from the sim's Math.random
  // FOOTSTEPS: every walking body (people, animals, the player) on the one fitted step for now; heavier is louder
  footstep: { model: 'footstepWalk', massRangeKg: [10, 150], gainAtMinMass: 0.5, gainAtMaxMass: 1.0, outputGain: 1.35, releaseS: 0.03 },
  // GUNSHOT: the fitted Glock 19c shot, at the muzzle
  // GUNSHOTS carry far: full loudness within refM, then falling as refM / distance (SOUND.distance's law), so with
  // cullGain they are heard out to about refM / cullGain, ~330 m (every other sound uses SOUND.distance.refM, ~33 m)
  gun: { model: 'gunshot', outputGain: 1.0, releaseS: 0.05, refM: 10 },
  // CAR: start on boarding, then the engine loop (idle, revving with speed), shutdown on getting out
  car: {
    startModel: 'carStart', idleModel: 'carIdle', shutdownModel: 'carShutdown',
    outputGain: 0.8,               // start, engine loop and shutdown
    speedRangeMps: [0, 35],        // |speed| over this range takes the firing rate from idle to the model's revMaxRatio
    speedSmoothS: 0.2,             // time constant of the firing rate and loudness following speed
    startToIdleFadeS: 0.3,         // the start fades out while the engine loop fades in over this
    idleToShutdownFadeS: 0.12,     // the engine loop fades out over this as the shutdown starts
    lateIdleFadeS: 0.3,            // engine loop fade-in when sound comes on mid-drive (no start sound to follow)
    releaseS: 0.05,                // start and shutdown models ramp to silence over this after their last breakpoint
    lostAfterS: 0.5                // no engine report for this long (a world reload, a reset): the loop stops
  }
};
