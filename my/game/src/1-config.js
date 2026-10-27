// 1-config.js: CONFIG. Every tunable table and derived constant: world size and city ladder, player and building
// dimensions, Overpass/Nominatim/terrain endpoints and limits, OSM layer tables, graphics numbers, the NPC tables
// (species, sizes, fight moves, pounces, ages), human rig and atlas numbers, food boxes, streets and lamps, coast,
// cabins, cat, car and camera, Survivor (SURVIVOR_CONFIG with playerPlantFood), sky, rain, CITY_FILES and PICKS.
// Owns: the values only; the three loops that fill PLACE_OF, PLACE_RE and NPC_TYPE_IDS derive tables from tables.
// May import: nothing. Pure data; constants that construct three objects stay with their owners.
// Config blocks, in order: world size, player, buildings, network, terrain, layers, places, loading steps, graphics,
// shadows, city files, trees, signs, shells, NPC, human rig, billboards, plants, food boxes, streets, spawn, world,
// coast, cabins, cat, camera, groves, mix, intro, blob shadows, Survivor, health bars, brain view, touch, car,
// sky presets, debug probe, swim, NPC tick, sky, rain, picks.

// World size: `scale` sets wilderness extent and populations; the city's half-extent is CITY_LADDER, tried in order.
// Map size levels 1..10 -> world scale (1 = 20, +10 per level); small, medium and large are levels 4, 5 and 6.
export const MAP_SIZE_SCALES = Array.from({ length: 10 }, (_, i) => 20 + 10 * i);
export const WORLD_SIZES = {
  small: { mapSize: 4, people: 1000 },
  medium: { mapSize: 5, people: 3000 },
  large: { mapSize: 6, people: 4000 }
};
export const CITY_LADDER = [500, 350, 200];
export const DEFAULT_LEVELS = 3;
export const METERS_PER_LVL = 3.2;
export const HEAD_CLEAR = 0.15;   // metres from the eye to the top of the head
export const PLAYER_HEIGHT = 1.753;   // metres (5'9"), feet to crown
export const EYE_HEIGHT = PLAYER_HEIGHT - HEAD_CLEAR;
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 10.0;
export const RUN_SPEED = 15.0;
export const JUMP_SPEED = 7.0;
export const CROUCH_SPEED = 4.0;
// On foot (GTA-style): the stick moves relative to the view, the body turns to face the move, the view drifts back behind.
export const FOOT_TURN_RATE = 10;    // rad/s the body turns toward the direction it is moving
export const FOOT_CAM_FOLLOW = 1;    // 1/s the view drifts behind the body while moving, CAM_LOOK_HOLD after the last look
export const LOOK_PITCH_MAX = Math.PI / 2 - 0.01;   // look up/down limit for mouse, touch and the walking camera
export const FLY_SPEED = 2 * WALK_SPEED;   // horizontal and vertical
export const CROUCH_RATE = 3.0;     // metres per second the eye moves into/out of a crouch (CROUCH_DROP: the body's crouch pose)
export const GRAVITY = 22.0;
export const GRID_CELL = 24;      // collision broadphase cell size, meters
export const LAND_EPS = 0.01;    // slack so a snapped-to roof still reads as clear
export const SUBSTEP = 0.25;    // max move per collision pass; under PLAYER_RADIUS so thin walls are not skipped

// Enterable buildings: thick-walled hollow shells with a doorway and floor/ceiling/roof caps.
export const WALL_T = 0.3;     // exterior wall thickness, meters, measured inward
export const WALL_T_MIN = 0.06;    // thinnest a wall is retried at when mitres fold
export const MITER_MAX = 4;
export const DOOR_W = 1.2;
export const DOOR_MIN_W = 0.9;     // comfortably wider than 2 * PLAYER_RADIUS
export const DOOR_H = 2.2;
export const PIER = 0.35;
export const PIER_MIN = 0.12;
export const FRAME_W = 0.09;
export const FLOOR_Y = 0.055;
export const CEIL_GAP = 0.02;
export const ENTRANCE_REACH = 1.2;
export const ROAD_NEAR = 35;
export const ROAD_FAR = 300;
export const ROAD_CELL = 32;
export const FEATURES_VERSION = 5;     // bump when featuresFrom changes shape; drops stale caches
export const OVERPASS_TIMEOUT_MS = 50000;
export const OVERPASS_QUERY_TIMEOUT = 45;   // seconds, server side
export const OVERPASS_HEDGE_MS = 15000;     // a mirror this slow gets company: the next mirror is asked too
export const OVERPASS_MAX_PARALLEL = 2;
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Elevation: AWS Terrain Tiles (Terrarium), h = R*256 + G + B/256 - 32768 m. Credit: Mapzen, AWS Open Data, USGS 3DEP.
export const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const TERRAIN_MAX_Z = 15;      // deepest level served (~3.7 m/px at 40 N)
export const TERRAIN_MIN_Z = 12;
export const TERRAIN_TILE_PX = 256;
export const TERRAIN_MAX_TILES = 16;
export const TERRAIN_TIMEOUT_MS = 10000;
export const TERRAIN_SPIKE_M = 30;      // a pixel this far off its neighbours' median is corrupt
export const TERRAIN_SPIKE_FRAC = 0.005;
export const ELEV_STEP = 5;       // metres between height samples and terrain mesh vertices
export const ELEV_MARGIN = 100;
export const STEP_UP = 0.45;    // highest ledge walked onto without a jump (player and NPCs)
export const GROUND_SNAP = 0.5;

// Flat layers sit centimetres apart, so each gets a depth bias; higher wins, the ground plane is 0.
export const LAYER_BIAS = { area: 2, water: 3, road: 4, mark: 4.5, path: 5 };


// LAYER TABLES

// Fixed y stacking order for flat layers instead of depth fighting.
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

// leisure / landuse / natural values worth painting on the ground
export const AREA_COLOR = {
  water: 0x3d6b85, wetland: 0x4f6b58, basin: 0x3d6b85, reservoir: 0x3d6b85,
  park: 0x53753f, garden: 0x5c8046, grass: 0x5c8046, village_green: 0x5c8046,
  recreation_ground: 0x578040, pitch: 0x4f7f45, playground: 0x8a7a55, golf_course: 0x578040,
  forest: 0x3c5a33, wood: 0x3c5a33, meadow: 0x6d8a4c, farmland: 0x8f8a5e,
  cemetery: 0x5d6a54, allotments: 0x6a7847, scrub: 0x5b6b45, sand: 0xc4b48c,
  orchard: 0x5f7f45, greenfield: 0x6d8a4c
};

// Green land cover takes the wild grass palette, fading to it fully at the city square's edge so the grounds meet.
export const MIX_GREEN_PULL = 0.8;
export const MIX_EDGE_FADE = 0.25;   // outer fraction of the square over which the pull rises to 1
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

// fallbacks when a building carries a material but no colour
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

// Ask Overpass only for the land cover and barrier values we paint.
export const LANDUSE_RE = 'grass|forest|meadow|farmland|cemetery|allotments|orchard|greenfield'
  + '|village_green|recreation_ground|basin|reservoir';
export const LEISURE_RE = 'park|garden|pitch|playground|golf_course|recreation_ground';
export const BARRIER_RE = Object.keys(BARRIER).join('|');

// Places by purpose: the OSM tag values for each kind; first hit (healthcare, amenity, shop) wins.
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
// A city load: the city, then the wilderness grown around it.
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


