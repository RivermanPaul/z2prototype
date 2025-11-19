// Armos Knight enemy: creation, AI, collision helpers, and drawing.

// Create an Armos Knight that stands at the requested world coordinates.
function createArmosKnightAt(x, y) {
  return {
    x,
    y,
    width: TILE_SIZE,
    height: TILE_SIZE * 2,
    groundY: y,
    vx: 0,
    vy: 0,
    facing: -1,
    attacking: false,
    attackTimer: 0,
    attackWindup: 30,
    attackStab: 12,
    attackRecover: 18,
    attackCooldown: 180 + Math.floor(Math.random() * 60),
    attackHeight: 'high',
    hitTimer: 0,
    shieldHigh: true,
    shieldChangeTimer: 0,
    knockbackTimer: 0,
    gravity: 0.35,
    // Health pool so Link needs several clean hits to win the duel.
    hp: 6,
    lifeState: 'alive',
    deathTimer: 0,
    // Track whether the current sword swing already bounced off Link's shield.
    blockedThisSwing: false,
    // Distance control helpers so the knight can shuffle around Link.
    desiredRange: TILE_SIZE * 1.6,
    shuffleAmplitude: TILE_SIZE * 0.4,
    shufflePeriod: 150,
    engageRange: TILE_SIZE * 6,
    walkSpeed: 0.9,
    walkResponsiveness: 0.05,
    walkTimer: 0,
    walkTargetX: x,
    walking: false,
    walkAnimTimer: 0,
    walkAnimFrame: 0,
    lastWalkStep: 0,
    get attackDuration() {
      return this.attackWindup + this.attackStab + this.attackRecover;
    }
  };
}

// Trigger the Armos Knight's death animation so he pops upward and fades out.
function startArmosKnightDeath(knight, knockDir = 0) {
  knight.lifeState = 'dying';
  knight.deathTimer = 36;
  knight.attacking = false;
  knight.attackTimer = 0;
  knight.attackCooldown = 9999;
  knight.hitTimer = 0;
  knight.knockbackTimer = 0;
  knight.walking = false;
  knight.walkAnimTimer = 0;
  knight.walkAnimFrame = 0;
  knight.blockedThisSwing = false;
  const launchDir = knockDir !== 0 ? knockDir : knight.facing;
  knight.vx = launchDir * 2.4;
  knight.vy = -5.5;
}

