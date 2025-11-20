// Overworld view: layout, state, movement, transitions, and rendering.

// Track the current overworld tile map so Link can roam the surface.
let overworldLayout;
// Track overworld state independently from the side-scrolling and town engines.
let overworldState;
// Cache of overworld tiles that represent the town entrance so we can map exits back to each side.
let townEntranceTiles;

// Initialize the overworld layout and scale the view to fill the canvas.
function initOverworld() {
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

  // Compute a scaled tile size that lets the overworld fill as much of the canvas as possible.
  const scaledTileSize = Math.floor(
    Math.min(canvas.width / overworldLayout[0].length, canvas.height / overworldLayout.length)
  );
  // Center the overworld view inside the canvas so it mirrors the side-scrolling presentation.
  const viewWidth = overworldLayout[0].length * scaledTileSize;
  const viewHeight = overworldLayout.length * scaledTileSize;
  const viewOffsetX = Math.floor((canvas.width - viewWidth) / 2);
  const viewOffsetY = Math.floor((canvas.height - viewHeight) / 2);

  // Track overworld state independently from the side-scrolling engine.
  overworldState = {
    tileSize: scaledTileSize,
    map: overworldLayout,
    width: overworldLayout[0].length,
    height: overworldLayout.length,
    viewOffsetX,
    viewOffsetY,
    playerTileX: overworldLayout[0].length - 2,
    playerTileY: 6,
    moving: false,
    moveFrom: { x: 0, y: 0 },
    moveTo: { x: 0, y: 0 },
    moveTimer: 0,
    moveDuration: 8,
    facing: 'left',
    pendingTileInteraction: false,
    enemies: [],
    enemyCollisionFlag: false,
    enemyCollisionCooldown: 0,
    lastEnemyCollisionTile: null
  };

  // Seed a handful of simple overworld foes so the map feels alive.
  overworldState.enemies = [
    createOverworldEnemy('blob', 6, 2),
    createOverworldEnemy('blob', 14, 6),
    createOverworldEnemy('beast', 10, 9)
  ].filter((enemy) => overworldTileWalkable(overworldTileAt(enemy.tileX, enemy.tileY)));

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

// Build a lightweight overworld enemy that roams a single tile at a time.
function createOverworldEnemy(type, tileX, tileY) {
  return {
    type,
    tileX,
    tileY,
    moving: false,
    moveFrom: { x: tileX, y: tileY },
    moveTo: { x: tileX, y: tileY },
    moveTimer: 0,
    // Faster beasts step through tiles more quickly than blobs.
    moveDuration: type === 'beast' ? 6 : 10,
    pauseTimer: 18,
    chasing: false,
    chaseTilesRemaining: 0,
    chaseCooldown: 0
  };
}

// Pick a random direction that remains inside walkable terrain.
function randomEnemyStep(tileX, tileY) {
  const options = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];
  const valid = options.filter((dir) => overworldTileWalkable(overworldTileAt(tileX + dir.dx, tileY + dir.dy)));
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

// Kick off an enemy move toward the requested delta.
function beginEnemyMove(enemy, dx, dy) {
  enemy.moving = true;
  enemy.moveTimer = 0;
  enemy.moveFrom = { x: enemy.tileX, y: enemy.tileY };
  enemy.moveTo = { x: enemy.tileX + dx, y: enemy.tileY + dy };
}

// Move one enemy toward its target, handling chase and pause states.
function updateOverworldEnemy(enemy) {
  if (enemy.moving) {
    enemy.moveTimer++;
    if (enemy.moveTimer >= enemy.moveDuration) {
      enemy.tileX = enemy.moveTo.x;
      enemy.tileY = enemy.moveTo.y;
      enemy.moving = false;
      enemy.moveTimer = 0;
      enemy.pauseTimer = enemy.type === 'beast' ? 12 + Math.floor(Math.random() * 8) : 18 + Math.floor(Math.random() * 10);
      if (enemy.chasing) {
        enemy.chaseTilesRemaining = Math.max(0, enemy.chaseTilesRemaining - 1);
        if (enemy.chaseTilesRemaining === 0) {
          enemy.chasing = false;
          enemy.chaseCooldown = 90;
        }
      }
    }
    return;
  }

  if (enemy.chaseCooldown > 0) {
    enemy.chaseCooldown--;
  }

  // Allow beasts to aggro when Link wanders near them.
  if (
    enemy.type === 'beast' &&
    !enemy.chasing &&
    enemy.chaseCooldown === 0
  ) {
    const dx = Math.abs(enemy.tileX - overworldState.playerTileX);
    const dy = Math.abs(enemy.tileY - overworldState.playerTileY);
    if (dx + dy <= 2) {
      enemy.chasing = true;
      enemy.chaseTilesRemaining = 5;
    }
  }

  if (enemy.pauseTimer > 0) {
    enemy.pauseTimer--;
    return;
  }

  let step = null;
  // When aggroed, choose a direction that marches toward the player's tile.
  if (enemy.chasing) {
    const dx = overworldState.playerTileX - enemy.tileX;
    const dy = overworldState.playerTileY - enemy.tileY;
    if (Math.abs(dx) > Math.abs(dy)) {
      step = { dx: dx > 0 ? 1 : -1, dy: 0 };
    } else if (dy !== 0) {
      step = { dx: 0, dy: dy > 0 ? 1 : -1 };
    }
    // If the preferred chase vector is blocked, fall back to a random step.
    if (step && !overworldTileWalkable(overworldTileAt(enemy.tileX + step.dx, enemy.tileY + step.dy))) {
      step = null;
    }
  }

  // Fall back to simple wandering when not chasing.
  if (!step) {
    step = randomEnemyStep(enemy.tileX, enemy.tileY);
  }

  if (enemy.chasing && !step) {
    enemy.chaseTilesRemaining = Math.max(0, enemy.chaseTilesRemaining - 1);
    if (enemy.chaseTilesRemaining === 0) {
      enemy.chasing = false;
      enemy.chaseCooldown = 90;
    }
  }

  // Start moving if a valid direction exists; otherwise pause briefly and try again.
  if (step) {
    beginEnemyMove(enemy, step.dx, step.dy);
  } else {
    enemy.pauseTimer = 12;
  }
}

// Update every overworld enemy so they animate alongside the player.
function updateOverworldEnemies() {
  for (const enemy of overworldState.enemies) {
    updateOverworldEnemy(enemy);
  }
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

// Calculate the world position of an overworld actor based on its tile and current movement.
function overworldEntityPosition(tileX, tileY, moving, moveFrom, moveTo, moveTimer, moveDuration) {
  if (moving) {
    const progress = Math.min(1, moveTimer / moveDuration);
    return {
      x: (moveFrom.x + (moveTo.x - moveFrom.x) * progress) * overworldState.tileSize,
      y: (moveFrom.y + (moveTo.y - moveFrom.y) * progress) * overworldState.tileSize
    };
  }
  return { x: tileX * overworldState.tileSize, y: tileY * overworldState.tileSize };
}

// Build an axis-aligned bounding box that is slightly smaller than a tile for lenient collisions.
function overworldCollisionBox(position) {
  const inset = overworldState.tileSize * 0.1;
  const size = overworldState.tileSize - inset * 2;
  return {
    x: position.x + inset,
    y: position.y + inset,
    width: size,
    height: size
  };
}

// Check whether two axis-aligned bounding boxes overlap.
function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Track collisions between Link and overworld enemies without deleting the foe yet.
function checkOverworldEnemyCollisions() {
  overworldState.enemyCollisionFlag = false;

  if (overworldState.enemyCollisionCooldown > 0) {
    overworldState.enemyCollisionCooldown--;
  }

  const playerPosition = overworldEntityPosition(
    overworldState.playerTileX,
    overworldState.playerTileY,
    overworldState.moving,
    overworldState.moveFrom,
    overworldState.moveTo,
    overworldState.moveTimer,
    overworldState.moveDuration
  );
  const playerBox = overworldCollisionBox(playerPosition);

  for (const enemy of overworldState.enemies) {
    const enemyPosition = overworldEntityPosition(
      enemy.tileX,
      enemy.tileY,
      enemy.moving,
      enemy.moveFrom,
      enemy.moveTo,
      enemy.moveTimer,
      enemy.moveDuration
    );
    const enemyBox = overworldCollisionBox(enemyPosition);

    if (overworldState.enemyCollisionCooldown === 0 && boxesOverlap(playerBox, enemyBox)) {
      // Keep the enemy alive but mark that a collision occurred so the combat encounter can hook in later.
      overworldState.enemyCollisionFlag = true;
      overworldState.lastEnemyCollision = enemy.type;
      overworldState.lastEnemyCollisionTile = {
        x: Math.max(0, Math.min(overworldState.width - 1, Math.round(playerPosition.x / overworldState.tileSize))),
        y: Math.max(0, Math.min(overworldState.height - 1, Math.round(playerPosition.y / overworldState.tileSize)))
      };
      overworldState.enemyCollisionCooldown = 18;
      break;
    }
  }
}

// Trigger a random battle when Link bumps into an overworld foe.
function handleOverworldEnemyCollision() {
  if (!overworldState.enemyCollisionFlag) return false;

  overworldState.enemyCollisionFlag = false;
  startRandomBattle(overworldState.lastEnemyCollision, overworldState.lastEnemyCollisionTile);
  return true;
}

// Shuffle enemy positions across random walkable tiles so encounters feel fresh after a battle.
function randomizeOverworldEnemyPositions() {
  const walkable = [];
  // Scan every tile to collect the walkable coordinates that can host enemies.
  for (let y = 0; y < overworldState.height; y++) {
    for (let x = 0; x < overworldState.width; x++) {
      if (overworldTileWalkable(overworldTileAt(x, y))) {
        walkable.push({ x, y });
      }
    }
  }

  // Avoid respawning enemies directly on top of Link's tile.
  const playerTile = {
    x: overworldState.moving ? overworldState.moveTo.x : overworldState.playerTileX,
    y: overworldState.moving ? overworldState.moveTo.y : overworldState.playerTileY
  };

  const available = walkable.filter((t) => !(t.x === playerTile.x && t.y === playerTile.y));

  for (const enemy of overworldState.enemies) {
    // Stop early if there are no safe tiles left to place a foe.
    if (available.length === 0) break;
    const choiceIndex = Math.floor(Math.random() * available.length);
    const spot = available.splice(choiceIndex, 1)[0];
    enemy.tileX = spot.x;
    enemy.tileY = spot.y;
    enemy.moveFrom = { x: spot.x, y: spot.y };
    enemy.moveTo = { x: spot.x, y: spot.y };
    enemy.moving = false;
    enemy.pauseTimer = 12;
    enemy.chasing = false;
    enemy.chaseTilesRemaining = 0;
  }
}

// Handle tile-based overworld movement using discrete steps between grid cells.
function updateOverworld() {
  const inputKeys = combinedInputKeys();

  // Animate roaming overworld enemies alongside player movement.
  updateOverworldEnemies();

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
    checkOverworldEnemyCollisions();
    if (handleOverworldEnemyCollision()) {
      return;
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

  checkOverworldEnemyCollisions();
  if (handleOverworldEnemyCollision()) {
    return;
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
      const px = overworldState.viewOffsetX + x * overworldState.tileSize;
      const py = overworldState.viewOffsetY + y * overworldState.tileSize;
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

  // Draw roaming overworld enemies with a small inset square so they stand apart from Link.
  for (const enemy of overworldState.enemies) {
    const enemyProgress = enemy.moving ? Math.min(1, enemy.moveTimer / enemy.moveDuration) : 0;
    const enemyBaseX = enemy.tileX * overworldState.tileSize;
    const enemyBaseY = enemy.tileY * overworldState.tileSize;
    const enemyOffsetX = enemy.moving ? (enemy.moveTo.x - enemy.moveFrom.x) * overworldState.tileSize * enemyProgress : 0;
    const enemyOffsetY = enemy.moving ? (enemy.moveTo.y - enemy.moveFrom.y) * overworldState.tileSize * enemyProgress : 0;
    const drawX = overworldState.viewOffsetX + enemyBaseX + enemyOffsetX;
    const drawY = overworldState.viewOffsetY + enemyBaseY + enemyOffsetY;
    ctx.fillStyle = enemy.type === 'beast' ? '#b44747' : '#7c6de6';
    ctx.fillRect(drawX + 4, drawY + 4, overworldState.tileSize - 8, overworldState.tileSize - 8);
    ctx.fillStyle = enemy.type === 'beast' ? '#6b2020' : '#4433aa';
    ctx.fillRect(drawX + 6, drawY + 6, overworldState.tileSize - 12, overworldState.tileSize - 12);
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
  const playerDrawX = overworldState.viewOffsetX + baseX + targetOffsetX * progress;
  const playerDrawY = overworldState.viewOffsetY + baseY + targetOffsetY * progress;

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

  drawHud();
}