// LOW-POWER (Graphics: low): lower pixel ratio, fps cap, no MSAA, shorter view, nearer LODs, fewer updates; saved choice.
export const LOW_PIXEL_RATIO = 1.5;
export const LOW_RENDER_FPS = 60;
export const HIGH_FOG_FAR = 900, LOW_FOG_FAR = 500;        // metres; fog near stays at FOG_NEAR
export const FOG_NEAR = 120;
export const HIGH_CAMERA_FAR = 2000, LOW_CAMERA_FAR = 600;  // past the fog's far edge, so nothing pops at the clip
export const LOW_NPC_LOD_DIST = 35;     // metres (high: HIGH_NPC_LOD_DIST)
export const LOW_FAR_STAT_DIST = 60;    // metres (high: HIGH_FAR_STAT_DIST)
export const HIGH_LABEL_TICKS = 2, LOW_LABEL_TICKS = 4;    // NPC ticks between stat-label target picks
export const HIGH_HUD_TICKS = 60, LOW_HUD_TICKS = 120;     // NPC ticks between HUD text refreshes
export const LOW_WATER_FPS = 15;        // water-flow texture offsets advance at most this often on low (every draw on high)
export const MSAA_SAMPLES_WANTED = 8;   // high graphics' MSAA, capped at what the GPU supports (MSAA_SAMPLES)
export const GRAPHICS_KEY = 'graphics';  // localStorage: 'high' | 'low', the last Graphics choice

export const HEMI_DAY = 1.5;
export const HEMI_NIGHT = 0.8;
export const MOON_MAX = 0.9;
// Shadow box: SHADOW_BOX_HALF either side of a centre SHADOW_AHEAD in front of the player, so shadows reach down the view.
export const SHADOW_BOX_HALF = 120;   // with SHADOW_AHEAD: ~190 m ahead, ~6 cm per texel at 4096
export const SHADOW_AHEAD = 70;
// shadows fade out over this fraction of the map at each edge, so the box edge never shows as a line
export const SHADOW_EDGE_FADE = 0.15;
export const SHADOW_MAP_MAX = 4096;          // texels a side (less where the GPU's texture limit is lower)
export const SHADOW_DEPTH = 800;             // metres the light's box reaches along the light
export const SHADOW_BIAS_M = 0.25;           // depth bias in metres, whatever SHADOW_DEPTH is
// city buildings are cut into square cells this wide, so the box's cull skips the cells outside it
export const BUILDING_CHUNK_M = 150;
// the big ground meshes are sorted into square cells this wide, so each frame draws only the cells in view
export const GROUND_CELL_M = 150;
// height meshes hold fewer triangles a cell, so theirs are wider: fewer draws for nearly the same cull
export const TERRAIN_CELL_M = 300;
export const SHADOW_SOFTNESS = 2.5;   // filter radius in texels: smooths the stair-steps along shadow edges
export const MOON_BLEND_DEG = 5;

// HOSTED CITY FILES: each suggested place's saved Overpass answer (CITY_FILE_RADIUS), served here, no public servers asked.
export const CITY_FILE_DIR = 'maps/';    // folder of the files, relative to this page ('' = beside it); end it with '/'
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

// TREES: trunk radii in metres; each trunk is a pole solid (like a lamp post), so it blocks movement and NPC sight.
export const TREE_TRUNK_TOP_R = 0.14;
export const TREE_TRUNK_BASE_R = 0.2;
export const TREE_TRUNK_SOLID_R = TREE_TRUNK_BASE_R * 0.9;   // half side of the trunk's square solid
export const SIGN_FONT = '"Iowan Old Style", Palatino, Georgia, serif';

// SHELL RASTER: shellAt in one typed-array read; only SHELL_AMBIG cells (edges, overlaps) take the exact test.
export const SHELL_CELL = 0.5;    // metres; finer cells shrink the AMBIG band around walls that falls back to shellAtExact
export const SHELL_MAX_CELLS = 4_000_000;  // ~8 MB at Int16, the cap that coarsening keeps under
export const SHELL_OUT = -1;
export const SHELL_AMBIG = -2;
export const SHELL_EPS = 1e-4;       // cells are grown by this for the edge test, so it errs to AMBIG

// NPCS: the AIEcosystemArena engine (changes marked "City:"); people use the two-lobe brain, deer and coyotes thinkDeer.