// Advance the Armos Knight's idle, shield, and attack timers.
function updateArmosKnight(knight) {
  // Skip any processing once the knight already faded away.
  if (knight.lifeState === 'dead') return;

  // Play the short defeat arc and let the poof timer tick down.
  if (knight.lifeState === 'dying') {
    knight.vy += knight.gravity;
    knight.x += knight.vx;
    knight.y += knight.vy;
    knight.vx *= 0.92;

    // Stop falling once he returns to the ground plane.
    if (knight.y >= knight.groundY) {
      knight.y = knight.groundY;
      knight.vy = 0;
    }

    if (knight.deathTimer > 0) {
      knight.deathTimer--;
    }
    if (knight.deathTimer === 0) {
      spawnEnemyPoof(knight.x + knight.width / 2, knight.y + knight.height / 2);
      spawnCoinFromEnemy(
        knight.x,
        knight.y,
        knight.width,
        knight.height,
        GAME_MODE_SIDE_SCROLL
      );
      knight.lifeState = 'dead';
    }
    return;
  }

  const playerCenter = player.x + player.width / 2;
  const knightCenter = knight.x + knight.width / 2;
  // Face toward Link so the shield and sword always orient correctly.
  knight.facing = playerCenter < knightCenter ? -1 : 1;

  // Count down the brief hit flash timer if the knight was recently struck.
  if (knight.hitTimer > 0) {
    knight.hitTimer--;
  }

  // Apply horizontal knockback velocity while the recoil timer is still active.
  if (knight.knockbackTimer > 0) {
    knight.x += knight.vx;
    knight.vx *= 0.85;
    knight.knockbackTimer--;
  } else if (Math.abs(knight.vx) > 0.01) {
    // Stop any tiny drift that remains once the recoil period ends.
    knight.vx = 0;
  }

  // Determine whether Link is close enough to trigger the knight's footwork.
  const distanceToPlayer = Math.abs(playerCenter - knightCenter);
  const engaging = distanceToPlayer <= knight.engageRange;
  // Compute the minimum safe spacing so the knight's body never willingly overlaps Link's.
  const minBodyDistance = (player.width + knight.width) / 2 + 2;
  let walkStep = 0;
  // Only walk when not recoiling so the knockback has visible impact.
  if (engaging && knight.knockbackTimer === 0) {
    knight.walkTimer++;
    // Shuffle forward/backward using a sine wave so the knight drifts in and out of range.
    const shufflePhase = (knight.walkTimer / knight.shufflePeriod) * Math.PI * 2;
    const shuffleOffset = Math.sin(shufflePhase) * knight.shuffleAmplitude;
    // Clamp the desired distance so the shuffle pattern never pulls the knight into body contact.
    const targetDistance = Math.max(minBodyDistance, knight.desiredRange + shuffleOffset);
    const desiredCenter = playerCenter - knight.facing * targetDistance;
    const desiredX = desiredCenter - knight.width / 2;
    // Smoothly chase the desired position so Link can rush in before the knight reacts.
    knight.walkTargetX += (desiredX - knight.walkTargetX) * knight.walkResponsiveness;
    const delta = knight.walkTargetX - knight.x;
    const maxStep = knight.walkSpeed;
    walkStep = Math.max(-maxStep, Math.min(maxStep, delta));
    knight.x += walkStep;
  } else if (!engaging) {
    // Reset the target point when disengaged so he holds his ground.
    knight.walkTimer = 0;
    knight.walkTargetX = knight.x;
  }
  knight.lastWalkStep = walkStep;
  knight.walking = Math.abs(walkStep) > 0.02;
  // Update the foot cycle whenever the knight is actively marching.
  if (knight.walking) {
    knight.walkAnimTimer++;
    if (knight.walkAnimTimer >= WALK_ANIM_FRAME_DURATION) {
      knight.walkAnimTimer = 0;
      knight.walkAnimFrame = (knight.walkAnimFrame + 1) % 2;
    }
  } else {
    knight.walkAnimTimer = 0;
    knight.walkAnimFrame = 0;
  }

  // When the knight is swinging, keep ticking through the attack animation frames.
  if (knight.attacking) {
    knight.attackTimer++;
    // Return to idle once the windup, stab, and recovery have all played out.
    if (knight.attackTimer >= knight.attackDuration) {
      knight.attacking = false;
      knight.attackTimer = 0;
      knight.attackCooldown = 180 + Math.floor(Math.random() * 60);
      knight.blockedThisSwing = false;
    }
  } else {
    // Count down the idle cooldown until it is time to launch another strike.
    if (knight.attackCooldown > 0) {
      knight.attackCooldown--;
    }
    // Start a new attack sequence once the cooldown elapses.
    if (knight.attackCooldown <= 0) {
      knight.attacking = true;
      knight.attackTimer = 0;
      knight.attackHeight = Math.random() < 0.5 ? 'high' : 'low';
      knight.blockedThisSwing = false;
    }
  }

  // Only consider changing shield positions when Link is not applying pressure.
  if (!player.attacking) {
    knight.shieldChangeTimer++;
    // Every two seconds roll a coin flip to potentially swap the shield height.
    if (knight.shieldChangeTimer >= 120) {
      knight.shieldChangeTimer = 0;
      // Flip the stance roughly half the time to keep Link guessing.
      if (Math.random() < 0.5) {
        knight.shieldHigh = !knight.shieldHigh;
      }
    }
  } else {
    // Reset the timer while Link is mid-attack so the cadence restarts afterward.
    knight.shieldChangeTimer = 0;
  }
}

// Build the knight's shield collision box for the current pose so Link's sword can bounce off of it.
function knightShieldHitbox(knight) {
  const shieldWidth = TILE_SIZE * 0.6;
  const shieldHeight = TILE_SIZE - 2;
  const shieldX = knight.facing > 0
    ? knight.x + knight.width - shieldWidth + 1
    : knight.x - 1;
  const shieldY = knight.shieldHigh
    ? knight.y + 2
    : knight.y + knight.height - shieldHeight;
  return {
    x: shieldX,
    y: shieldY,
    width: shieldWidth,
    height: shieldHeight
  };
}

// Determine which segment of the attack animation is currently playing for the knight.
function knightAttackPhase(knight) {
  if (!knight.attacking) return 'idle';
  const t = knight.attackTimer;
  if (t < knight.attackWindup) return 'windup';
  if (t < knight.attackWindup + knight.attackStab) return 'stab';
  return 'recover';
}

