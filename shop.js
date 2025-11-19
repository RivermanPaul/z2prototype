// Shop interior logic: tile generation, visit state, purchasing, and rendering of wares.

// Track per-visit availability and timers for each shop item.
const shopVisitState = {
  pulse: 0,
  items: []
};

// Define the wares sold inside the town shops along with their prices and healing effects.
const SHOP_ITEMS = [
  { id: 'onigiri', label: 'onigiri', cost: 1, heal: 1, icon: 'onigiri' },
  { id: 'dango', label: 'dango', cost: 2, heal: 3, icon: 'dango' },
  { id: 'niku-udon', label: 'niku udon', cost: 3, heal: 'full', icon: 'udon' }
];

// Build the visit state array so each item tracks its own availability and post-purchase cooldown.
function resetShopState() {
  shopVisitState.pulse = 0;
  shopVisitState.items = SHOP_ITEMS.map(() => ({ available: false, purchaseTimer: 0 }));
}

// Prepare the shop for a new visit so every item appears stocked and ready to buy.
function startShopVisit() {
  for (const item of shopVisitState.items) {
    item.available = true;
    item.purchaseTimer = 0;
  }
  shopVisitState.pulse = 0;
}

// Produce a simple shop interior layout for the requested shop index.
function generateTownShopAreaTiles(shopIndex) {
  const tiles = [];
  for (let y = 0; y < WORLD_ROWS; y++) {
    const row = [];
    for (let x = 0; x < SHOP_COLS; x++) {
      let value = 0;
      // Solid ceiling.
      if (y === 0) {
        value = 1;
      }
      // Solid side walls to keep Link inside the shop bounds.
      if (x === 0 || x === SHOP_COLS - 1) {
        value = 1;
      }
      // Solid floor everywhere except for the doorway gap at the bottom center.
      if (y === WORLD_ROWS - 1) {
        const exitDoorCenter = Math.floor(SHOP_COLS / 2);
        const inDoorway = x >= exitDoorCenter - 1 && x <= exitDoorCenter + 1;
        if (!inDoorway) {
          value = 1;
        }
      }
      row.push(value);
    }
    tiles.push(row);
  }

  return tiles;
}

// Return (and lazily build) the tile array for the requested shop interior index.
function getTownShopAreaTiles(shopIndex) {
  if (!townShopAreaCache.has(shopIndex)) {
    townShopAreaCache.set(shopIndex, generateTownShopAreaTiles(shopIndex));
  }
  return townShopAreaCache.get(shopIndex);
}

// Construct a bounding box for the requested shop item so Link can collide with it.
function shopItemBox(index) {
  const itemSize = TILE_SIZE;
  const spacing = TILE_SIZE * 4;
  const startX = SHOP_WIDTH / 2 - spacing;
  const x = startX + index * spacing;
  const y = TOWN_GROUND_Z - itemSize * 5;
  return { x: x - itemSize / 2, y, width: itemSize, height: Math.floor(itemSize * 1.3) };
}

// Emit a puff of hearts when Link purchases a shop item so feedback reads clearly.
function spawnShopHeartBurst(x, y) {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = 0.8 + Math.random() * 0.6;
    townParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6 - 0.2,
      life: 24,
      color: 'rgba(255, 120, 160, 0.9)'
    });
  }
}

// Apply the healing payload for the purchased item and clear its availability for the rest of the visit.
function resolveShopPurchase(item, itemState, box) {
  if (item.heal === 'full') {
    resetPlayerVitals();
  } else {
    player.hp = Math.min(PLAYER_MAX_HP, player.hp + item.heal);
  }

  itemState.available = false;
  itemState.purchaseTimer = 24;
  spawnShopHeartBurst(box.x + box.width / 2, box.y + box.height / 2);
}

// Handle per-frame interaction inside the shop, including collision and purchase attempts.
function updateShopItems() {
  if (!townState.inShop) return;

  shopVisitState.pulse = (shopVisitState.pulse + 1) % 240;
  for (const itemState of shopVisitState.items) {
    if (itemState.purchaseTimer > 0) {
      itemState.purchaseTimer--;
    }
  }

  const playerBox = { x: player.x, y: player.y, width: player.width, height: player.height };
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const itemState = shopVisitState.items[i];
    if (!itemState.available) continue;

    const item = SHOP_ITEMS[i];
    const box = shopItemBox(i);
    const canAfford = player.coins >= item.cost;
    if (canAfford && rectsOverlap(playerBox, box)) {
      player.coins -= item.cost;
      resolveShopPurchase(item, itemState, box);
    }
  }
}