// One NPC tick is NPC_TICK_S (16 ms) of sim time; per-tick constants and Ecosystem.time use it; at most one tick per frame.
export const NPC_TICK_S = 0.016;
// With a city, the starting people split city : wilderness as NPC_CITY_PEOPLE_WEIGHT : NPC_WILD_PEOPLE_WEIGHT.
export const NPC_CITY_PEOPLE_WEIGHT = 3000;
export const NPC_WILD_PEOPLE_WEIGHT = 900;
export const NPC_DEER_POPULATION = 125;   // city deer
export const NPC_PLANT_POPULATION = NPC_DEER_POPULATION * 10; // the Arena's 300:5 plant-to-human ratio
// Share of water that comes with food for an eater keeping up with hunger (~30% for people).
export const DIET_WATER_SHARE = 0.3;
export const PLANT_REGROW_P = 0.03;
export const PLANT_SPOT_TRIES = 30;
export const PLANT_SIGHT_CELL = 15;      // metres: plant cell for vision queries (Ecosystem.plantSight)
export const NPC_CONTACT_CELL = 1.5;     // metres: ContactGrid cell, about two contact radii, so a query reads 1 to 4 cells
// DEER AI (ported from species.py, Animal.search / think / move)
export const DEER_CRUISE = 0.3;      // species.py: speed share when not fleeing
// Deer decide once per DEER_THINK_TICKS (a third of a second) and keep that decision in between.
export const DEER_THINK_TICKS = 20;
// A deer within DEER_SPRINT_DIST of a predator sprints (speed and energy below); farther off it flees at normal speed.
export const DEER_SPRINT_DIST = 10;     // metres
export const DEER_SPRINT_OVER = 1;
export const DEER_SPRINT_ENERGY = 2;
// NPC steps longer than this are split so a sprinting deer cannot pass a wall.
export const NPC_SUBSTEP = 0.1;           // metres
// GAIT: leg cadence follows body speed, capped at GAIT_MAX_HZ; a sprinting deer gallops.
export const GAIT_MAX_HZ = 4;
export const GAIT_GALLOP_SWING = 0.9;     // radians of leg swing while a deer sprints
export const GAIT_CADENCE_SCALE = 0.6;    // slows every leg cycle (cap included); 1 = feet match ground speed
export const DEER_EXPLORE_P = 0.0001;   // species.py: chance per tick of a new random explore point
export const NPC_ATTACK_COOLDOWN_S = 0.5;     // sim seconds between one hunter's attacks
export const NPC_ATTACK_DAMAGE_PER_S = 0.2;   // share of the victim's starting health lost per second of attacks (~5 s to kill)
export const NPC_BITE_COOLDOWN_S = 0.5;       // sim seconds between one grazer's plant bites
export const NPC_HIT_NO_EAT_S = 2;
export const PLANT_MAX_HEALTH = 10;           // a plant's bites when whole
export const PLANT_BITE_NUTRITION = 5;        // a plant bite's nutrition per point of the plant's max health            // sim seconds an animal cannot eat (plants or food boxes) after being hit
// FIGHTS (two animals that hunt each other): each side's hit scales with its height x mass x health.
export const NPC_FIGHT_DAMAGE_PER_S = 24;     // health per second dealt by a reference fighter (below): 0.2 of a human's 120
export const NPC_FIGHT_REF_STRENGTH = 1.753 * (24 * 1.753 * 1.753) * 120;   // average adult man: 1.753 m, ~73.8 kg, 120 health
// FIGHT MOVES: each species' move when it fights (moveS sim seconds; key t is a share of moveS). Strikers (people,
// coyotes) play theirs on landing a hit and hold their ground while hits keep coming; a species that `flees` plays
// its move on being hit (no damage dealt), then runs from the attacker, and moves again only after fleeS.
// Box-rig keys, rig units and radians: rise and lunge move the body (lunge forward), pitch tips it (+ nose down),
// head tips the head (+ nose down), front and back swing the legs from straight down (+ feet back).
// anchor: the leg joint a box rig tips about, so those legs stay planted (null: about the body centre).
export const NPC_FIGHT_HOLD_PAD_S = 0.1;   // a striker's hold outlasts its next possible hit by this, so a running fight never lets go
export const NPC_FIGHT_MOVES = {
  // punch: alternating fists from a raised guard; arm angles in radians as HUMAN_CROUCH's (shoulder - forward, elbow - bent)
  human: { moveS: 0.4, peak: 0.35, guardEaseS: 0.12, guardShoulder: -0.4, guardElbow: -2.35, punchShoulder: -1.55, punchElbow: -0.05, punchLean: 0.18 },
  // lunge and pounce: coil, leap forward, bite, back to its spot
  coyote: {
    moveS: 0.8, anchor: null, keys: [
      { t: 0, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 },
      { t: 0.22, rise: -0.8, lunge: -1, pitch: 0, head: 0.25, front: 0.25, back: -0.35 },
      { t: 0.45, rise: 4.5, lunge: 7, pitch: -0.2, head: -0.15, front: -1.0, back: 0.9 },
      { t: 0.62, rise: 0.3, lunge: 5, pitch: 0.18, head: 0.5, front: -0.25, back: 0.35 },
      { t: 1, rise: 0, lunge: 0, pitch: 0, head: 0, front: 0, back: 0 }
    ]
  },
  // buck: head down, rump up and both hind legs kicked back at the attacker, then a sprint away
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

// NIGHT HUNTS: with the sun below NIGHT_SUN_ALT_DEG (civil twilight) a species hunts its SPECIES nightPrey (the
// player included, out of shelter): it chases its PREY CHOICE in sight, re-aiming every tick, and pounces in reach.
// A `pack` species that sees a packmate hunting joins the nearest one's attack unless its own pick ranks ahead
// (PREY CHOICE), so one hunter draws in the packmates that can see it (and those that see them).
export const NIGHT_SUN_ALT_DEG = -6;
// PREY CHOICE (hunters that use searchDeer: coyotes): of everything in sight the hunter would attack now (its food
// species, and at night its nightPrey, the player included), it takes the smallest first, by body mass counted in
// whole PREY_SIZE_STEP_KG steps (Animal.preySize), and of equal sizes the nearest. Night prey it picks is hunted;
// food it picks is chased when hunger is its top need.
export const PREY_SIZE_STEP_KG = 1;
// POUNCES: a hunter's leap at its quarry, moveS sim seconds: it crouches until share leapAt, then flies along the
// heading it launched on at leapOver times its sprint speed, landing short of the quarry (pounceStep). It launches
// when the quarry is within the leap's own length, at most once per moveS + cooldownS. keys: as NPC_FIGHT_MOVES'.
export const COYOTE_LEAP_AT = 0.25;
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
// a pounce lands this share of the contact distance (Ecosystem.CONTACT_DIST) short of its quarry, so the landing bites
export const POUNCE_LAND_SHORT = 0.5;

// A box rig's move pose at share u (0..1) of its keys into `out`, eased between keys.
export const FIGHT_KEY_FIELDS = ['rise', 'lunge', 'pitch', 'head', 'front', 'back'];
export const NPC_AGE_DEPLETION_RATE = 0;  // health lost per sim second of age, per point of starting health (was 0.000001); 0 = off
export const DEER_REPRO_SHARE = 0.4;      // species.py: reproduction increment as a share of food's (0.0005 / 0.00125)
export const MATE_TIME_MULT = 4;
export const REPRO_NEED_MAX = 100;       // ceiling for a brained animal's reproduction need, which doubles every tick         // default for every species: this many times longer to fill the mate bar
export const NPC_DAY_TICKS = 24 * 60;            // ticks per sim day (the HUD's day counter)
export const NPC_MATURITY_TICKS = 3 * NPC_DAY_TICKS;   // ticks from birth to full size (72 s at 60 Hz); no mating before
export const GROWTH_MIN_SCALE = 0.25;   // body scale at birth; drawn size and bodyHeightM grow from it to 1 over NPC_MATURITY_TICKS
export const NPC_ADULT_AGE = 18;                 // years shown at maturity
export const NPC_TICKS_PER_YEAR = 365 * NPC_DAY_TICKS;
export const NPC_START_AGE = [18, 40];           // years: random age range of the initial (spawned) people
export const HUMAN_TURN_RATE = 3;      // radians per second people turn toward their brain's heading
export const DEER_GREEN_SHARE = 0.8;
export const DEER_AREAS = new Set([
  'park', 'garden', 'grass', 'village_green', 'recreation_ground', 'golf_course',
  'forest', 'wood', 'meadow', 'farmland', 'cemetery', 'scrub', 'orchard', 'greenfield', 'wetland'
]);
// Feet to rig top in Arena units, for the stats sprite (deer use antler tips for both sexes).
export const NPC_RIG_TOP = { human: 38.55, deer: 35, coyote: 23 };

export const NPC_UNIT = 0.045;    // metres per Arena unit: 38.5 units -> ~1.73 m, 35 u/s -> ~1.5 m/s
export const NPC_RADIUS = 0.3;      // collision circle; under PLAYER_RADIUS so every doorway fits
export const NPC_COLLIDE_H = 1.35;     // collision column height; under the lowest lintel (player height + 0.25 m) so no door refuses them
export const NPC_SPAWN_GAP = 8;        // metres between spawn points before crowding forces it lower
// heightScale of a person the player's height; the player's rig, cabins, cat and camera are sized by it.
export const PLAYER_HS = PLAYER_HEIGHT / (NPC_RIG_TOP.human * NPC_UNIT);
// ADULT SIZE: a normal distribution per species and sex, [mean, std] in metres of one measure: standing height
// for people (US adults), shoulder height for deer (white-tailed) and coyotes. rig: that measure in rig units at heightScale 1.
export const NPC_SIZE = {
  human: { rig: NPC_RIG_TOP.human, male: [1.753, 0.0762], female: [1.613, 0.0711] },
  deer: { rig: 20, male: [0.97, 0.05], female: [0.86, 0.045] },     // body centre 15 + half the 10-unit body
  coyote: { rig: 15, male: [0.61, 0.03], female: [0.58, 0.03] }     // body centre 11.5 + half the 7-unit body
};
export const NPC_SIZE_Z_MAX = 4;          // standard deviations; draws are cut here
export const NPC_SIZE_HERITABILITY = 0.8;   // weight of the mid-parent z-score in a child's; the rest is fresh noise
export const NPC_SHOWN_BMI = { male: 24, female: 22 };   // stats readout weight
// Adult mass (kg) at the mean NPC_SIZE height; other heights scale it by (height / mean)^3. People use NPC_SHOWN_BMI.
export const NPC_REF_MASS_KG = {
  deer: { male: 70, female: 50 },      // white-tailed deer
  coyote: { male: 15, female: 13 }
};

// SPECIES: per-type stats in Arena units (brain, hunts, food, grazes, lift, eye, childDrop); see Ecosystem.fightHit for pairs.
export const SPECIES = {
  human: { brain: true, hunts: { deer: true, coyote: true }, food: null, grazes: true, speed: 35, health: 120, fovH: [0.90, 1.30], fovV: [0.25, 0.45], eye: 12, lift: 21.25, grace: 1, childDrop: 20 },
  coyote: { brain: false, hunts: { deer: true, human: true }, nightPrey: { human: true }, pack: true, food: 'deer', grazes: false, speed: 25, health: 100, fovH: [2.10, 2.80], fovV: [0.20, 0.40], eye: 6.5, lift: 11.5, grace: 1, childDrop: 10 },
  deer: { brain: false, hunts: {}, food: 'plant', grazes: true, speed: 25, health: 100, fovH: [2.10, 2.80], fovV: [0.20, 0.40], eye: 10, lift: 15, grace: 1, childDrop: 10 }
};
export const NPC_TYPES = Object.keys(SPECIES);
// Species as small ids (index in NPC_TYPES) for per-tick checks; the masks are bit sets of those ids.
export const NPC_TYPE_IDS = {};
NPC_TYPES.forEach((t, i) => { NPC_TYPE_IDS[t] = i; });
export const NPC_TYPE_COUNT = NPC_TYPES.length;
export const HUMAN_TYPE_ID = NPC_TYPE_IDS.human;
export const HUNTS_MASK = NPC_TYPES.map(h => NPC_TYPES.reduce((m, t, i) => SPECIES[h].hunts[t] === true ? m | (1 << i) : m, 0));
export const HUNTED_BY_MASK = NPC_TYPES.map(t => NPC_TYPES.reduce((m, h, i) => SPECIES[h].hunts[t] === true ? m | (1 << i) : m, 0));
// what each species chases at night (NIGHT HUNTS); a species it would flee by day is quarry then instead
export const NIGHT_PREY_MASK = NPC_TYPES.map(h => NPC_TYPES.reduce((m, t, i) => SPECIES[h].nightPrey?.[t] === true ? m | (1 << i) : m, 0));
// ids of each species' hunts keys, in key order (what `for (t in spec.hunts)` visits)
export const HUNTS_LIST = NPC_TYPES.map(h => Object.keys(SPECIES[h].hunts).filter(t => t in NPC_TYPE_IDS).map(t => NPC_TYPE_IDS[t]));
export const FOOD_TYPE_ID = NPC_TYPES.map(t => NPC_TYPE_IDS[SPECIES[t].food] ?? -1);   // -1: plants or nothing
export const WATER_SIGHT_CELL = 20;
export const HIGH_NPC_LOD_DIST = 60;      // metres past which a body is drawn as a billboard on high (live: perf.npcLodDist)
export const HIGH_FAR_STAT_DIST = 120;    // metres past which far stats are not drawn (Graphics: high; live: perf.farStatDist)
export const NPC_BODY_R = 1.2;     // metres: bounding sphere around a body's centre, for the view cull
export const NPC_STATS_R = 0.7;
export const NPC_STATS_UP = 0.55;
export const WATER_CELL = 1;
export const OCC_CELL = 0.25;     // NPC occupancy grid resolution, metres
export const OCC_INV = 1 / OCC_CELL;
export const OCC_CARVE_KEEP = 0.2;      // a doorway lane never clears a cell whose centre is this close to a raw solid

// TWO-LOBE SPIKING NETWORK
// Input -> A, Input -> B, A <-> B (A reads B's spikes from the previous step), A,B -> Output.
// Lobes are leaky integrate-and-fire neurons with binary spikes. Outputs are a ring of preferred turns.
// Learning is three-factor: tagSynapses after each decision, adjustWeights when the next reward arrives.
export const LIF_LEAK = 0.85;              // share of the membrane kept each step
export const LIF_THRESHOLD = 0.25;         // membrane at which a neuron spikes
export const LIF_RESET = -0.1;             // membrane right after a spike
export const TAG_DECAY = 0.5;              // per decision: eligibility tags and each neuron's activity average
export const DA_TONIC_RATE = 0.05;         // how fast tonic dopamine (expected reward) tracks reward
export const BRAIN_LEARNING_RATE = 0.01;
export const BRAIN_WEIGHT_DECAY = 0.00001; // per weight update (one per decision): half-life ~69,000 decisions, ~19 sim hours
export const HEADING_JITTER = 0.3;         // radians: the turn taken is the population vector plus up to this much noise

// HUMAN RIG: PS2-era people; one merged low-poly body (part id + joint heights per vertex), posed in the vertex shader.
export const HUMAN_ATLAS = 512;                   // texels a side of the paint and mask atlases
export const HUMAN_FACE_TILE = [128, 64];         // head + neck wrap; 8 tiles (4 male, 4 female) fill the top-left quarter
export const HUMAN_BODY_TILE = [256, 128];        // everything below the neck; one tile per outfit
export const HUMAN_FACE_VARIANTS = 4;             // per sex
export const HUMAN_OUTFITS = 6;                   // 0 tee + jeans, 1 shirt + slacks, 2 jacket, 3 hoodie, 4 tank + shorts, 5 suit
export const HUMAN_OUTFIT_TILES = [[256, 0], [256, 128], [0, 256], [256, 256], [0, 384], [256, 384]];   // atlas texels, as the shader finds them
// Gait: a full cycle's stride in leg lengths grows with speed in leg lengths per second; cadence is capped.
export const HUMAN_STRIDE_BASE = 0.95;
export const HUMAN_STRIDE_PER_V = 0.48;
export const HUMAN_STRIDE_MAX = 4.6;
export const HUMAN_CADENCE_MAX = 2.6;             // gait cycles per second; anything faster slides its feet
export const HUMAN_SWING_MAX = 0.62;              // radians of hip swing
export const HUMAN_IDLE_SPEED = 0.45;             // m/s under which the stride shrinks toward the idle pose
export const HUMAN_GAIT_EASE = 0.15;              // per-tick easing of the gait speed
export const HUMAN_GAIT_JUMP = 1;                 // metres in one tick past which a move is a teleport, not a step
// Rig landmarks in rig units: origin at the body centre, feet at -lift, crown at NPC_RIG_TOP - lift; joints sit at z = 0.
export const HUMAN_RIG = (() => {
  const foot = -SPECIES.human.lift, at = f => foot + f * NPC_RIG_TOP.human;
  // shoulderX: the shoulder joint's distance out from the centre line (the arms hang from it, flaring a little)
  return { at, foot, crown: at(1), hip: at(0.53), knee: at(0.285), ankle: at(0.045), shoulder: at(0.795), elbow: at(0.625), shoulderX: 4.25 };
})();
export const HUMAN_LEG = HUMAN_RIG.hip - HUMAN_RIG.foot;   // hip to sole, rig units
// CROUCH POSE (radians at full crouch): thigh forward (hip), shin back (knee), feet kept flat, torso leaning, arms forward.
// The body drops by what the folded legs lose in height, so the soles stay on the ground; the eye drops the same.
export const HUMAN_CROUCH = { hip: -1.0, knee: 1.9, lean: 0.35, arm: -0.4, elbow: -0.5, swingKept: 0.6 };
export const HUMAN_FIGHT = NPC_FIGHT_MOVES.human;   // guard and punch arm angles (radians) for the vertex shader
export const HUMAN_CROUCH_DROP = (HUMAN_RIG.hip - HUMAN_RIG.knee) * (1 - Math.cos(HUMAN_CROUCH.hip)) +
  (HUMAN_RIG.knee - HUMAN_RIG.foot) * (1 - Math.cos(HUMAN_CROUCH.knee + HUMAN_CROUCH.hip));   // rig units
export const CROUCH_DROP = HUMAN_CROUCH_DROP * NPC_UNIT * PLAYER_HS;   // metres the player's eye lowers at full crouch
export const HUMAN_ARM_FLARE = 0.06;   // rig units an arm's axis moves out from the shoulder per rig unit down the arm
// PET (the player's Pet action, `petting`): crouched and bent further forward at the waist, the petting arm (arm: +1
// left, -1 right, as moveSide) reaches down until its hand point (handAt, a share of the rig's height as
// HUMAN_RIG.at) rests on the cat's head, elbow bent `elbow`, and rubs it from the player's left to right and back
// `strokes` times (strokeS seconds each), sweepM metres either side, turning about the shoulder's vertical; reachS
// eases the arm in and out. Each pet takes the shallowest of PET_BEND_LEVELS bends spread evenly over `bend`
// (radians) whose reach meets the head (a cat downhill needs a deeper one), and solves the shoulder angle within
// `shoulder` (radians) for it, so the hand meets the head at any body height; turnMax bounds the sweep angle.
// stayM: metres the player may drift from where the pet began before it ends.
// The pose reaches the shader in iAct.w (humanPetPack): reach share (6 bits), bend level (2), shoulder angle (8),
// sweep angle (8).
export const HUMAN_PET = {
  arm: -1, bend: [0.3, 0.9], elbow: -0.3, handAt: 0.4, reachS: 0.35, strokes: 3, strokeS: 0.7, sweepM: 0.07,
  shoulder: [-1.6, 0.4], turnMax: 1.2, stayM: 0.05
};
export const PET_BEND_LEVELS = 4;   // the 2 bits humanPetPack gives the bend level

// HUMAN LOOK (render only): skin tone, face variant and build pass to children; clothes are each person's own.
export const HUMAN_SKIN = [0xf2d0b8, 0xe0b391, 0xc89068, 0xa56f48, 0x7a4e32, 0x4e3222];   // light to dark, sRGB
export const HUMAN_SHIRTS = [0xd8d6cf, 0x8e9093, 0x2a2b2e, 0x2d3f66, 0x9c2f2a, 0x5b2430, 0x3f6a3c, 0x6d6b3a,
  0xc59a37, 0x6c98c8, 0x6a4a33, 0xc8b48c, 0xc98299, 0x5e4a86, 0xc86f2e, 0x2f7576];
export const HUMAN_PANTS = [0x3a5378, 0x24324d, 0x232325, 0x67686b, 0xa8956c, 0x5a4330, 0x4f5235, 0x283150, 0x6a86a8];
export const HUMAN_SUITS = [0x26272a, 0x2b3346, 0x3e3f43, 0x4b3e31];
export const HUMAN_HAIR = [[0x17120f, 0x2e1d12, 0x5c3b21, 0x9c7b48], [0x1b1411, 0x4b2c17, 0x86522b, 0xc4a062]];   // [female][face variant], sRGB

// FAR BILLBOARDS (render only): past perf.npcLodDist a body is a viewer-facing card cut from atlases baked from the real rigs at load.
export const BB_CELL = 40;                          // atlas texels a side of one frame
export const BB_DIRS = 8;                           // views round a body, 45 degrees apart
export const BB_BAKED_DIRS = BB_DIRS / 2 + 1;       // front round the body's left to its back; right-hand views mirror these
export const BB_PHASES = 8;                         // walk frames per gait cycle
export const BB_POSES = BB_PHASES + 1;              // pose 0 stands, poses 1.. walk
export const BB_BLOCK = BB_BAKED_DIRS * BB_POSES;   // frames per look
export const BB_FRAME = { human: [40, -22], deer: [50, -15.75], coyote: [40, -12.25] };   // rig units: a frame's side, its bottom below the body centre
export const BB_FACE_VARIANT = 3;                   // the face baked for people; its light hair keeps the baked hair weight precise
// walk frames' hip swing: stepGait's swing for an adult at the species' speed
export const BB_HUMAN_SWING = Math.min(HUMAN_SWING_MAX, Math.asin(Math.min(1, (HUMAN_STRIDE_BASE + HUMAN_STRIDE_PER_V * SPECIES.human.speed / HUMAN_LEG) / 4)));
export const BB_STAND_SWING = BB_HUMAN_SWING / 2;   // a far person swinging less than this shows the standing frame
export const BB_PHASE_K = BB_PHASES / (2 * Math.PI);
export const BB_MIP_BIAS = -1.5;                    // atlas reads take a finer mip, so thin limbs stay solid as a card shrinks, as the rig's do

// Plants are drawn per cell of a PLANT_GRID x PLANT_GRID split of the world, so view and shadow culling skip whole cells.
export const PLANT_GRID = 3;

// FOOD BOXES: one crate per restaurant and grocery store; an eaten crate reappears at another, so the count is fixed.
export const FOOD_BOX_KINDS = { food: true, grocery: true };
export const FOOD_BOX_SIZE = 0.35;      // metres, cube edge
export const FOOD_BOX_REACH = 1.1;      // metres from the crate's centre that count as touching
export const FOOD_BOX_HEIGHT = 2.5;     // metres of height difference past which a crate is out of reach
export const FOOD_BOX_SLOTS = 4;        // crates one place can hold at once
export const FOOD_BOX_OUTDOOR_CHANCE = 0.25;   // share of spawns that land outdoors in the city instead of at a place

// INDOOR CLIP: ground layers (land cover, roads, paths, markings) are discarded inside each building's inner wall
// outline, so the floor wins with no depth bias. Texels are filled by centre; at INDOOR_CELL a texel reaches at most
// ~0.2 m past the inner outline, which stays inside the wall's thickness.
export const INDOOR_CELL = 0.25;

// STREETS: lane markings, parked cars and street lamps along the city's vehicle roads. Parked cars and lamp posts
// are solids, so the player, the car, deer and the NPC occupancy grid treat them as obstacles, and they block NPC sight (cover).
export const CURB_PIECE = 2;                  // metres per piece a road edge is walked in, checking it is clear
export const CURB_KINDS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'road',
  'primary_link', 'secondary_link', 'tertiary_link']);   // roads whose edges get lamps (and parking, see PARKING_KINDS)