// Compute the sword's rectangle for rendering and collision so they always stay in sync.
function knightSwordPose(knight) {
  const phase = knightAttackPhase(knight);
  if (phase === 'idle') return null;

  const swordWidth = 4;
  let swordLength = TILE_SIZE;
  let forwardAdjust = 0;

  // Gradually pull the sword back during the windup to create a telegraphed motion.
  if (phase === 'windup') {
    const windupProgress = knight.attackWindup === 0
      ? 1
      : knight.attackTimer / knight.attackWindup;
    swordLength = TILE_SIZE * 0.8;
    forwardAdjust = -swordLength * (1 - windupProgress);
  // Ease the sword back toward the body while recovering from a stab.
  } else if (phase === 'recover') {
    const recoverElapsed = knight.attackTimer - (knight.attackWindup + knight.attackStab);
    const recoverDuration = Math.max(1, knight.attackRecover);
    const recoverProgress = Math.min(1, recoverElapsed / recoverDuration);
    swordLength = TILE_SIZE * 0.8;
    forwardAdjust = -swordLength * recoverProgress * 0.8;
  }

  const swordX = knight.facing > 0
    ? knight.x + knight.width + forwardAdjust
    : knight.x - swordLength - forwardAdjust;
  const verticalOffset = knight.attackHeight === 'high'
    ? 4
    : knight.height - TILE_SIZE / 2;
  const swordY = knight.y + verticalOffset - (phase === 'windup' ? 2 : 0);

  return {
    phase,
    rect: {
      x: swordX,
      y: swordY,
      width: swordLength,
      height: swordWidth
    }
  };
}

// Create the knight's sword hitbox whenever the attack animation reaches the active stab frames.
function knightSwordHitbox(knight) {
  const pose = knightSwordPose(knight);
  // Abort when the knight is not currently swinging the sword.
  if (!pose || pose.phase !== 'stab') return null;
  return pose.rect;
}

// Evaluate collisions between Link and the Armos Knight, including sword clashes and body bumps.
function handleArmosKnightVsPlayer(knight) {
  // Skip further collision checks once the knight is defeated.
  if (knight.lifeState !== 'alive') return;

  const sword = swordHitbox();
  const knightShield = knightShieldHitbox(knight);
  const playerBox = {
    x: player.x,
    y: player.y,
    width: player.width,
    height: player.height
  };
  // Only attempt to damage the knight when Link is mid-stab and the shield does not intercept the blade.
  if (sword && knight.hitTimer === 0) {
    const swordBlocked = rectsOverlap(sword, knightShield);
    // Only register damage if the blade sneaks around the shield and touches the body.
    if (!swordBlocked && rectsOverlap(sword, knight)) {
      knight.hp--;
      // Launch a death animation once health reaches zero.
      if (knight.hp <= 0) {
        startArmosKnightDeath(knight, player.facing);
        return;
      }
      knight.hitTimer = 14;
      const knockDir = player.facing;
      knight.vx = knockDir * 2.5;
      knight.knockbackTimer = 12;
    } else if (swordBlocked && !player.blockedThisSwing) {
      // Recoil Link slightly when the shield successfully blocks the strike.
      const recoilDir = player.facing;
      player.x -= recoilDir * 1.5;
      player.vx = -recoilDir * 2.0;
      player.vy = Math.min(player.vy, -1);
      player.blockedThisSwing = true;
      // Also push the knight backward so the clash feels mutual.
      knight.vx = recoilDir * 1.6;
      knight.knockbackTimer = Math.max(knight.knockbackTimer, 8);
    }
  }

  // Treat the knight like a solid enemy so touching it hurts Link.
  if (player.hitTimer === 0) {
    // Apply damage when Link's hurtbox overlaps the knight's body.
    if (rectsOverlap(playerBox, knight)) {
      player.hitTimer = 24;
      const playerCenter = player.x + player.width / 2;
      const enemyCenter = knight.x + knight.width / 2;
      const dir = playerCenter < enemyCenter ? -1 : 1;

      // Push Link to whichever side he should bounce away toward.
      if (dir < 0) {
        player.x = knight.x - player.width - 1;
      } else {
        player.x = knight.x + knight.width + 1;
      }

      player.vx = dir * 3.2;
      player.vy = -4;
      player.attacking = false;
      player.attackTimer = 0;
      player.blockedThisSwing = false;
    }
  }

  const knightSword = knightSwordHitbox(knight);
  // Let the knight's sword harm Link when it slips past the hero's shield.
  if (knightSword && player.hitTimer === 0) {
    const shieldBox = shieldHitbox();
    const swordHitsPlayer = rectsOverlap(knightSword, playerBox);
    const shieldBlocksSword = rectsOverlap(knightSword, shieldBox);
    // Hurt Link only when the sword overlaps his body without being blocked by the shield.
    if (swordHitsPlayer && !shieldBlocksSword) {
      player.hitTimer = 24;
      const playerCenter = player.x + player.width / 2;
      const enemyCenter = knight.x + knight.width / 2;
      const dir = playerCenter < enemyCenter ? -1 : 1;
      player.vx = dir * 3.2;
      player.vy = -4;
      player.x += dir * 1.5;
      player.attacking = false;
      player.attackTimer = 0;
      player.blockedThisSwing = false;
    } else if (shieldBlocksSword && !knight.blockedThisSwing) {
      // Bounce both fighters apart when Link successfully blocks the stab.
      const blockDir = knight.facing;
      player.vx = blockDir * 1.6;
      player.x += blockDir * 0.5;
      player.vy = Math.min(player.vy, -1);
      knight.vx = -blockDir * 2.2;
      knight.knockbackTimer = Math.max(knight.knockbackTimer, 10);
      knight.blockedThisSwing = true;
    }
  }
}

