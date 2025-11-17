// Overworld view: layout, state, movement, transitions, and rendering.

// Track the current overworld tile map so Link can roam the surface.
let overworldLayout;
// Track overworld state independently from the side-scrolling and town engines.
let overworldState;
// Cache of overworld tiles that represent the town entrance so we can map exits back to each side.
let townEntranceTiles;

// Initialize the overworld layout and backing state using the shared tile size.
function initOverworld(tileSize) {
  // Define the top-down overworld tile grid so moving left of the starting room switches engines.
  // The lake and town are mirrored toward the right side of the map so the water opens to the east.
  overworldLayout = [
    'MMMMMMMMMMMMMMMMMMM',
    'MGGGGGGGGGGGGGGGGGM',
    'MGGGGGGGGGGGGGGGGGM',
    'MGGGGGGWWWGGGGGGGGM',
    'MGGGGGWWWWWGGGGGGGM',
    'MGGGGGWWWPTTPPPPGGM',
    'MGGGGGWWWPPPPPPGGGP',
    'MGGGGGWWWWWGGGGGGGM',
    'MGGGGGGWWWGGGGGGGGM',
    'MGGGGGGGGGGGGGGGGGM',
    'MGGGGGGGGGGGGGGGGGM',
    'MMMMMMMMMMMMMMMMMMM'
  ];

  // Track overworld state independently from the side-scrolling engine.
  overworldState = {
    tileSize,
    map: overworldLayout,
    width: overworldLayout[0].length,
    height: overworldLayout.length,
    playerTileX: overworldLayout[0].length - 2,
    playerTileY: 6,
    moving: false,
    moveFrom: { x: 0, y: 0 },
    moveTo: { x: 0, y: 0 },
    moveTimer: 0,
    moveDuration: 8,
    facing: 'left',
    pendingTileInteraction: false
  };

  // Precompute the overworld tiles that represent the town entrance so we can map exits back to each side.
  townEntranceTiles = (() => {
    const tiles = [];
    // Walk each overworld row to collect every tile that belongs to the town footprint.
    for (let y = 0; y < overworldLayout.length; y++) {
      const row = overworldLayout[y];
      // Step across each column in the current row so we can detect town markers.
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'T') {
          tiles.push({ x, y });
        }
      }
    }
    // Handle the edge case where no town tiles exist by returning empty sides.
    if (tiles.length === 0) return { left: [], right: [] };
    const minX = Math.min(...tiles.map((t) => t.x));
    const maxX = Math.max(...tiles.map((t) => t.x));
    return {
      left: tiles.filter((t) => t.x === minX),
      right: tiles.filter((t) => t.x === maxX)
    };
  })();
}

