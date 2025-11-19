// Octorok enemy: creation, AI, projectiles, collision helpers, particles, and drawing.

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
    idleAnimFrame: 0,
    // Track a small health pool so Link needs multiple strikes to defeat the octorok.
    hp: 2,
    // Separate lifecycle state machine so we can play a death animation.
    lifeState: 'alive',
    deathTimer: 0
  };
}

// Kick off the octorok's defeat sequence so it can play a brief poof before disappearing.
function startOctorokDeath(octorok) {
  octorok.lifeState = 'dying';
  octorok.deathTimer = 26;
  octorok.hitTimer = 0;
  // Pop upward and freeze its AI movement while the poof counts down.
  octorok.vx = 0;
  octorok.vy = -3.2;
  octorok.onGround = false;
}

// Spawn a generic defeat poof so enemies vanish with a little flourish.
function spawnEnemyPoof(x, y) {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 1.2 + Math.random() * 0.6;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.8 - 0.4,
      life: 22
    });
  }
}

// Draw the octorok enemy with its simple animation cues.
function drawOctorok(octorok) {
  // Skip rendering once the death poof completed.
  if (octorok.lifeState === 'dead') return;

  const x = Math.floor(octorok.x - cameraX);
  const y = Math.floor(octorok.y);
  const w = octorok.width;
  const h = octorok.height;
  const fading = octorok.lifeState === 'dying';

  // Fade the sprite out as the death timer approaches zero.
  if (fading) {
    const fade = Math.max(0, octorok.deathTimer) / 26;
    ctx.save();
    ctx.globalAlpha = 0.25 + fade * 0.75;
  }
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

  if (fading) {
    ctx.restore();
  }
}

// Create a new octorok projectile and add it to the active list.
function spawnRock(x, y, vx, vy) {
  rocks.push({
    x,
    y,
    vx,
    vy,
    size: 6,
    alive: true
  });
}

// Emit a radial burst of particles when a rock shatters.
function spawnRockExplosion(x, y) {
  const count = 8;
  // Launch each particle in an even spread to mimic a burst.
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 1.5 + Math.random();
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 18
    });
  }
}

// Move active projectiles and particles while handling their collisions.
function updateRocksAndParticles() {
  // Rocks
  // Step through each projectile to update its physics and collisions.
  for (const rock of rocks) {
    // Skip rocks that already exploded so they don't keep updating.
    if (!rock.alive) continue;
    rock.x += rock.vx;
    rock.y += rock.vy;

    const rockBox = {
      x: rock.x,
      y: rock.y,
      width: rock.size,
      height: rock.size
    };

    const shieldBox = shieldHitbox();
    const playerBox = {
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height
    };

    let exploded = false;
    // Shield blocks the rock
    if (rectsOverlap(rockBox, shieldBox)) {
      exploded = true;
    } else if (rectsOverlap(rockBox, playerBox) && player.hitTimer === 0) {
      // Hit the player
      player.hitTimer = 24;
      const playerCenter = player.x + player.width / 2;
      const projCenter = rock.x + rock.size / 2;
      const dir = playerCenter < projCenter ? -1 : 1;
      player.vx = dir * 3.0;
      player.vy = -4;
      player.attacking = false;
      player.attackTimer = 0;
      player.blockedThisSwing = false;
      exploded = true;
    }

    // Offscreen
    // Blow up the projectile if it wanders far outside the current view to keep arrays small.
    const offscreenPadding = TILE_SIZE * 4;
    const viewLeft = cameraX - offscreenPadding;
    const viewRight = cameraX + canvas.width + offscreenPadding;
    const viewTop = -offscreenPadding;
    const viewBottom = canvas.height + offscreenPadding;
    if (rock.x + rock.size < viewLeft || rock.x > viewRight ||
        rock.y + rock.size < viewTop || rock.y > viewBottom) {
      exploded = true;
    }

    // Convert the rock into particles after any collision or despawn event.
    if (exploded) {
      rock.alive = false;
      spawnRockExplosion(rock.x + rock.size / 2, rock.y + rock.size / 2);
    }
  }

  // Compact rocks array
  // Walk the array backwards so splices do not skip entries.
  for (let i = rocks.length - 1; i >= 0; i--) {
    // Remove any rock marked as dead to prevent future updates.
    if (!rocks[i].alive) rocks.splice(i, 1);
  }

  // Particles
  // Update each particle's position and fade over time.
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life--;
  }
  // Clean up expired particles from the tail end first.
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