// Render the Armos Knight along with its shield and sword indicators.
function drawArmosKnight(knight) {
  // Do not draw the knight after the poof ends.
  if (knight.lifeState === 'dead') return;

  const renderX = Math.floor(knight.x - cameraX);
  const renderY = Math.floor(knight.y);
  const w = knight.width;
  const h = knight.height;
  const fading = knight.lifeState === 'dying';

  // Fade the sprite out as the death animation wraps up.
  if (fading) {
    const fade = Math.max(0, knight.deathTimer) / 36;
    ctx.save();
    ctx.globalAlpha = 0.25 + fade * 0.75;
  }

  // Flash white while in hitstun to provide quick feedback.
  if (knight.hitTimer > 0 && (knight.hitTimer % 4 < 2)) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = '#a04040';
  }
  ctx.fillRect(renderX, renderY, w, h);

  // Draw a darker trim to hint at armor plating.
  ctx.fillStyle = '#702828';
  ctx.fillRect(renderX, renderY, w, 4);
  ctx.fillRect(renderX, renderY + h - 4, w, 4);

  // Simple footfalls that alternate height while walking.
  const footHeight = 4;
  const footBaseY = renderY + h - footHeight;
  const legWidth = Math.floor(w / 2);
  const leftLift = knight.walking && knight.walkAnimFrame === 0 ? 2 : 0;
  const rightLift = knight.walking && knight.walkAnimFrame === 1 ? 2 : 0;
  ctx.fillStyle = '#651a1a';
  ctx.fillRect(renderX, footBaseY - leftLift, legWidth, footHeight);
  ctx.fillRect(renderX + legWidth, footBaseY - rightLift, w - legWidth, footHeight);

  // Depict the helmet with a lighter band.
  ctx.fillStyle = '#d89060';
  ctx.fillRect(renderX, renderY, w, Math.floor(TILE_SIZE / 2));

  if (!fading) {
    const shield = knightShieldHitbox(knight);
    ctx.fillStyle = '#c4c8d8';
    ctx.fillRect(Math.floor(shield.x - cameraX), Math.floor(shield.y), shield.width, shield.height);
    ctx.fillStyle = '#8a8fa8';
    ctx.fillRect(Math.floor(shield.x - cameraX) + 1, Math.floor(shield.y) + 2, shield.width - 2, shield.height - 4);

    const swordPose = knightSwordPose(knight);
    // Only draw the sword when the animation is active.
    if (swordPose) {
      const { rect, phase } = swordPose;
      const swordScreenX = Math.floor(rect.x - cameraX);
      const swordScreenY = Math.floor(rect.y);
      ctx.fillStyle = phase === 'windup' ? '#ffd480' : '#f0f0f0';
      ctx.fillRect(swordScreenX, swordScreenY, rect.width, rect.height);
      // Add a subtle glow during the windup so players can spot the upcoming strike.
      if (phase === 'windup') {
        ctx.fillStyle = 'rgba(255, 215, 130, 0.35)';
        ctx.fillRect(swordScreenX - 1, swordScreenY - 1, rect.width + 2, rect.height + 2);
      }
      ctx.fillStyle = '#c8a060';
      const hiltX = knight.facing > 0
        ? Math.floor(knight.x + knight.width - cameraX)
        : Math.floor(knight.x - 6 - cameraX);
      ctx.fillRect(hiltX, swordScreenY - 2, 6, 2);
    }
  }

  if (fading) {
    ctx.restore();
  }
}