export const MARK_KINDS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified',
  'road', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
export const MARK_MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link',
  'primary_link', 'secondary_link']);
export const MARK_MIN_WIDTH = 5.5;            // metres; narrower streets go unmarked
export const MARK_W = 0.12;                   // metres, line width
export const MARK_DASH = 3, MARK_GAP = 6;     // metres of dash and of gap
export const MARK_Y = LAYER_Y.road + 0.004;
export const MARK_JUNCTION_CLEAR = 0.3;       // metres outside another road's edge where a line stops
export const MARK_WHITE = 0xe6e4dc, MARK_YELLOW = 0xd6ac34;
export const LANE_W = 3.4;                    // metres per lane when the lanes tag is missing

export const PARKING_KINDS = new Set(['secondary', 'tertiary', 'residential', 'unclassified', 'road']);
export const PARK_MIN_HALF = 3.4;             // metres; a street narrower than twice this has no parking
export const PARK_GAP = 1.6;                  // metres between parked cars
export const PARK_CURB_GAP = 0.2;             // metres between a parked car and the curb
export const PARK_P = 0.275;                  // chance a parking slot is taken
export const PARK_CLEAR = 8;                  // metres a parked car keeps from a crossing road's edge
export const PARKED_COLORS = [0x1c1f24, 0xe4e4e2, 0x9ea3a8, 0x5a5f66, 0x7a1f1f, 0x1f3a6b, 0x2f4a3a, 0xb8a98a, 0x3a3f46, 0xc9c9c4];