// Draw the shopkeeper with a subtle bobbing motion to keep the shop lively.
function drawShopKeeper() {
  const keeperWidth = TILE_SIZE;
  const keeperHeight = Math.floor(TILE_SIZE * 1.5);
  const keeperX = SHOP_WIDTH / 2 - keeperWidth / 2 - cameraX;
  const keeperY = TILE_SIZE * 2;
  const bob = Math.sin(shopVisitState.pulse / 12) * 2;
  ctx.fillStyle = '#d8aa5a';
  ctx.fillRect(Math.floor(keeperX), Math.floor(keeperY + bob), keeperWidth, keeperHeight);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(Math.floor(keeperX), Math.floor(keeperY + bob), keeperWidth, 4);
  ctx.fillStyle = '#4a3218';
  ctx.fillRect(
    Math.floor(keeperX + keeperWidth * 0.2),
    Math.floor(keeperY + bob + keeperHeight - 6),
    keeperWidth * 0.6,
    6
  );
}

// Render a simple onigiri icon as a white rice ball.
function drawOnigiriIcon(x, y, size, tint) {
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(Math.floor(x + size / 2), Math.floor(y + size / 2), size / 2, 0, Math.PI * 2);
  ctx.fill();
}

// Render a skewered dango trio using tiny circles and a stick.
function drawDangoIcon(x, y, size, tint) {
  const ballSize = size * 0.5;
  const spacing = ballSize * 0.65;
  const startX = x + size / 2 - spacing;
  const centerY = y + size / 2;
  ctx.strokeStyle = '#c0b0d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.15, centerY + ballSize * 0.3);
  ctx.lineTo(x + size * 0.85, centerY - ballSize * 0.3);
  ctx.stroke();
  ctx.fillStyle = tint;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * spacing, centerY, ballSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Render a simple udon bowl with steam to distinguish the heartier meal.
function drawUdonIcon(x, y, size, tint) {
  const bowlHeight = size * 0.4;
  const bowlWidth = size * 1.1;
  const bowlX = x + (size - bowlWidth) / 2;
  const bowlY = y + size * 0.6;
  ctx.fillStyle = '#3a2a42';
  ctx.fillRect(Math.floor(bowlX), Math.floor(bowlY), Math.floor(bowlWidth), Math.floor(bowlHeight));
  ctx.fillStyle = tint;
  ctx.fillRect(Math.floor(bowlX + 4), Math.floor(bowlY - 4), Math.floor(bowlWidth - 8), 6);
  ctx.strokeStyle = '#c0b0d0';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const steamX = bowlX + bowlWidth * (0.35 + i * 0.2);
    ctx.beginPath();
    ctx.moveTo(steamX, bowlY - 2);
    ctx.bezierCurveTo(steamX - 3, bowlY - 10, steamX + 3, bowlY - 14, steamX, bowlY - 18);
    ctx.stroke();
  }
}

// Draw the requested shop item, including its icon, label, and coin price.
function drawShopItem(item, itemState, index) {
  const box = shopItemBox(index);
  const pulseScale = 1 + (Math.sin(shopVisitState.pulse / 10) * 0.06);
  const drawSize = box.width * pulseScale;
  const drawX = box.x - cameraX + (box.width - drawSize) / 2;
  const drawY = box.y + (box.width - drawSize) / 2;
  const active = itemState.available;
  const visible = active || itemState.purchaseTimer > 0;
  if (!visible) return;

  const tint = active ? '#ffffff' : 'rgba(192, 176, 208, 0.7)';
  if (item.icon === 'onigiri') {
    drawOnigiriIcon(drawX, drawY, drawSize, tint);
  } else if (item.icon === 'dango') {
    drawDangoIcon(drawX, drawY, drawSize, tint);
  } else {
    drawUdonIcon(drawX, drawY, drawSize, tint);
  }

  ctx.fillStyle = active ? '#ffffff' : '#b0a0c0';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(item.label, box.x - cameraX + box.width / 2, box.y + box.height + 2);

  const priceY = box.y + box.height + 16;
  const canAfford = player.coins >= item.cost;
  ctx.fillStyle = active && canAfford ? '#ffffff' : '#c0b0d0';
  ctx.fillText(`x${item.cost}`, box.x - cameraX + box.width / 2 + 12, priceY);
  ctx.fillStyle = '#f7d354';
  ctx.fillRect(box.x - cameraX - 10, priceY + 2, 10, 10);
  ctx.fillStyle = '#c99a2e';
  ctx.fillRect(box.x - cameraX - 8, priceY + 4, 6, 6);
}

// Render every stocked item so the interior shows all three wares at once.
function drawShopItems() {
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    drawShopItem(SHOP_ITEMS[i], shopVisitState.items[i], i);
  }
}

// Draw the complete shop interior when Link is inside the building.
function drawShopInterior() {
  drawShopKeeper();
  drawShopItems();
}

// Initialize the shop visit state on first load.
resetShopState();