// Advance the octorok AI, including movement, attacks, and reactions to damage.
function updateOctorok(octorok) {
  // Skip any further processing once the enemy finished its death poof.
  if (octorok.lifeState === 'dead') return;

  // Play out the short death hop and despawn timer before removing the body.
  if (octorok.lifeState === 'dying') {
    octorok.vy += octorok.gravity;
    if (octorok.vy > octorok.maxFall) octorok.vy = octorok.maxFall;

    const newY = octorok.y + octorok.vy;
    if (!rectVsWorld(octorok.x, newY, octorok.width, octorok.height)) {
      octorok.y = newY;
      octorok.onGround = false;
    } else {
      // Land on the ground and stop falling.
      while (!rectVsWorld(octorok.x, octorok.y + 1, octorok.width, octorok.height)) {
        octorok.y += 1;
      }
      octorok.vy = 0;
      octorok.onGround = true;
    }

    // Fade away after the brief death timer expires.
    if (octorok.deathTimer > 0) {
      octorok.deathTimer--;
    }
    if (octorok.deathTimer === 0) {
      spawnEnemyPoof(octorok.x + octorok.width / 2, octorok.y + octorok.height / 2);
      spawnCoinFromEnemy(
        octorok.x,
        octorok.y,
        octorok.width,
        octorok.height,
        GAME_MODE_SIDE_SCROLL
      );
      octorok.lifeState = 'dead';
    }
    return;
  }

  octorok.prevVy = octorok.vy;

  // State machine: jump+shoot -> wait -> ground shoot -> wait -> repeat
  // Disabled while in hitstun
  // Only process the AI state machine when not currently in hitstun.
  if (octorok.hitTimer === 0) {
    // React only to the two waiting states because the others are instantaneous.
    if (octorok.state === 'waitAfterShot' || octorok.state === 'waitAfterJump') {
      // Count down the wait timer until it reaches zero.
      if (octorok.stateTimer > 0) {
        octorok.stateTimer--;
      }
      // Transition once the wait timer completes.
      if (octorok.stateTimer <= 0) {
        // Start the aerial attack cycle after finishing the post-shot delay.
        if (octorok.state === 'waitAfterShot') {
          // Begin jump phase
          // Initiate the jump only when the enemy is standing on ground.
          if (octorok.onGround) {
            octorok.vy = octorok.jumpSpeed;
            octorok.onGround = false;
          }
          octorok.shotThisJump = false;
          octorok.state = 'jump';
        // Fire a grounded shot when emerging from the waiting state after a jump.
        } else if (octorok.state === 'waitAfterJump') {
          // Grounded shot
          const mouthSize = 4;
          const mouthX = octorok.x - 2;
          const mouthY = octorok.y + octorok.height / 2 - mouthSize / 2;
          spawnRock(mouthX - 2, mouthY, -2.5, 0);
          // Now wait again before the next jump+shoot
          octorok.state = 'waitAfterShot';
          octorok.stateTimer = 60;
        }
      }
    }
  }

  // Gravity
  octorok.vy += octorok.gravity;
  // Clamp falling speed so gravity does not accelerate forever.
  if (octorok.vy > octorok.maxFall) octorok.vy = octorok.maxFall;

  // Horizontal movement from knockback
  let newX = octorok.x + octorok.vx;
  // Move horizontally only if the destination is not blocked by terrain.
  if (!rectVsWorld(newX, octorok.y, octorok.width, octorok.height)) {
    octorok.x = newX;
  } else {
    octorok.vx = 0;
  }

  // Vertical collision
  let newY = octorok.y + octorok.vy;
  // Apply vertical motion as long as the body is not intersecting the map.
  if (!rectVsWorld(octorok.x, newY, octorok.width, octorok.height)) {
    octorok.y = newY;
    octorok.onGround = false;
  } else {
    // Resolve downward collisions differently from upward collisions.
    if (octorok.vy > 0) {
      // Step the sprite down until touching ground so it lands cleanly.
      while (!rectVsWorld(octorok.x, octorok.y + 1, octorok.width, octorok.height)) {
        octorok.y += 1;
      }
      octorok.onGround = true;
      // When a jump finishes, transition into the waiting state.
      if (octorok.state === 'jump') {
        octorok.state = 'waitAfterJump';
        octorok.stateTimer = 60;
      }
    } else if (octorok.vy < 0) {
      // Step upward until the head clears the ceiling to avoid clipping.
      while (!rectVsWorld(octorok.x, octorok.y - 1, octorok.width, octorok.height)) {
        octorok.y -= 1;
      }
    }
    octorok.vy = 0;
  }

  // Friction on ground for knockback
  // Apply friction only when grounded so knockback tapers off.
  if (octorok.onGround) {
    octorok.vx *= 0.85;
    // Zero-out extremely tiny velocities to avoid jittering.
    if (Math.abs(octorok.vx) < 0.05) octorok.vx = 0;
  }

  const wasHit = octorok.hitTimer > 0;
  // Count down hitstun frames until the enemy recovers.
  if (octorok.hitTimer > 0) {
    octorok.hitTimer--;
  }

  // Shoot a rock at the apex of the jump during the jump phase (no shooting while in hitstun)
  if (octorok.hitTimer === 0 &&
      !octorok.onGround && !octorok.shotThisJump &&
      octorok.prevVy <= 0 && octorok.vy > 0 &&
      octorok.state === 'jump') {
    const mouthSize = 4;
    const mouthX = octorok.x - 2;
    const mouthY = octorok.y + octorok.height / 2 - mouthSize / 2;
    spawnRock(mouthX - 2, mouthY, -2.5, 0);
    octorok.shotThisJump = true;
  }

  // When hitstun ends, reset the pattern
  if (wasHit && octorok.hitTimer === 0) {
    octorok.state = 'waitAfterShot';
    octorok.stateTimer = 60;
    octorok.shotThisJump = false;
  }

  // Tick the idle animation timer every frame so it loops forever.
  octorok.idleAnimTimer++;
  // Advance to the next idle frame once the configured duration elapses.
  if (octorok.idleAnimTimer >= OCTOROK_IDLE_FRAME_DURATION) {
    octorok.idleAnimTimer = 0;
    octorok.idleAnimFrame = (octorok.idleAnimFrame + 1) % 2;
  }
}

  // Resolve Link's sword strikes and collision responses against a specific octorok.
