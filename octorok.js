// Octorok enemy: creation, AI, collision helpers, and drawing.

// Build an octorok instance positioned at the requested world coordinates.
function createOctorokAt(x, y) {
  return {
    x,
    y,
    width: TILE_SIZE,
    height: TILE_SIZE,
    vx: 0,
    vy: 0,
    gravity: 0.30,
    maxFall: 8,
    onGround: false,
    jumpSpeed: -3.4,
    hitTimer: 0,
    prevVy: 0,
    shotThisJump: false,
    state: 'waitAfterShot',
    stateTimer: 120,
    idleAnimTimer: 0,
    idleAnimFrame: 0
  };
}

// Draw the octorok enemy with its simple animation cues.
function drawOctorok(octorok) {
  const x = Math.floor(octorok.x - cameraX);
  const y = Math.floor(octorok.y);
  const w = octorok.width;
  const h = octorok.height;
  // Compute the small bobbing offset used by the idle animation.
  const bobOffset = octorok.idleAnimFrame === 0 ? 0 : 1;
  // Compute how far the tentacles lift to create a two-frame cycle.
  const tentacleLift = octorok.idleAnimFrame === 0 ? 0 : 2;

  // Flash when hit.
  if (octorok.hitTimer > 0 && (octorok.hitTimer % 4 < 2)) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = '#ff7040';
  }
  ctx.fillRect(x, y + bobOffset, w, h - bobOffset);

  // Simple eyes.
  ctx.fillStyle = '#000000';
  // Offset the eyes upward during the lifted frame so the whole sprite moves.
  const eyeY = y + 4 + bobOffset - (octorok.idleAnimFrame === 0 ? 0 : 1);
  ctx.fillRect(x + 3, eyeY, 3, 3);
  ctx.fillRect(x + w - 6, eyeY, 3, 3);

  // Little mouth on its left side.
  ctx.fillStyle = '#602020';
  ctx.fillRect(x + 2, y + h - 4 - tentacleLift, 4, 3);
}