export const LAMP_SPACING = 30;               // metres between generated lamps along one side
export const LAMP_H = 5.4;                    // metres, pole height
export const LAMP_ARM = 1.3;                  // metres the head reaches out over the road
export const LAMP_CURB_IN = 0.45;             // metres from the road edge to the pole
export const LAMP_NEAR = 12;                  // metres kept from any other lamp (mapped ones first)
export const LAMP_DOOR_CLEAR = 2.5;           // metres kept from a doorway
export const LAMP_POLE_R = 0.15;              // metres, half side of the pole's collider
export const LAMP_ROAD_REACH = 12;            // metres within which a mapped lamp's arm turns toward the road
export const LAMP_REACH = 10;                 // metres of ground a lamp lights
export const LAMP_MAP_CELL = 1;               // metres per cell of the ground light map
export const LAMP_GAIN = 2.2;                 // how bright lamp light is on the ground, times the surface colour

export const COVER_CELL = 8;                  // metres, cover grid cell

// NPC OCCUPANCY GRID: solids grown by NPC_RADIUS, 1 bit per 0.25 m cell, in 32 m tiles made on first write.
export const OCC_TILE_BITS = 7;                                   // 128 cells a tile side
export const OCC_TILE_MASK = (1 << OCC_TILE_BITS) - 1;
export const OCC_TILE_WORDS = (1 << (2 * OCC_TILE_BITS)) >>> 5;

