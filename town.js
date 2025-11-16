// Raised-view town: tile generation, collision helpers, camera, and town-specific state.

// Produce the tile grid for a given raised town area index.
function generateTownAreaTiles(areaIndex) {
  const tiles = [];
  // Build the base plaza layout row-by-row so the ground is mostly walkable.
  for (let y = 0; y < WORLD_ROWS; y++) {
    const row = [];
    // Populate each column of the current row with walkable space by default.
    for (let x = 0; x < TOWN_AREA_COLS; x++) {
      let value = 0;
      // Keep the perimeter walls solid so players stay inside the town bounds.
      if (y === 0 || y === WORLD_ROWS - 1) {
        value = 1;
      }
      row.push(value);
    }
    tiles.push(row);
  }

  // Carve doorway gaps into the edge walls so exits read clearly at the town borders.
  const exitGapStartRow = WORLD_ROWS - 8;
  const exitGapEndRow = WORLD_ROWS - 3;
  // Only add the left border wall when building the first plaza area.
  if (areaIndex === 0) {
    // Fill the leftmost column with walls while leaving a mid-height gap as an exit cue.
    for (let y = 0; y < WORLD_ROWS; y++) {
      if (y < exitGapStartRow || y > exitGapEndRow) {
        tiles[y][0] = 1;
      }
    }
  }
  // Only add the right border wall when building the final plaza area.
  if (areaIndex === TOWN_AREA_COUNT - 1) {
    // Fill the rightmost column with walls while preserving a doorway opening near the ground.
    for (let y = 0; y < WORLD_ROWS; y++) {
      if (y < exitGapStartRow || y > exitGapEndRow) {
        tiles[y][TOWN_AREA_COLS - 1] = 1;
      }
    }
  }

  // Place a long shopfront along the back edge of the first plaza area.
  if (areaIndex === 0) {
    for (let y = 2; y <= 5; y++) {
      // Walk the storefront span while clamping the end to the shortened plaza width.
      const storefrontEnd = Math.min(TOWN_AREA_COLS - 8, 24);
      for (let x = 8; x <= storefrontEnd; x++) {
        // Leave a doorway gap so the front row still looks traversable.
        if (x >= 15 && x <= 17) continue;
        tiles[y][x] = 1;
      }
    }
    // Add a planter stripe to break up the center of the courtyard.
    const planterStart = Math.max(2, Math.floor(TOWN_AREA_COLS * 0.55));
    const planterEnd = Math.min(TOWN_AREA_COLS - 4, planterStart + 6);
    for (let x = planterStart; x <= planterEnd; x++) {
      tiles[9][x] = 1;
    }
  }

  // Stagger a pair of warehouses in the second area to form a gentle zig-zag path.
  if (areaIndex === 1) {
    for (let y = 3; y <= 7; y++) {
      for (let x = 6; x <= 16; x++) {
        tiles[y][x] = 1;
      }
    }
    for (let y = 8; y <= 12; y++) {
      // Position the rear warehouse near the right edge while respecting the reduced width.
      const warehouseStart = Math.max(Math.floor(TOWN_AREA_COLS * 0.55), 18);
      const warehouseEnd = Math.min(TOWN_AREA_COLS - 2, warehouseStart + 10);
      for (let x = warehouseStart; x <= warehouseEnd; x++) {
        tiles[y][x] = 1;
      }
    }
  }

  return tiles;
}

// Return (and lazily build) the tile array for the requested raised town area index.
function getTownAreaTiles(areaIndex) {
  if (!townAreaCache.has(areaIndex)) {
    townAreaCache.set(areaIndex, generateTownAreaTiles(areaIndex));
  }
  return townAreaCache.get(areaIndex);
}

// Look up the tile index inside the raised-view town at the requested tile coordinate.
function townTileAtTileCoordinates(tileX, tileY) {
  // Treat vertical out-of-bounds as solid so Link cannot leave the plaza height.
  if (tileY < 0 || tileY >= WORLD_ROWS) return 1;
  const areaIndex = Math.floor(tileX / TOWN_AREA_COLS);
  // Treat positions outside the fixed-length town as solid walls.
  if (areaIndex < 0 || areaIndex >= TOWN_AREA_COUNT) return 1;
  const localTileX = tileX - areaIndex * TOWN_AREA_COLS;
  const areaTiles = getTownAreaTiles(areaIndex);
  return areaTiles[tileY][localTileX];
}

// Look up the tile index inside the raised-view town at the requested pixel coordinate.
function townTileAtPixel(x, y) {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  return townTileAtTileCoordinates(tx, ty);
}

// Determine whether a rectangle collides with any solid town tiles.
function townRectVsWorld(x, z, width, height) {
  const left = x;
  const right = x + width;
  const top = z;
  const bottom = z + height;
  const midZ = (top + bottom) / 2;

  // Abort when the top-left corner hits something solid.
  if (townTileAtPixel(left, top)) return true;
  // Abort when the top-right corner hits something solid.
  if (townTileAtPixel(right - 1, top)) return true;
  // Abort when the mid-left sample hits something solid.
  if (townTileAtPixel(left, midZ)) return true;
  // Abort when the mid-right sample hits something solid.
  if (townTileAtPixel(right - 1, midZ)) return true;
  // Abort when the bottom-left corner hits something solid.
  if (townTileAtPixel(left, bottom - 1)) return true;
  // Abort when the bottom-right corner hits something solid.
  if (townTileAtPixel(right - 1, bottom - 1)) return true;
  return false;
}

// Note: townState, resetTownPlayerPosition, and connector helpers are defined in index.html for now

// Update the raised-view camera so it follows Link across the fixed-length town strip.
function updateTownCamera() {
  const target = player.x + player.width / 2 - canvas.width / 2;
  const minCam = 0;
  const maxCam = Math.max(0, TOWN_TOTAL_WIDTH - canvas.width);
  cameraX = Math.min(Math.max(target, minCam), maxCam);
}
