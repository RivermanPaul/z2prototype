// Town Spearman enemy: creation, AI, collision helpers, and drawing for the raised-view town.

// Store short-lived particle bursts for town-only effects like the spearman's defeat poof.
const townParticles = [];

// Build a Town Spearman positioned at the requested plaza coordinates.
function createTownSpearmanAt(x, z, facing = 1) {
  return {
    x,
    z,
    y: z,
    width: TILE_SIZE,
    height: Math.floor(TILE_SIZE * 1.5),
    // Marching speed along the horizontal axis so the spearman constantly advances.
    speed: 1.2,
    vx: 1.2 * facing,
    // Optional depth drift when steering around walls.
    vz: 0.8,
    verticalDir: Math.random() < 0.5 ? -1 : 1,
    swapVerticalNext: Math.random() < 0.5,
    movingVertically: false,
    facing,
    state: 'patrol',
    vy: 0,
    gravity: 0.35,
    poofed: false
  };
}

// Update a spearman's movement and defeat animation. Returns true while the enemy remains active.
function updateTownSpearman(spearman) {
  // Skip any further updates once the spearman already vanished after its poof.
  if (spearman.state === 'vanished') {
    return false;
  }

  // Play out the knockback arc when defeated instead of normal patrol logic.
  if (spearman.state === 'defeated') {
    // Apply the airborne arc motion.
    spearman.x += spearman.vx;
    spearman.y += spearman.vy;
    spearman.vy += spearman.gravity;

    // End the arc once the spearman lands back on the plaza surface.
    if (spearman.y >= spearman.z) {
      spearman.y = spearman.z;
      // Emit a tiny poof the first frame he touches down after being struck.
      if (!spearman.poofed) {
        spawnTownPoof(spearman.x + spearman.width / 2, spearman.y + spearman.height / 2);
        spearman.poofed = true;
      }
      // Remove the enemy after the effect plays.
      spearman.state = 'vanished';
      return false;
    }
    return true;
  }

  // Continue walking in the facing direction using a fixed velocity.
  const proposedX = spearman.x + spearman.vx;
  const withinLeftBound = proposedX >= 0;
  const withinRightBound = proposedX + spearman.width <= TOWN_AREA_WIDTH;
  const horizontalBlocked = !withinLeftBound || !withinRightBound ||
    townRectVsWorld(proposedX, spearman.z, spearman.width, spearman.height);

  // When blocked horizontally, start sliding along the wall using vertical motion.
  if (horizontalBlocked) {
    spearman.movingVertically = true;
  } else {
    // Advance normally whenever the forward path is clear.
    spearman.x = proposedX;
  }

  // Compute whether we should currently apply a vertical steering component.
  const shouldSlideVertically = spearman.movingVertically;
  if (shouldSlideVertically) {
    const proposedZ = spearman.z + spearman.vz * spearman.verticalDir;
    const verticalBlocked = townRectVsWorld(spearman.x, proposedZ, spearman.width, spearman.height);

    // Flip directions when colliding with scenery above/below so the spearman bounces along the obstacle.
    if (verticalBlocked) {
      if (spearman.swapVerticalNext) {
        spearman.verticalDir *= -1;
      } else {
        spearman.facing *= -1;
        spearman.vx *= -1;
        spearman.movingVertically = false;
      }
      spearman.swapVerticalNext = !spearman.swapVerticalNext;
    } else {
      // Apply the slide along the current vertical direction.
      spearman.z = proposedZ;
      spearman.y = spearman.z;
    }

    // Stop sliding once the forward tile opens up again.
    const forwardClear = spearman.x + spearman.vx >= 0 &&
      spearman.x + spearman.vx + spearman.width <= TOWN_AREA_WIDTH &&
      !townRectVsWorld(spearman.x + spearman.vx, spearman.z, spearman.width, spearman.height);
    if (forwardClear) {
      spearman.movingVertically = false;
    }
  } else {
    // Keep the vertical coordinate glued to the ground plane when not sliding.
    spearman.y = spearman.z;
  }

  return true;
}

// Resolve sword and body collisions between Link and a spearman.
function handleTownSpearmanVsPlayer(spearman) {
  // Ignore defeated enemies so their arc doesn't hurt Link.
  if (spearman.state !== 'patrol') return;

  const sword = swordHitbox();
  const spearmanBox = {
    x: spearman.x,
    y: spearman.y,
    width: spearman.width,
    height: spearman.height
  };
  const playerCenter = player.x + player.width / 2;
  const spearmanCenter = spearman.x + spearman.width / 2;

  // One clean sword hit defeats the spearman instantly.
  if (sword && rectsOverlap(sword, spearmanBox)) {
    spearman.state = 'defeated';
    const awayFromPlayer = Math.sign(spearmanCenter - playerCenter) || 1;
    spearman.vx = awayFromPlayer * 3.2;
    spearman.vy = -5;
    return;
  }

  // Only apply damage when Link is currently vulnerable.
  if (player.hitTimer === 0) {
    const playerBox = {
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height
    };
    // Trigger hurt state when the spearman's body overlaps Link.
    if (rectsOverlap(playerBox, spearmanBox)) {
      player.hitTimer = 24;
      const dir = playerCenter < spearmanCenter ? -1 : 1;
      player.vx = dir * 3.0;
      player.vy = -4;
      player.attacking = false;
      player.attackTimer = 0;
      player.blockedThisSwing = false;
    }
  }
}

// Draw the spearman using simple rectangles and facing cues.
function drawTownSpearman(spearman) {
  const x = Math.floor(spearman.x - cameraX);
  const y = Math.floor(spearman.y);
  const w = spearman.width;
  const h = spearman.height;

  // Dim defeated spearmen so their flight reads separately from active patrols.
  if (spearman.state === 'defeated') {
    ctx.fillStyle = '#c0c0c0';
  } else {
    ctx.fillStyle = '#3c70b0';
  }
  ctx.fillRect(x, y, w, h);

  // Spear shaft sticking out ahead of the spearman.
  const spearLength = TILE_SIZE;
  const spearWidth = 3;
  const spearX = spearman.facing > 0 ? x + w - 1 : x - spearLength + 1;
  const spearY = y + Math.floor(h * 0.35);
  ctx.fillStyle = '#c09060';
  ctx.fillRect(spearX, spearY, spearLength, spearWidth);

  // Spear tip.
  ctx.fillStyle = '#e0e0f0';
  const tipX = spearman.facing > 0 ? spearX + spearLength - 2 : spearX;
  ctx.fillRect(tipX, spearY - 1, 3, spearWidth + 2);
}

// Emit a small burst of particles used for the spearman's defeat poof.
function spawnTownPoof(x, y) {
  const count = 6;
  // Emit a handful of evenly fanned particles to suggest a puff of smoke.
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 1.0 + Math.random() * 0.8;
    townParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6 - 0.4,
      life: 18
    });
  }
}

// Advance the lifetime and movement of active town particle effects.
function updateTownParticles() {
  // Update each particle's position and fade over time.
  for (const p of townParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life--;
  }
  // Remove any particles that have finished their brief lifespan.
  for (let i = townParticles.length - 1; i >= 0; i--) {
    if (townParticles[i].life <= 0) {
      townParticles.splice(i, 1);
    }
  }
}

// Render active town particles relative to the current camera.
function drawTownParticles() {
  for (const p of townParticles) {
    ctx.fillStyle = 'rgba(255, 220, 200, 0.85)';
    ctx.fillRect(Math.floor(p.x - cameraX), Math.floor(p.y), 2, 2);
  }
}