export const SPAWN_CLEAR = 1.5;   // metres kept between the spawn and any footprint edge

export const STREET_STEP = 2;   // metres between candidate points along a street

// WILD: the Arena's procedural world in metres (generator in Arena units, scaled by NPC_UNIT); heights cached in a grid.

export class WorldConfig {
  constructor(scale = 20) {
    this.BASE = {
      worldWidth: 850,   // per unit of world scale
      worldHeight: 600,
    };
    // wilderness animals and plants at the start; fixed, so the map size changes only the land
    this.initialCoyotes = 600;
    this.initialDeer = 600;
    this.initialPlants = 9000;
    this.probSpawnPlant = 0.03;
    this.groundY = 5;
    this.applySize(scale, 3000);
  }

  // Map size (world scale) and starting people (city and wilderness together); each sets only its own thing.
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

// WATER: one world-spanning surface; ISLAND COAST: land falls to sea floor near each edge and the sea runs to the horizon.
export const COAST_SEA = 30;
export const COAST_LAND = 70;
export const COAST_WOBBLE = 20;     // metres the coastline wanders (under COAST_SEA, so the edge is always water)
export const OCEAN_DEPTH = 6;      // metres of sea floor under the water level
export const OCEAN_REACH = 2000;   // metres the sea runs past the edge (the camera's far plane)

// CABINS: the Arena's log cabins, sized to the player (CABIN_M), their colliders turned into obstacle-index solids.
export const CABIN_SCALE = 1.75;
export const CABIN_M = NPC_UNIT * PLAYER_HS;        // cabin rig units -> metres

// CAT COMPANION: Nibbler from the Arena, rig in Arena units scaled to the player; comes with wilderness (provider.companion).
// sized to a real house cat: the rig's head top (12.5 units) at CAT_HEAD_TOP metres
export const CAT_HEAD_TOP = 0.3;
export const CAT_SCALE = CAT_HEAD_TOP / 12.5;
export const CAT_SEAT = { x: 0.3, y: 0.45, z: 0 };     // passenger seat in the car's frame (+x passenger side, -z forward)
export const CAT_DOOR = 0.95;         // m from the car's centre line to where he stands at the passenger door
export const CAT_RUN_FROM = 25;       // m from the car: starting farther than this (or the car moving) he runs...
export const CAT_WALK_WITHIN = 4;     // m: ...until this close, then walks the rest
export const CAT_RUN_SPEED = 11;      // m/s sprint (his catch-up pace)
export const CAT_BOARD_SPEED = 2.2;   // m/s trot to the passenger door
export const CAT_JUMP_TIME = 0.55;    // s: door to seat
export const CAT_BOARD_TIMEOUT = 8;   // s: still not in, he appears at the passenger door and hops in
export const CAT_HEAD_FWD = 9 * CAT_SCALE;   // m his head sits ahead of his body centre (the rig's head at z 9)
export const CAT_PET_STEP_SPEED = 0.6;       // m/s he steps to where he is petted (CatCompanion.hold)
export const CAT_PET_SETTLED = 0.01;         // m from that spot that counts as there (his legs stop)
export const CAT_PET_TURN_RATE = 8;          // per second, his turn toward the petting's facing

// CAMERA POV: '1st' or '3rd'; in third person the player's own body shows (a person drawn with the NPC human rig).
export const TPP_BACK = 70 * NPC_UNIT * PLAYER_HS;   // the Arena's TPP_OFFSET, sized to the player
export const TPP_UP = 18 * NPC_UNIT * PLAYER_HS;

export const PLAYER_JOG_ANIM = 0.5;   // share of the real step the gait animates when not sprinting

// GRAPHICS: high has shadow-map shadows, redrawn only on player/sun moves or nearby casters (SHADOW_MOVER_HZ); low has blobs.
export const SHADOW_FOLLOW_STEP = 20;       // metres the box centre may drift before it is redrawn where it should be
export const SHADOW_SUN_STEP_DEG = 0.5;
export const SHADOW_SUN_STEP_COS = Math.cos(SHADOW_SUN_STEP_DEG * Math.PI / 180);
export const SHADOW_MOVER_HZ = 15;
// only casters this close to the player trigger a redraw when they move; farther ones are redrawn with the box
export const SHADOW_MOVER_DIST = 60;
export const SUN_DIST = 300;                // metres from the box centre to the light, inside SHADOW_DEPTH
export const SHADOWS_ENABLED = true;        // master switch

// WILD_GROVES: Millennium Park's mapped trees as groves (12 m clusters, <= 80 m), "|"-separated, dx dz in decimetres.
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

// WILDERNESS: procedural land around the city; measured ground rules the city square, blending out over MIX_BLEND metres.
export const MIX_BLEND = 250;    // metres from the measured edge to pure wilderness
export const MIX_RING_MIN = 300;    // wilderness width around the city, metres
export const MIX_RING_MAX = 1500;
export const MIX_PARK_SHARE = 0.25;   // share of the wilderness coyotes and deer that start in city parks and woods, when the city has any
export const MIX_HABITAT = { forest: 2, wood: 2, scrub: 1.5, wetland: 1.5, meadow: 1.25 };
export const MIX_SINK = 0.6;    // metres the wild mesh dips under the city's own terrain where they overlap

// BLOB SHADOWS (low): one soft ellipse per nearby on-screen animal, sized and turned with it; faded with the sun.
export const BLOB_DIST = 40;            // metres from the camera
export const BLOB_MAX = 2048;
export const BLOB_OPACITY = 0.42;
export const BLOB_FULL_SUN = 1.35;      // sun intensity at which blobs reach BLOB_OPACITY (the SKY table's day value)
export const BLOB_LIFT = 0.04;          // metres above the feet, against z-fighting on flat ground
export const BLOB_SPREAD = 1.25;        // blob size over the body's footprint

// SURVIVOR MODE: every player rule and number lives in SURVIVOR_CONFIG; `game` is the one interface that applies them.
// Health only changes through game.hurt / game.heal; the NPC world sees the player through game.avatar.
export const SURVIVOR_CONFIG = {
  maxHealth: 100,
  needs: {
    foodPerS: 100 / (20 * 60),    // need per second: fed to starving in 20 min
    waterPerS: 100 / (10 * 60),   // need per second: watered to parched in 10 min
    drinkPerS: 10,                // need per second removed while Drink is held, standing in water or swimming
    sprintCost: 2,                // hunger and thirst rise this many times faster while sprinting
    starvingPerS: 0.5,            // health per second lost with the food bar empty (0 = off)
    parchedPerS: 1                // health per second lost with the water bar empty (0 = off)
  },
  reach: { radius: PLAYER_RADIUS + 0.45, height: 1.5 },   // metres: contact with animals, plants and crates
  squatS: 1,                        // seconds the body squats for a field action marked `squat` (Harvest, Collect), then stands
  punch: { reachM: 1.1, coneCos: 0.5 },   // the attack button: metres from the player, and how far off the facing (cos of the half angle)
  fall: { safeM: 3, damagePerM: 10 },                    // unhurt up to safeM, then damagePerM per metre (~13 m lethal)
  plantShare: 0.01,                 // the player's share of a plant bite's nutrition (PLANT_BITE_NUTRITION)
  meatDeerShare: 0.1,               // a piece of meat feeds this share of what a kill of an average adult buck feeds
  flash: { minDamage: 0.5, maxOpacity: 0.3, fullAtDamage: 20, fadeS: 0.9 },   // damage edge for hits of minDamage+ (not the steady starving drain)
  // INVENTORY: each item kind names its action (SURVIVOR_ACTIONS) and what it gives; `loot` is its weight in a box
  // (0 or absent: never in one). A box opens in its slot into one item drawn by weight. New kinds (weapons) add an
  // entry here and, for a new kind of use, an action.
  inventory: {
    slots: 2,
    keys: ['Digit1', 'Digit2'],     // one per slot; tapping a slot works too
    items: {
      crate: { icon: '📦', label: 'Box', action: 'open' },
      water: { icon: '💧', label: 'Bottled water', action: 'drink', water: 25, loot: 45 },   // water need removed
      // a whole plant, as picking one up gives (a picked plant carries its own food, from the bites it has left)
      plant: { icon: '🌿', label: 'Plant', action: 'eat', loot: 45, get food() { return playerPlantFood(PLANT_MAX_HEALTH); } },
      // a kill feeds its starting health (game.avatar.feedOn), which deer have whatever their size or sex
      meat: { icon: '🍖', label: 'Meat', action: 'eat', loot: 10, get food() { return SPECIES.deer.health * SURVIVOR_CONFIG.meatDeerShare; } },
      // the injuries it mends (INJURIES), no health; in boxes as often as meat, or crafted
      bandage: { icon: '🩹', label: 'Bandage', action: 'treat', cures: ['brokenBone'], loot: 10 }
    }
  },
  // INJURIES: each hit the player takes from an animal may cause one (chancePerHit), and so may a fall that hurts
  // (fallChanceAtSafe at fall.safeM, growing in proportion to the drop height: twice that height, twice the chance).
  // It shows beside the inventory until an item that `cures` it is used. noRun: the player cannot sprint while it lasts.
  injuries: {
    brokenBone: { icon: '🦴', label: 'Broken bone', chancePerHit: 0.2, fallChanceAtSafe: 0.5, noRun: true }
  },
  // CRAFTING: the craft slot (after the inventory slots) shows what the carried items make, from the first recipe
  // whose `uses` (item kinds, any order) the inventory holds; pressing it uses them up and adds `makes`.
  craft: {
    key: 'Digit3',
    recipes: [
      { uses: ['plant', 'plant'], makes: 'bandage' }
    ]
  },
  causes: {
    fall: 'Fell to your death',
    coyote: 'Killed by a coyote',
    starving: 'Starved',
    parched: 'Died of thirst'
  }
};

// Food the player gets from a plant with `bites` left: each bite is the player's share of a bite's nutrition.
export function playerPlantFood(bites) { return bites * PLANT_MAX_HEALTH * PLANT_BITE_NUTRITION * SURVIVOR_CONFIG.plantShare; }

// HEALTH BARS: a stats sprite and brain over each nearby person; slots are reused. Bars show fullness (1 - need).
export const BAR_STEPS = 40;     // redraw only when a bar moves a whole step
export const BAR_RELEASE_TICKS = 180;   // ~3 s out of close range before a slot is handed back
export const ARROW_STEPS = 32;    // arrow headings are snapped to this many directions
export const BAR_W_M = 0.8;    // sprite width in metres; the bars area is 2:1, the info row sits under it
export const BAR_ABOVE = 0.18;
export const BAR_COLORS = ['#e74c3c', '#e67e22', '#3498db', '#9b59b6'];
export const BAR_ICONS = ['\u2764\uFE0F', '\uD83C\uDF7D\uFE0F', '\uD83D\uDCA7', '\uD83D\uDC9E'];
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Past perf.npcLodDist, stats and brains become two shared InstancedMeshes: bar strips and one sphere per lobe.
export const FAR_STAT_MAX = 12000;
// Past this many metres no stats are drawn: a 0.8 m sprite's bar rows (~5 cm) are well under a pixel there.
export const BAR_CANVAS_W = 192, BAR_CANVAS_H = 96;   // bars area
export const BAR_INFO_H = 20;                          // canvas px of the Gen/Age/Sex/Height/Weight row
export const BAR_INFO_FONT = 15;                       // canvas px of its text, shrunk only when the fields would not fit
export const BAR_INFO_GAP = 8;                         // least canvas px between its fields (spread across the width)
export const BAR_SPRITE_CANVAS_H = BAR_CANVAS_H + BAR_INFO_H;
export const BAR_PX = BAR_W_M / BAR_CANVAS_W;
export const BAR_H_M = BAR_SPRITE_CANVAS_H * BAR_PX;   // whole sprite height in metres
export const LOBE_RADIUS = 0.7;
export const LOBE_COLS = [0x00e5ff, 0xaaff00];

// BRAINS OVER HEADS: NNVisualizer3D layout as two draw calls per brain; only changed nodes touch the GPU.
export const BRAIN_SCALE = 0.11;   // layout units -> metres (layout is ~6.2 x 4.2 units)
export const BRAIN_HALF_H = 2.1;
export const BRAIN_ABOVE = 0.06;
export const BRAIN_SPIN = 0.6;    // rad/s about the brain's own vertical
export const BRAIN_TILT = 0.18;
export const BRAIN_DIM = 0.3;
export const BRAIN_IN_GROUPS = [4, 4, 4, 4, 3];
export const BRAIN_GROUP_COLS = [0xe67e22, 0x3498db, 0xe74c3c, 0x9b59b6, 0x2ecc71];

// TOUCH

// Left half: floating stick (double tap crouches). Right half: look-drag.
export const STICK_RADIUS = 55;          // px of travel for full tilt
export const FLICK_RADIUS = 10;
export const TAP_GAP_MS = 300;

// MULTI-TOUCH BUTTONS: mobile browsers send no click for a tap while another finger is down (on the stick, the gas),
// so in-game buttons act on their own touch's pointerup instead; the native click that may follow is swallowed.
// Holds on the canvas and on these buttons cancel the browser's long-press, which would vibrate and open a menu.
export const TAP_SLOP = 12;           // px a finger may drift and still count as a tap
export const TAP_SWALLOW_MS = 600;    // a native click on the same button this soon after is the same tap
export const TAP_BUTTONS = '#fly, #car, #gear, #settings button';   // buttons that act on a tap (pedals, climb and #use act on press)
// buttons outside the scrollable settings sheet: their touches never scroll, so the long press is cancelled at touchstart
export const HOLD_SAFE = '#fly, #car, #use, .pedal, #climb button, #gear';

// CAR: one per city, parked near the spawn. Kinematic bicycle model, three collision circles, chase camera.

export const CAR_SCALE = 0.75;      // whole car (model, collisions, reach, camera) relative to the original full-size build
export const CAR_LEN = 4.3 * CAR_SCALE;
export const CAR_WID = 1.8 * CAR_SCALE;
export const CAR_TOP = 1.45 * CAR_SCALE;
export const CAR_WHEELBASE = 2.6 * CAR_SCALE;
export const CAR_TRACK = 1.55 * CAR_SCALE;
export const CAR_WHEEL_R = 0.33 * CAR_SCALE;
export const CAR_R = 0.9 * CAR_SCALE;
export const CAR_CIRCLES = [-1.25 * CAR_SCALE, 0, 1.25 * CAR_SCALE];
export const CAR_STEP_UP = 0.25;    // solids lower than this are driven over
export const CAR_SUBSTEP = 0.25;    // under CAR_R, so a fast car cannot skip a fence
export const CAR_ACCEL_MAX = 4.5;     // m/s^2, traction limit off the line
export const CAR_POWER = 60;      // W/kg: engine power per unit mass, so a = P / v
export const CAR_BRAKE = 9.0;     // m/s^2 service brake (~0.9 g)
export const CAR_HANDBRAKE = 6.0;
export const CAR_REV_MAX = 6.0;     // m/s top reverse speed
export const CAR_REV_ACCEL = 3.0;
export const CAR_ROLL = 0.15;    // m/s^2 rolling resistance
export const CAR_ENGINE_BRK = 0.35;    // m/s^2 extra drag with the throttle released
export const CAR_DRAG = 0.0006;  // 1/m: 0.5 * rho * CdA / mass
export const CAR_GRIP = 8.8;     // m/s^2 lateral limit (mu ~0.9)
export const CAR_STEER_MAX = 0.6;     // rad at standstill
export const CAR_STEER_FALL = 12;      // m/s at which the steering lock halves
export const CAR_STEER_RATE = 2.5;     // rad/s the wheels turn toward the input
export const CAR_G = 9.81;
export const CAR_GLANCE = 0.7;     // |heading . wall normal| under this (~45 deg) deflects
export const CAR_ALIGN = 0.3;     // share of the angle to the wall turned per contact substep
export const CAR_REACH = 3.2 * CAR_SCALE;
export const CAM_DIST = 6.5 * CAR_SCALE;
export const CAM_PIVOT = 1.4 * CAR_SCALE;
export const CAM_PITCH = -0.2;
export const CAM_FOLLOW = 5;       // 1/s camera yaw catch-up
export const CAM_LOOK_HOLD = 1500;    // ms after the last look input before it eases back

// Parked beside a cabin's doorway (right side first, looking out), nose pointing the door's way; `yaw` is that heading.
export const CABIN_CAR_GAP = 1.5;       // metres of clear ground between the cabin's floor edge and the car's rear
export const CABIN_CAR_WALKWAY = 1.2;   // metres of clear ground between the doorway's edge and the car's side

// SETTINGS

// Presets replace the game's own clock and weather ('Game', the first chip).
export const TIMES = ['Game', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Sunset', 'Night'];
export const FALLBACK_HOURS = {
  Dawn: 6, Morning: 9, Noon: 12, Afternoon: 15, Sunset: 18.5, Night: 0
};

// cloud drives sky and sun intensity; kind picks the fog branch
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
export const DEBUG_PROBE_LAYER = 7;                       // the probe camera sees only the people and the scene lights
export const DEBUG_PROBE_PX = 64;

// SWIMMING (the Arena's): water deeper than the eye floats the player at the surface; moving while looking down dives.
export const SWIM_DEPTH = EYE_HEIGHT + 0.2;   // metres of water over the bed past which the player swims
export const SWIM_FLOAT = 0.22;               // eye above the surface while floating (the Arena's WATER_FLOAT_OFFSET)
export const SWIM_SPEED = 0.45;
export const SWIM_JUMP = 0.5;
export const SWIM_DRAG = 4;                  // 1/s, vertical

// NPC ticks: one per NPC_TICK_S of real time at most (Arena constants are per tick); player motion renders at the display rate.
export const NPC_DRINK_SECONDS = 10;   // seconds in water for an animal's empty water bar to fill
export const NPC_TICK_SLACK = 0.004;   // rAF jitter allowance, so a 60 Hz display never skips a tick

// Sun altitude (degrees), sky/fog colour, sun colour, sun intensity.
export const SKY = [
  [-12, 0x05070f, 0x2a3a5c, 0.00],
  [-6, 0x101a2e, 0x46587c, 0.00],
  [-2, 0x34405e, 0xc27a52, 0.06],
  [0, 0x6e6b74, 0xff8c46, 0.35],
  [4, 0x98979f, 0xffb271, 0.85],
  [12, 0x9fb0c4, 0xffe0bb, 1.35],
  [30, 0x9fb4c8, 0xfff2dd, 1.60]
];

// SUN AND MOON DISCS: camera-facing quads at SKY_DIST (nearer on Graphics: low) along the true directions, occluded by depth, ~3x real size.
export const SKY_DIST = 1500;   // metres; inside the camera's far plane (HIGH_CAMERA_FAR), past the loaded area; sizes the quads
export const SKY_FAR_FRACTION = 0.9;   // a shorter far plane (LOW_CAMERA_FAR) places the discs at this fraction of it
export const SKY_BODY_DEG = 1.6;
export const SKY_TEX = 128;

// SKY FADE: on a weather change cloud and fog ease over SKY_FADE_S (a world's first sky is set at once).
export const SKY_FADE_S = 5;
export const RAIN_SPAN = 44;           // box width and depth around the camera, meters
export const RAIN_HEIGHT = 26;
export const RAIN_FPS_IDLE = 30;
export const RAIN_FADE_S = 5;          // seconds rain takes to fade in or out
export const RAIN_TIME_WRAP = 600;     // seconds; keeps the shader's float time small
export const ROOF_MAP_N = 128;
export const ROOF_MAP_SIZE = 56;       // meters per side; the rain box plus snap slack
export const ROOF_MAP_SNAP = 4;

export const RAIN_BY_CODE = {
  51: 0.25, 53: 0.4, 55: 0.55, 56: 0.3, 57: 0.5,
  61: 0.4, 63: 0.65, 65: 1, 66: 0.45, 67: 0.8,
  80: 0.45, 81: 0.7, 82: 1, 95: 0.85, 96: 0.9, 99: 1
};

// Suggested places: well-mapped US downtowns.
export const PICKS = [
  ['New York, NY', 'New York, NY'],
  ['Union Square, CA', 'Union Square, San Francisco, CA'],
  ['The Loop, IL', 'Millennium Park, Chicago, IL'],
  ['1 Park Place, Athens, OH', '1 Park Place, Athens, OH']
];
