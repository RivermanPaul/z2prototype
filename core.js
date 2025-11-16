// Core game setup: canvas, context, global constants, player, and shared utilities.

// Locate the primary canvas and 2D rendering context used across all modes.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Game mode flags so we can swap between the side-view, overworld, and raised town engines.
const GAME_MODE_SIDE_SCROLL = 'side-scroll';
const GAME_MODE_OVERWORLD = 'overworld';
const GAME_MODE_RAISED = 'raised';
let gameMode = GAME_MODE_SIDE_SCROLL;

// World / tile setup
const TILE_SIZE = 16;
const WORLD_ROWS = Math.floor(canvas.height / TILE_SIZE);
const SCREEN_COLS = Math.floor(canvas.width / TILE_SIZE);
const AREA_SCREEN_COUNT = 2;
const AREA_COLS = SCREEN_COLS * AREA_SCREEN_COUNT;
const AREA_WIDTH = AREA_COLS * TILE_SIZE;

// Raised-view town configuration.
const TOWN_AREA_COUNT = 2;
const TOWN_AREA_COLS = AREA_COLS / 2;
const TOWN_AREA_WIDTH = AREA_WIDTH / 2;
const TOWN_TOTAL_WIDTH = TOWN_AREA_COUNT * TOWN_AREA_WIDTH;
const TOWN_GROUND_Z = (WORLD_ROWS - 4) * TILE_SIZE;
// Width of the invisible connector rectangles that transfer Link between town sections.
const TOWN_CONNECTOR_WIDTH = TILE_SIZE * 2;
// Vertical band of the connector rectangles so they sit around the walkway depth.
const TOWN_CONNECTOR_TOP_Z = TOWN_GROUND_Z - TILE_SIZE * 2;
const TOWN_CONNECTOR_BOTTOM_Z = TOWN_GROUND_Z + TILE_SIZE * 0.5;

// Duration of the player's walking animation frames in ticks.
const WALK_ANIM_FRAME_DURATION = 6;
// Duration of the Octorok's idle animation frames in ticks.
const OCTOROK_IDLE_FRAME_DURATION = 24;

// Cache of generated areas so we only build each layout once.
const areaCache = new Map();
// Cache enemy instances per area so we can preserve their state when revisiting rooms.
const areaEntities = new Map();

// Track the generated raised-view town layouts so each area only builds once.
const townAreaCache = new Map();

// Track the current horizontal scroll position of the camera.
let cameraX = 0;

// Player properties: 2 tiles tall, 1 tile wide.
const player = {
  x: 4 * TILE_SIZE,
  y: (WORLD_ROWS - 4) * TILE_SIZE,
  z: (WORLD_ROWS - 4) * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE * 2,
  standHeight: TILE_SIZE * 2,
  crouchHeight: Math.floor(TILE_SIZE * 1.75),
  vx: 0,
  vy: 0,
  speed: 2.2,
  jumpSpeed: -7,
  gravity: 0.35,
  maxFall: 10,
  onGround: false,
  facing: 1,
  crouching: false,
  attacking: false,
  attackTimer: 0,
  hitTimer: 0,
  attackWindup: 2,
  attackStab: 6,
  attackRecover: 3,
  blockedThisSwing: false,
  walking: false,
  walkAnimTimer: 0,
  walkAnimFrame: 0,
  get attackDuration() {
    return this.attackWindup + this.attackStab + this.attackRecover;
  }
};

// Basic rectangle overlap helper used by multiple game systems.
function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