// Choose the entrance tile on the requested side that is closest to the provided row.
function closestTownEntrance(side, targetY) {
  const candidates = side === 'right' ? townEntranceTiles.right : townEntranceTiles.left;
  // Skip selection entirely when no candidate tiles exist on that side.
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDistance = Math.abs(best.y - targetY);
  // Walk through every candidate tile so we can locate the nearest matching row.
  for (const tile of candidates) {
    const distance = Math.abs(tile.y - targetY);
    // Keep whichever tile has the smallest distance to the target row.
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

// Enter the overworld when Link exits the starting room to the left.
function enterOverworldFromSideView() {
  gameMode = GAME_MODE_OVERWORLD;
  overworldState.playerTileX = overworldState.width - 2;
  overworldState.playerTileY = 6;
  overworldState.moving = false;
  overworldState.moveTimer = 0;
  overworldState.facing = 'left';
  overworldState.pendingTileInteraction = false;
}

// Return to the side-scrolling engine after walking back to the right edge of the overworld.
function returnToSideScrollFromOverworld() {
  gameMode = GAME_MODE_SIDE_SCROLL;
  resetSideViewPlayerPosition();
}

// Enter the raised-view town scene and remember which overworld tile to return to.
function enterTownFromOverworld() {
  gameMode = GAME_MODE_RAISED;
  townState.entryTile = { x: overworldState.playerTileX, y: overworldState.playerTileY };
  // Decide whether this entry came from the left or right side so exits can mirror it.
  const nearestLeft = closestTownEntrance('left', townState.entryTile.y);
  const nearestRight = closestTownEntrance('right', townState.entryTile.y);
  const distanceToLeft = nearestLeft ? Math.abs(nearestLeft.x - townState.entryTile.x) : Infinity;
  const distanceToRight = nearestRight ? Math.abs(nearestRight.x - townState.entryTile.x) : Infinity;
  townState.entrySide = distanceToRight < distanceToLeft ? 'right' : 'left';
  // Rebuild the town patrol roster so each visit starts fresh.
  resetTownEnemies();
  resetTownPlayerPosition();
}

// Return to the overworld from town by restoring the saved tile coordinates.
function returnToOverworldFromTown(exitSide = townState.entrySide) {
  gameMode = GAME_MODE_OVERWORLD;
  const destination = closestTownEntrance(exitSide, townState.entryTile.y) || townState.entryTile;
  overworldState.playerTileX = destination.x;
  overworldState.playerTileY = destination.y;
  overworldState.moving = false;
  overworldState.moveTimer = 0;
  overworldState.pendingTileInteraction = false;
  overworldState.facing = exitSide === 'right' ? 'right' : 'left';
}

// Determine whether an overworld tile is passable based on its symbol.
function overworldTileWalkable(tileChar) {
  return tileChar === 'G' || tileChar === 'P' || tileChar === 'T';
}

// Retrieve the tile character at the requested overworld coordinate, defaulting to mountains when out of bounds.
function overworldTileAt(x, y) {
  if (y < 0 || y >= overworldState.height || x < 0 || x >= overworldState.width) {
    return 'M';
  }
  return overworldState.map[y][x];
}

// Handle tile-based overworld movement using discrete steps between grid cells.
function updateOverworld() {
  const inputKeys = combinedInputKeys();

  // Advance any in-progress movement so Link smoothly glides between tiles.
  if (overworldState.moving) {
    overworldState.moveTimer++;
    // Stop stepping once the move timer reaches the configured duration.
    if (overworldState.moveTimer >= overworldState.moveDuration) {
      overworldState.playerTileX = overworldState.moveTo.x;
      overworldState.playerTileY = overworldState.moveTo.y;
      overworldState.moving = false;
      overworldState.moveTimer = 0;
      overworldState.pendingTileInteraction = true;
      // Transition back to the side-view once the player walks off the right edge bridge.
      if (overworldState.playerTileX >= overworldState.width - 1 && overworldState.facing === 'right') {
        returnToSideScrollFromOverworld();
      }
    }
    return;
  }

  // Trigger tile interactions only once after finishing a step to avoid immediate re-entry loops.
  if (overworldState.pendingTileInteraction) {
    overworldState.pendingTileInteraction = false;
    const landedTile = overworldTileAt(overworldState.playerTileX, overworldState.playerTileY);
    // Enter the raised-view town whenever Link steps onto the white plaza tile.
    if (landedTile === 'T') {
      enterTownFromOverworld();
      return;
    }
  }

  // Build an ordered list of desired movement directions so only one tile move occurs per step.
  const desiredMoves = [];
  // Honor upward input by queuing a move to the north tile.
  if (inputKeys.w) desiredMoves.push({ dx: 0, dy: -1, facing: 'up' });
  // Honor downward input by queuing a move to the south tile.
  if (inputKeys.s) desiredMoves.push({ dx: 0, dy: 1, facing: 'down' });
  // Honor leftward input by queuing a move to the west tile.
  if (inputKeys.a) desiredMoves.push({ dx: -1, dy: 0, facing: 'left' });
  // Honor rightward input by queuing a move to the east tile.
  if (inputKeys.d) desiredMoves.push({ dx: 1, dy: 0, facing: 'right' });

  // Attempt the first requested direction to keep controls predictable.
  for (const move of desiredMoves) {
    const targetX = overworldState.playerTileX + move.dx;
    const targetY = overworldState.playerTileY + move.dy;
    const targetTile = overworldTileAt(targetX, targetY);
    // Start a new tile step only when the destination is walkable.
    if (overworldTileWalkable(targetTile)) {
      overworldState.facing = move.facing;
      overworldState.moving = true;
      overworldState.moveFrom = { x: overworldState.playerTileX, y: overworldState.playerTileY };
      overworldState.moveTo = { x: targetX, y: targetY };
      overworldState.moveTimer = 0;
      break;
    }
  }
}

// Render the overworld top-down map using simple color-coded tiles.
function drawOverworld() {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const templeTiles = [];

  // Loop through each tile to paint the landscape.
  for (let y = 0; y < overworldState.height; y++) {
    // Walk every column of the current row to lay down its tile color.
    for (let x = 0; x < overworldState.width; x++) {
      const tile = overworldState.map[y][x];
      const px = x * overworldState.tileSize + TILE_SIZE * 2;
      const py = y * overworldState.tileSize + TILE_SIZE * 2;
      // Choose a fill color that matches the tile's terrain type.
      if (tile === 'G') {
        ctx.fillStyle = '#7bb858';
      } else if (tile === 'P') {
        ctx.fillStyle = '#d7c06a';
      } else if (tile === 'W') {
        ctx.fillStyle = '#4a6cff';
      } else if (tile === 'T') {
        ctx.fillStyle = '#e6e6e6';
        // Remember each temple tile so the building graphic can be drawn afterward.
        templeTiles.push({ px, py });
      } else {
        ctx.fillStyle = '#8c5a32';
      }
      ctx.fillRect(px, py, overworldState.tileSize, overworldState.tileSize);
      // Add a darker outline to water and temple tiles for clarity.
      if (tile === 'W' || tile === 'T') {
        ctx.strokeStyle = tile === 'W' ? '#2e3d8f' : '#a8a8a8';
        ctx.strokeRect(px + 0.5, py + 0.5, overworldState.tileSize - 1, overworldState.tileSize - 1);
      }
    }
  }

  // Draw the destination temple so it stands out above the base tile color on every town cell.
  for (const tile of templeTiles) {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(tile.px + 4, tile.py + 2, overworldState.tileSize - 8, overworldState.tileSize - 4);
    ctx.fillStyle = '#808080';
    ctx.fillRect(tile.px + 6, tile.py + 6, overworldState.tileSize - 12, overworldState.tileSize - 10);
  }

  // Compute the player's interpolated position while stepping between tiles.
  const progress = overworldState.moving
    ? Math.min(1, overworldState.moveTimer / overworldState.moveDuration)
    : 0;
  const baseX = overworldState.playerTileX * overworldState.tileSize;
  const baseY = overworldState.playerTileY * overworldState.tileSize;
  const targetOffsetX = overworldState.moving
    ? (overworldState.moveTo.x - overworldState.moveFrom.x) * overworldState.tileSize
    : 0;
  const targetOffsetY = overworldState.moving
    ? (overworldState.moveTo.y - overworldState.moveFrom.y) * overworldState.tileSize
    : 0;
  const playerDrawX = TILE_SIZE * 2 + baseX + targetOffsetX * progress;
  const playerDrawY = TILE_SIZE * 2 + baseY + targetOffsetY * progress;

  // Render Link as a tiny adventurer sprite with a directional arrow to hint at facing.
  ctx.fillStyle = '#2f9e44';
  ctx.fillRect(playerDrawX + 4, playerDrawY + 4, overworldState.tileSize - 8, overworldState.tileSize - 8);
  ctx.fillStyle = '#ffe6a0';
  ctx.fillRect(playerDrawX + 6, playerDrawY + 6, overworldState.tileSize - 12, overworldState.tileSize - 12);
  ctx.fillStyle = '#ffffff';
  // Point a small notch toward the direction Link last walked to echo the NES-style pointer.
  if (overworldState.facing === 'left') {
    ctx.fillRect(playerDrawX + 2, playerDrawY + overworldState.tileSize / 2 - 1, 4, 2);
  } else if (overworldState.facing === 'right') {
    ctx.fillRect(playerDrawX + overworldState.tileSize - 6, playerDrawY + overworldState.tileSize / 2 - 1, 4, 2);
  } else if (overworldState.facing === 'up') {
    ctx.fillRect(playerDrawX + overworldState.tileSize / 2 - 1, playerDrawY + 2, 2, 4);
  } else {
    ctx.fillRect(playerDrawX + overworldState.tileSize / 2 - 1, playerDrawY + overworldState.tileSize - 6, 2, 4);
  }
}