function handleOctorokPlayerInteractions(octorok) {
  // Ignore defeated enemies so their bodies no longer interact.
  if (octorok.lifeState !== 'alive') return;

  const sword = swordHitbox();
  // Only damage the enemy when Link is actively stabbing and the octorok is vulnerable.
  if (sword && rectsOverlap(sword, octorok) && octorok.hitTimer === 0) {
    octorok.hp--;
    // Play a brief hit flash whenever health remains.
    if (octorok.hp > 0) {
      octorok.hitTimer = 10;
      const knockDir = player.facing;
      octorok.vx = 3 * knockDir;
      octorok.vy = -2.5;
    } else {
      startOctorokDeath(octorok);
    }
  }

  // Evaluate body collisions only when Link is not already recovering from damage.
  if (player.hitTimer === 0) {
    const playerBox = {
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height
    };
    // Trigger knockback and invulnerability when Link bumps into the enemy.
    if (rectsOverlap(playerBox, octorok)) {
      player.hitTimer = 24;
      const playerCenter = player.x + player.width / 2;
      const enemyCenter = octorok.x + octorok.width / 2;
      const dir = playerCenter < enemyCenter ? -1 : 1;

      // Immediately separate horizontally so we don't stay overlapping.
      // Push Link to the left when he was positioned on that side of the enemy.
      if (dir < 0) {
        player.x = octorok.x - player.width - 1;
      } else {
        player.x = octorok.x + octorok.width + 1;
      }

      player.vx = dir * 3.2;
      player.vy = -4;
      player.attacking = false;
      player.attackTimer = 0;
      player.blockedThisSwing = false;
    }
  }
}

