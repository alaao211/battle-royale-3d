const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Game state
const MAP_SIZE = 500;
const ZONE_SHRINK_INTERVAL = 30000; // 30 seconds
const ZONE_SHRINK_AMOUNT = 30;
const TOTAL_PLAYERS = 10; // Total players (humans + bots) = 10
const MAX_PLAYERS = 10;

const WEAPONS = {
  ar: { name: 'رشاش', damage: 25, fireRate: 150, range: 200, magSize: 30, reloadTime: 2000, spread: 0.03 },
  sniper: { name: 'مسدس', damage: 80, fireRate: 1500, range: 500, magSize: 5, reloadTime: 3000, spread: 0.005 },
  shotgun: { name: 'شوتكان', damage: 20, fireRate: 800, range: 50, magSize: 8, reloadTime: 2500, spread: 0.15, pellets: 5 }
};

const rooms = new Map();

function createRoom(roomId) {
  const room = {
    id: roomId,
    players: new Map(),
    bots: [],
    bullets: [],
    grenades: [],
    zone: { x: 0, z: 0, radius: MAP_SIZE, targetRadius: MAP_SIZE, shrinking: false },
    state: 'waiting', // waiting, playing, ended
    buildings: generateBuildings(),
    trees: generateTrees(),
    loot: [],
    startTime: null,
    zoneTimer: null,
    gameLoop: null,
    killFeed: []
  };
  rooms.set(roomId, room);
  return room;
}

function generateBuildings() {
  const buildings = [];
  for (let i = 0; i < 40; i++) {
    const w = 10 + Math.random() * 20;
    const h = 8 + Math.random() * 20;
    const d = 10 + Math.random() * 20;
    buildings.push({
      x: (Math.random() - 0.5) * (MAP_SIZE - 60),
      y: h / 2,
      z: (Math.random() - 0.5) * (MAP_SIZE - 60),
      w, h, d,
      color: ['#8B7355', '#A0522D', '#6B6B6B', '#8B8682', '#CD853F'][Math.floor(Math.random() * 5)]
    });
  }
  return buildings;
}

function generateTrees() {
  const trees = [];
  for (let i = 0; i < 60; i++) {
    trees.push({
      x: (Math.random() - 0.5) * (MAP_SIZE - 20),
      z: (Math.random() - 0.5) * (MAP_SIZE - 20),
      scale: 0.8 + Math.random() * 0.6
    });
  }
  return trees;
}

function generateLoot(buildings) {
  const loot = [];
  const lootTypes = [
    { type: 'weapon', weapon: 'ar', label: 'AR-15' },
    { type: 'weapon', weapon: 'sniper', label: 'AWM Sniper' },
    { type: 'weapon', weapon: 'shotgun', label: 'S12K Shotgun' },
    { type: 'ammo', weapon: 'ar', amount: 30, label: 'AR Ammo' },
    { type: 'ammo', weapon: 'sniper', amount: 5, label: 'Sniper Ammo' },
    { type: 'ammo', weapon: 'shotgun', amount: 8, label: 'SG Ammo' },
    { type: 'grenade', amount: 2, label: 'Grenades x2' },
  ];

  let lootId = 0;

  // Spread loot across map - near buildings and random spots
  // Near each building, drop 4-6 items
  for (const b of buildings) {
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.max(b.w, b.d) / 2) + 2 + Math.random() * 5;
      const item = lootTypes[Math.floor(Math.random() * lootTypes.length)];
      loot.push({
        id: lootId++,
        x: b.x + Math.cos(angle) * dist,
        z: b.z + Math.sin(angle) * dist,
        y: 0.3,
        ...item,
        picked: false
      });
    }
  }

  // Random loot across map
  for (let i = 0; i < 60; i++) {
    const item = lootTypes[Math.floor(Math.random() * lootTypes.length)];
    loot.push({
      id: lootId++,
      x: (Math.random() - 0.5) * (MAP_SIZE - 30),
      z: (Math.random() - 0.5) * (MAP_SIZE - 30),
      y: 0.3,
      ...item,
      picked: false
    });
  }

  return loot;
}

function spawnPosition(room) {
  for (let attempts = 0; attempts < 50; attempts++) {
    const x = (Math.random() - 0.5) * (MAP_SIZE - 40);
    const z = (Math.random() - 0.5) * (MAP_SIZE - 40);
    let valid = true;
    for (const b of room.buildings) {
      if (Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3) {
        valid = false;
        break;
      }
    }
    if (valid) return { x, z };
  }
  return { x: 0, z: 0 };
}

function createBot(room, id) {
  const pos = spawnPosition(room);
  return {
    id: `bot_${id}`,
    name: `Bot_${String(id).padStart(2, '0')}`,
    x: pos.x, y: 1.5, z: pos.z,
    rotY: Math.random() * Math.PI * 2,
    health: 100,
    alive: true,
    weapon: null, // Start with no weapon - must loot
    inventory: [],
    ammo: { ar: 0, sniper: 0, shotgun: 0 },
    grenades: 0,
    kills: 0,
    // AI state
    state: 'loot', // loot, patrol, chase, attack, hide, flee
    targetX: 0, targetZ: 0,
    targetEnemy: null,
    targetLoot: null,
    stateTimer: 0,
    lastShot: 0,
    lastGrenadeThrow: 0,
    accuracy: 0.4 + Math.random() * 0.3, // 40-70% accuracy
    reactionTime: 500 + Math.random() * 500,
    patrolTimer: 0,
    isBot: true
  };
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function isInsideZone(x, z, zone) {
  const dx = x - zone.x;
  const dz = z - zone.z;
  return Math.sqrt(dx * dx + dz * dz) <= zone.radius;
}

function checkBuildingCollision(x, z, buildings, radius) {
  for (const b of buildings) {
    if (x > b.x - b.w / 2 - radius && x < b.x + b.w / 2 + radius &&
        z > b.z - b.d / 2 - radius && z < b.z + b.d / 2 + radius) {
      return true;
    }
  }
  return false;
}

// Line-of-sight check: returns true if no building blocks view between two points
function hasLineOfSight(x1, z1, x2, z2, buildings) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / 3); // check every 3 units
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cz = z1 + dz * t;
    for (const b of buildings) {
      if (cx > b.x - b.w / 2 && cx < b.x + b.w / 2 &&
          cz > b.z - b.d / 2 && cz < b.z + b.d / 2) {
        return false; // blocked by building
      }
    }
  }
  return true;
}

function botPickupLoot(bot, room) {
  // Find nearest unpicked loot
  let nearest = null;
  let nearestDist = 3.5;
  for (const item of room.loot) {
    if (item.picked) continue;
    const dist = distanceBetween(bot, item);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = item;
    }
  }
  if (!nearest) return false;

  nearest.picked = true;
  if (nearest.type === 'weapon') {
    if (!bot.inventory.includes(nearest.weapon)) {
      bot.inventory.push(nearest.weapon);
    }
    bot.ammo[nearest.weapon] = WEAPONS[nearest.weapon].magSize;
    if (!bot.weapon) bot.weapon = nearest.weapon;
  } else if (nearest.type === 'ammo') {
    bot.ammo[nearest.weapon] += nearest.amount;
  } else if (nearest.type === 'grenade') {
    bot.grenades += nearest.amount;
  }
  return true;
}

function updateBotAI(bot, room, deltaTime) {
  if (!bot.alive) return;

  // Try to pick up nearby loot
  botPickupLoot(bot, room);

  const now = Date.now();

  const allEntities = [];
  room.players.forEach(p => {
    if (p.alive && (!p.spawnProtection || now > p.spawnProtection)) allEntities.push(p);
  });
  room.bots.forEach(b => { if (b.alive && b.id !== bot.id) allEntities.push(b); });

  // Find nearest enemy
  let nearestEnemy = null;
  let nearestDist = Infinity;
  for (const entity of allEntities) {
    const dist = distanceBetween(bot, entity);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestEnemy = entity;
    }
  }

  // Zone flee
  if (!isInsideZone(bot.x, bot.z, room.zone)) {
    bot.state = 'flee';
    bot.targetX = room.zone.x;
    bot.targetZ = room.zone.z;
  }

  // State machine
  bot.stateTimer -= deltaTime;

  switch (bot.state) {
    case 'loot':
      // Find nearest weapon/ammo loot on ground
      if (!bot.weapon || bot.inventory.length < 2) {
        let nearestLoot = null;
        let nlDist = Infinity;
        for (const item of room.loot) {
          if (item.picked) continue;
          // Prioritize weapons if we have none
          if (!bot.weapon && item.type !== 'weapon') continue;
          const d = distanceBetween(bot, item);
          if (d < nlDist) {
            nlDist = d;
            nearestLoot = item;
          }
        }
        // If no weapon loot, try any loot
        if (!nearestLoot && !bot.weapon) {
          for (const item of room.loot) {
            if (item.picked) continue;
            const d = distanceBetween(bot, item);
            if (d < nlDist) { nlDist = d; nearestLoot = item; }
          }
        }
        if (nearestLoot) {
          bot.targetX = nearestLoot.x;
          bot.targetZ = nearestLoot.z;
          bot.targetLoot = nearestLoot;
        } else {
          // No loot left, go patrol
          bot.state = 'patrol';
        }
      } else {
        // Have enough weapons, go fight
        bot.state = 'patrol';
      }
      // If enemy very close and visible, fight even without weapon
      if (nearestEnemy && nearestDist < 30 && bot.weapon && hasLineOfSight(bot.x, bot.z, nearestEnemy.x, nearestEnemy.z, room.buildings)) {
        bot.state = 'chase';
        bot.targetEnemy = nearestEnemy;
      }
      break;

    case 'patrol':
      // If no weapon, go loot first
      if (!bot.weapon) {
        bot.state = 'loot';
        break;
      }
      if (bot.patrolTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 40;
        bot.targetX = bot.x + Math.cos(angle) * dist;
        bot.targetZ = bot.z + Math.sin(angle) * dist;
        bot.targetX = Math.max(-MAP_SIZE / 2 + 5, Math.min(MAP_SIZE / 2 - 5, bot.targetX));
        bot.targetZ = Math.max(-MAP_SIZE / 2 + 5, Math.min(MAP_SIZE / 2 - 5, bot.targetZ));
        bot.patrolTimer = 3000 + Math.random() * 4000;
      }
      bot.patrolTimer -= deltaTime;

      if (nearestEnemy && nearestDist < 60 && hasLineOfSight(bot.x, bot.z, nearestEnemy.x, nearestEnemy.z, room.buildings)) {
        bot.state = 'chase';
        bot.targetEnemy = nearestEnemy;
        bot.stateTimer = 5000;
      }
      break;

    case 'chase':
      if (!bot.weapon) {
        bot.state = 'loot'; // Need weapon first
        break;
      }
      if (!nearestEnemy || nearestDist > 150) {
        bot.state = 'patrol';
        break;
      }
      bot.targetX = nearestEnemy.x;
      bot.targetZ = nearestEnemy.z;
      bot.targetEnemy = nearestEnemy;

      // Choose weapon based on distance (only from inventory)
      if (nearestDist < 30 && bot.inventory.includes('shotgun')) bot.weapon = 'shotgun';
      else if (nearestDist > 120 && bot.inventory.includes('sniper')) bot.weapon = 'sniper';
      else if (bot.inventory.includes('ar')) bot.weapon = 'ar';
      // else keep current weapon

      if (nearestDist < WEAPONS[bot.weapon].range && hasLineOfSight(bot.x, bot.z, nearestEnemy.x, nearestEnemy.z, room.buildings)) {
        bot.state = 'attack';
        bot.stateTimer = 2000 + Math.random() * 3000;
      }
      break;

    case 'attack':
      if (!bot.weapon) { bot.state = 'loot'; break; }
      if (!nearestEnemy || !nearestEnemy.alive) {
        bot.state = 'patrol';
        break;
      }

      // Check line of sight - can't shoot through buildings
      if (!hasLineOfSight(bot.x, bot.z, nearestEnemy.x, nearestEnemy.z, room.buildings)) {
        bot.state = 'chase'; // Lost sight, chase around building
        break;
      }

      bot.targetEnemy = nearestEnemy;

      // Face enemy
      const dx = nearestEnemy.x - bot.x;
      const dz = nearestEnemy.z - bot.z;
      bot.rotY = Math.atan2(dx, dz);

      // Shoot
      const weapon = WEAPONS[bot.weapon];
      if (now - bot.lastShot > weapon.fireRate && bot.ammo[bot.weapon] > 0) {
        if (Math.random() < bot.accuracy) {
          // Hit
          const damage = bot.weapon === 'shotgun'
            ? weapon.damage * Math.min(weapon.pellets, Math.ceil(weapon.pellets * (1 - nearestDist / weapon.range)))
            : weapon.damage;

          nearestEnemy.health -= damage;
          if (nearestEnemy.health <= 0) {
            nearestEnemy.health = 0;
            nearestEnemy.alive = false;
            bot.kills++;
            room.killFeed.push({ killer: bot.name, victim: nearestEnemy.name || nearestEnemy.id, weapon: bot.weapon, time: now });
            io.to(room.id).emit('kill', { killer: bot.name, victim: nearestEnemy.name || nearestEnemy.id, weapon: bot.weapon });
            checkGameEnd(room);
          }
          // Emit bullet visual
          io.to(room.id).emit('bullet', {
            x: bot.x, y: 1.5, z: bot.z,
            tx: nearestEnemy.x, ty: 1.5, tz: nearestEnemy.z,
            weapon: bot.weapon
          });
        }
        bot.ammo[bot.weapon]--;
        if (bot.ammo[bot.weapon] <= 0) {
          bot.ammo[bot.weapon] = WEAPONS[bot.weapon].magSize; // auto reload
        }
        bot.lastShot = now;
      }

      // Throw grenade at groups
      if (bot.grenades > 0 && nearestDist < 60 && nearestDist > 15 && now - bot.lastGrenadeThrow > 8000) {
        const nearbyCount = allEntities.filter(e => distanceBetween(nearestEnemy, e) < 15).length;
        if (nearbyCount >= 2 || (nearestDist < 30 && Math.random() < 0.3)) {
          room.grenades.push({
            x: bot.x, y: 2, z: bot.z,
            tx: nearestEnemy.x, tz: nearestEnemy.z,
            thrower: bot.id,
            throwerName: bot.name,
            time: now,
            explodeTime: now + 3000
          });
          bot.grenades--;
          bot.lastGrenadeThrow = now;
          io.to(room.id).emit('grenadeThrown', {
            x: bot.x, y: 2, z: bot.z,
            tx: nearestEnemy.x, tz: nearestEnemy.z
          });
        }
      }

      // Hide if low health
      if (bot.health < 30) {
        bot.state = 'hide';
        // Find nearest building to hide behind
        let nearestBuilding = null;
        let nbDist = Infinity;
        for (const b of room.buildings) {
          const d = distanceBetween(bot, b);
          if (d < nbDist) { nbDist = d; nearestBuilding = b; }
        }
        if (nearestBuilding) {
          const awayAngle = Math.atan2(bot.z - nearestEnemy.z, bot.x - nearestEnemy.x);
          bot.targetX = nearestBuilding.x + Math.cos(awayAngle) * (nearestBuilding.w / 2 + 3);
          bot.targetZ = nearestBuilding.z + Math.sin(awayAngle) * (nearestBuilding.d / 2 + 3);
        }
        bot.stateTimer = 3000;
      }

      if (nearestDist > WEAPONS[bot.weapon].range * 1.2) {
        bot.state = 'chase';
      }
      break;

    case 'hide':
      if (bot.stateTimer <= 0 || bot.health > 50) {
        bot.state = nearestEnemy && nearestDist < 100 ? 'chase' : 'patrol';
      }
      break;

    case 'flee':
      if (isInsideZone(bot.x, bot.z, room.zone)) {
        bot.state = 'patrol';
      }
      break;
  }

  // Move towards target
  const moveSpeed = (bot.state === 'flee' ? 18 : bot.state === 'hide' ? 14 : 12) * (deltaTime / 1000);
  const tdx = bot.targetX - bot.x;
  const tdz = bot.targetZ - bot.z;
  const tdist = Math.sqrt(tdx * tdx + tdz * tdz);

  if (tdist > 2) {
    const nx = tdx / tdist;
    const nz = tdz / tdist;
    const newX = bot.x + nx * moveSpeed;
    const newZ = bot.z + nz * moveSpeed;

    if (!checkBuildingCollision(newX, newZ, room.buildings, 1)) {
      bot.x = newX;
      bot.z = newZ;
    } else {
      // Try to go around
      const newX2 = bot.x + nz * moveSpeed;
      const newZ2 = bot.z - nx * moveSpeed;
      if (!checkBuildingCollision(newX2, newZ2, room.buildings, 1)) {
        bot.x = newX2;
        bot.z = newZ2;
      }
    }

    if (bot.state !== 'attack') {
      bot.rotY = Math.atan2(tdx, tdz);
    }
  }

  // Zone damage
  if (!isInsideZone(bot.x, bot.z, room.zone)) {
    bot.health -= 5 * (deltaTime / 1000);
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      io.to(room.id).emit('kill', { killer: 'Zone', victim: bot.name, weapon: 'zone' });
      checkGameEnd(room);
    }
  }
}

function updateGrenades(room) {
  const now = Date.now();
  const toRemove = [];

  for (let i = 0; i < room.grenades.length; i++) {
    const g = room.grenades[i];
    if (now >= g.explodeTime) {
      // Explode!
      const explosionRadius = 15;
      const damage = 100;

      // Damage all entities in radius
      const allEntities = [];
      room.players.forEach(p => { if (p.alive) allEntities.push(p); });
      room.bots.forEach(b => { if (b.alive) allEntities.push(b); });

      for (const entity of allEntities) {
        // Skip players with spawn protection
        if (entity.spawnProtection && now < entity.spawnProtection) continue;
        const dist = Math.sqrt((entity.x - g.tx) ** 2 + ((entity.z || 0) - g.tz) ** 2);
        if (dist < explosionRadius) {
          const dmg = damage * (1 - dist / explosionRadius);
          entity.health -= dmg;
          if (entity.health <= 0) {
            entity.health = 0;
            entity.alive = false;
            const thrower = room.bots.find(b => b.id === g.thrower) || { name: 'Unknown', kills: 0 };
            if (room.players.has(g.thrower)) {
              const p = room.players.get(g.thrower);
              p.kills++;
              room.killFeed.push({ killer: p.name, victim: entity.name || entity.id, weapon: 'grenade', time: now });
            } else if (thrower) {
              thrower.kills++;
              room.killFeed.push({ killer: thrower.name || g.throwerName, victim: entity.name || entity.id, weapon: 'grenade', time: now });
            }
            io.to(room.id).emit('kill', { killer: g.throwerName, victim: entity.name || entity.id, weapon: 'grenade' });
            checkGameEnd(room);
          }
        }
      }

      io.to(room.id).emit('explosion', { x: g.tx, y: 1, z: g.tz });
      toRemove.push(i);
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    room.grenades.splice(toRemove[i], 1);
  }
}

function updateZone(room) {
  if (room.zone.radius > room.zone.targetRadius) {
    room.zone.radius -= 0.05;
    if (room.zone.radius < room.zone.targetRadius) {
      room.zone.radius = room.zone.targetRadius;
    }
  }
}

function checkGameEnd(room) {
  if (room.state !== 'playing') return;

  let aliveCount = 0;
  let lastAlive = null;

  room.players.forEach(p => {
    if (p.alive) { aliveCount++; lastAlive = p; }
  });
  room.bots.forEach(b => {
    if (b.alive) { aliveCount++; lastAlive = b; }
  });

  if (aliveCount <= 1) {
    room.state = 'ended';
    const winnerName = lastAlive ? (lastAlive.name || lastAlive.id) : 'Nobody';
    io.to(room.id).emit('gameEnd', { winner: winnerName, isBot: lastAlive ? lastAlive.isBot : false });
    clearInterval(room.gameLoop);
    clearInterval(room.zoneTimer);

    // Restart after 10 seconds
    setTimeout(() => {
      rooms.delete(room.id);
    }, 15000);
  }
}

function startGame(room) {
  room.state = 'playing';
  room.startTime = Date.now();

  // Generate loot on ground
  room.loot = generateLoot(room.buildings);

  // Airplane path - flies across the map
  const planeAngle = Math.random() * Math.PI * 2;
  const planeStartX = Math.cos(planeAngle) * MAP_SIZE / 2;
  const planeStartZ = Math.sin(planeAngle) * MAP_SIZE / 2;
  const planeEndX = -planeStartX;
  const planeEndZ = -planeStartZ;
  room.airplane = {
    startX: planeStartX, startZ: planeStartZ,
    endX: planeEndX, endZ: planeEndZ,
    progress: 0, // 0 to 1
    active: true,
    altitude: 100
  };

  // Spawn bots on ground at random spread-out positions (no airplane)
  const neededBots = Math.max(0, TOTAL_PLAYERS - room.players.size);
  const botPositions = [];
  for (let i = 0; i < neededBots; i++) {
    const bot = createBot(room, i);
    // Find a position far from other bots
    let bestX = 0, bestZ = 0, bestMinDist = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const tx = (Math.random() - 0.5) * (MAP_SIZE - 60);
      const tz = (Math.random() - 0.5) * (MAP_SIZE - 60);
      // Check not inside building
      let inBuilding = false;
      for (const b of room.buildings) {
        if (Math.abs(tx - b.x) < b.w / 2 + 3 && Math.abs(tz - b.z) < b.d / 2 + 3) {
          inBuilding = true; break;
        }
      }
      if (inBuilding) continue;
      // Find min distance to existing bot positions
      let minDist = Infinity;
      for (const pos of botPositions) {
        const d = Math.sqrt((tx - pos.x) ** 2 + (tz - pos.z) ** 2);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestX = tx;
        bestZ = tz;
      }
    }
    bot.x = bestX;
    bot.z = bestZ;
    bot.y = 1.5;
    bot.dropping = false;
    bot.dropY = 1.5;
    bot.weapon = null;
    bot.inventory = [];
    bot.state = 'loot';
    botPositions.push({ x: bestX, z: bestZ });
    room.bots.push(bot);
  }

  // Set players to airplane
  room.players.forEach(p => {
    p.inAirplane = true;
    p.dropping = false;
    p.dropY = room.airplane.altitude;
    p.y = room.airplane.altitude;
    p.x = planeStartX;
    p.z = planeStartZ;
  });

  io.to(room.id).emit('gameStart', {
    ...getGameState(room),
    airplane: room.airplane
  });

  // Zone shrink timer - first shrink after 30 seconds
  room.zoneTimer = setInterval(() => {
    if (room.zone.targetRadius > 20) {
      room.zone.targetRadius -= ZONE_SHRINK_AMOUNT;
      if (room.zone.targetRadius < 20) room.zone.targetRadius = 20;
      io.to(room.id).emit('zoneShrink', { targetRadius: room.zone.targetRadius });
    }
  }, ZONE_SHRINK_INTERVAL);

  // Game loop (server-side)
  let lastTime = Date.now();
  room.gameLoop = setInterval(() => {
    const now = Date.now();
    const deltaTime = now - lastTime;
    lastTime = now;

    // Update airplane
    if (room.airplane && room.airplane.active) {
      room.airplane.progress += 0.003 * (deltaTime / 50); // ~10 seconds across map
      const ap = room.airplane;
      const planeX = ap.startX + (ap.endX - ap.startX) * ap.progress;
      const planeZ = ap.startZ + (ap.endZ - ap.startZ) * ap.progress;

      // Update players still in airplane
      room.players.forEach(p => {
        if (p.inAirplane) {
          p.x = planeX;
          p.z = planeZ;
          p.y = ap.altitude;
        }
      });

      if (ap.progress >= 1.0) {
        ap.active = false;
        // Force any remaining players to drop
        room.players.forEach(p => {
          if (p.inAirplane) {
            p.inAirplane = false;
            p.dropping = true;
          }
        });
      }
    }

    // Update dropping entities (falling from sky)
    const landEntity = (entity) => {
      entity.y = 1.5;
      entity.dropping = false;
      // Push out of buildings if landed inside one
      for (const b of room.buildings) {
        const bx1 = b.x - b.w / 2 - 1.5;
        const bx2 = b.x + b.w / 2 + 1.5;
        const bz1 = b.z - b.d / 2 - 1.5;
        const bz2 = b.z + b.d / 2 + 1.5;
        if (entity.x > bx1 && entity.x < bx2 && entity.z > bz1 && entity.z < bz2) {
          // Find nearest edge to push out
          const distLeft = entity.x - bx1;
          const distRight = bx2 - entity.x;
          const distTop = entity.z - bz1;
          const distBottom = bz2 - entity.z;
          const minDist = Math.min(distLeft, distRight, distTop, distBottom);
          if (minDist === distLeft) entity.x = bx1 - 0.5;
          else if (minDist === distRight) entity.x = bx2 + 0.5;
          else if (minDist === distTop) entity.z = bz1 - 0.5;
          else entity.z = bz2 + 0.5;
        }
      }
    };

    room.players.forEach(p => {
      if (p.dropping && p.y > 1.5) {
        p.y -= 60 * (deltaTime / 1000); // Faster fall
        if (p.y <= 1.5) landEntity(p);
      }
    });
    for (const bot of room.bots) {
      if (bot.dropping && bot.y > 1.5) {
        bot.y -= 60 * (deltaTime / 1000);
        if (bot.y <= 1.5) landEntity(bot);
      }
    }

    // Update bots (only if not in airplane/dropping)
    for (const bot of room.bots) {
      if (bot.dropping && bot.y > 1.5) continue;
      updateBotAI(bot, room, deltaTime);
    }

    // Update grenades
    updateGrenades(room);

    // Update zone
    updateZone(room);

    // Zone damage to players
    const nowTime = Date.now();
    room.players.forEach(p => {
      if (p.alive && (!p.spawnProtection || nowTime > p.spawnProtection) && !isInsideZone(p.x, p.z, room.zone)) {
        p.health -= 5 * (deltaTime / 1000);
        if (p.health <= 0) {
          p.health = 0;
          p.alive = false;
          io.to(room.id).emit('kill', { killer: 'Zone', victim: p.name, weapon: 'zone' });
          checkGameEnd(room);
        }
      }
    });

    // Send state update
    io.to(room.id).emit('gameState', getGameState(room));
  }, 50); // 20 ticks per second
}

function getGameState(room) {
  const players = [];
  room.players.forEach(p => {
    players.push({
      id: p.id, name: p.name, x: p.x, y: p.y, z: p.z,
      rotY: p.rotY, health: p.health, alive: p.alive,
      weapon: p.weapon, kills: p.kills,
      spawnProtection: p.spawnProtection && Date.now() < p.spawnProtection,
      inAirplane: p.inAirplane || false,
      dropping: p.dropping || false
    });
  });

  const bots = room.bots.map(b => ({
    id: b.id, name: b.name, x: b.x, y: b.y, z: b.z,
    rotY: b.rotY, health: b.health, alive: b.alive,
    weapon: b.weapon, kills: b.kills, isBot: true
  }));

  let aliveCount = 0;
  room.players.forEach(p => { if (p.alive) aliveCount++; });
  room.bots.forEach(b => { if (b.alive) aliveCount++; });

  return {
    players, bots,
    zone: room.zone,
    aliveCount,
    buildings: room.buildings,
    trees: room.trees,
    loot: room.loot.filter(l => !l.picked),
    state: room.state,
    airplane: room.airplane || null
  };
}

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  let currentRoom = null;

  socket.on('joinGame', (data) => {
    const roomId = 'room_1'; // Single room for simplicity
    let room = rooms.get(roomId);

    if (!room) {
      room = createRoom(roomId);
    }

    if (room.state === 'ended' || (room.state === 'playing' && room.players.size === 0)) {
      clearInterval(room.gameLoop);
      clearInterval(room.zoneTimer);
      room = createRoom(roomId);
    }

    const pos = spawnPosition(room);
    const player = {
      id: socket.id,
      name: data.name || `Player_${socket.id.slice(0, 4)}`,
      x: pos.x, y: 1.5, z: pos.z,
      rotY: 0,
      health: 100,
      alive: true,
      weapon: null, // Start with no weapon
      inventory: [], // Collected weapons
      ammo: { ar: 0, sniper: 0, shotgun: 0 },
      grenades: 0,
      kills: 0,
      spawnProtection: Date.now() + 8000
    };

    room.players.set(socket.id, player);
    socket.join(roomId);
    currentRoom = roomId;

    // If game is running, remove one alive bot to make room for the human player
    if (room.state === 'playing' && room.bots.length > 0) {
      const aliveBotIdx = room.bots.findIndex(b => b.alive);
      if (aliveBotIdx !== -1) {
        room.bots.splice(aliveBotIdx, 1);
      }
    }

    socket.emit('joined', {
      playerId: socket.id,
      weapons: WEAPONS,
      mapSize: MAP_SIZE
    });

    // Start game when first player joins (with bots)
    if (room.state === 'waiting') {
      startGame(room);
    } else {
      socket.emit('gameStart', getGameState(room));
    }
  });

  socket.on('pickup', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    const item = room.loot.find(l => l.id === data.lootId && !l.picked);
    if (!item) return;

    // Check distance
    const dx = player.x - item.x;
    const dz = player.z - item.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 10) return; // Too far (wider range for mobile)

    item.picked = true;

    if (item.type === 'weapon') {
      if (!player.inventory.includes(item.weapon)) {
        player.inventory.push(item.weapon);
      }
      player.ammo[item.weapon] = WEAPONS[item.weapon].magSize;
      // Auto-equip if no weapon
      if (!player.weapon) {
        player.weapon = item.weapon;
      }
      socket.emit('pickedUp', { type: 'weapon', weapon: item.weapon, label: item.label, inventory: player.inventory });
    } else if (item.type === 'ammo') {
      player.ammo[item.weapon] += item.amount;
      socket.emit('pickedUp', { type: 'ammo', weapon: item.weapon, amount: item.amount, label: item.label });
    } else if (item.type === 'grenade') {
      player.grenades += item.amount;
      socket.emit('pickedUp', { type: 'grenade', amount: item.amount, label: item.label });
    }
  });

  socket.on('drop', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.inAirplane) return;
    player.inAirplane = false;
    player.dropping = true;
  });

  socket.on('move', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    // Validate and clamp
    const newX = Math.max(-MAP_SIZE / 2, Math.min(MAP_SIZE / 2, data.x));
    const newZ = Math.max(-MAP_SIZE / 2, Math.min(MAP_SIZE / 2, data.z));

    if (!checkBuildingCollision(newX, newZ, room.buildings, 1.2)) {
      player.x = newX;
      player.z = newZ;
    }
    player.y = data.y || 1.5;
    player.rotY = data.rotY || 0;
  });

  socket.on('shoot', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    if (!player.weapon) return; // No weapon equipped
    const weapon = WEAPONS[player.weapon];
    if (!weapon) return;
    if (player.ammo[player.weapon] <= 0) return;

    player.ammo[player.weapon]--;

    // Check hits against all entities
    const allTargets = [];
    room.players.forEach(p => { if (p.alive && p.id !== socket.id) allTargets.push(p); });
    room.bots.forEach(b => { if (b.alive) allTargets.push(b); });

    const pitch = data.pitch || 0;
    const pellets = weapon.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const spreadX = (Math.random() - 0.5) * weapon.spread;
      const spreadZ = (Math.random() - 0.5) * weapon.spread;

      // 3D direction using both rotY and pitch
      // Use precise crosshair direction from client if available, otherwise fallback to rotY/pitch
      let dirX, dirY, dirZ;
      if (data.dir) {
        dirX = data.dir.dx + spreadX;
        dirY = data.dir.dy;
        dirZ = data.dir.dz + spreadZ;
      } else {
        dirX = Math.sin(data.rotY) * Math.cos(pitch) + spreadX;
        dirY = Math.sin(pitch);
        dirZ = Math.cos(data.rotY) * Math.cos(pitch) + spreadZ;
      }
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
      const ndx = dirX / dirLen;
      const ndy = dirY / dirLen;
      const ndz = dirZ / dirLen;

      for (const target of allTargets) {
        const dist = distanceBetween(player, target);
        if (dist > weapon.range) continue;

        // Check line of sight - can't shoot through buildings
        if (!hasLineOfSight(player.x, player.z, target.x, target.z, room.buildings)) continue;

        // 3D hit detection
        const toTargetX = target.x - player.x;
        const toTargetY = (target.y || 1.5) - 2.0; // bullet origin height
        const toTargetZ = target.z - player.z;
        const dot = toTargetX * ndx + toTargetY * ndy + toTargetZ * ndz;
        if (dot < 0) continue;

        const closestX = player.x + ndx * dot;
        const closestY = 2.0 + ndy * dot;
        const closestZ = player.z + ndz * dot;
        const hitDist = Math.sqrt((closestX - target.x) ** 2 + (closestY - (target.y || 1.5)) ** 2 + (closestZ - target.z) ** 2);

        if (hitDist < 2.5) {
          target.health -= weapon.damage;
          if (target.health <= 0) {
            target.health = 0;
            target.alive = false;
            player.kills++;
            room.killFeed.push({ killer: player.name, victim: target.name || target.id, weapon: player.weapon, time: Date.now() });
            io.to(room.id).emit('kill', { killer: player.name, victim: target.name || target.id, weapon: player.weapon });
            checkGameEnd(room);
          }
          socket.emit('hitMarker');
          break;
        }
      }
    }

    // Broadcast bullet visual - use crosshair direction for accurate trail
    const muzzleX = player.x + Math.sin(data.rotY) * 1.5 + Math.cos(data.rotY) * 0.8;
    const muzzleZ = player.z + Math.cos(data.rotY) * 1.5 - Math.sin(data.rotY) * 0.8;
    const bulletDx = data.dir ? data.dir.dx : Math.sin(data.rotY);
    const bulletDy = data.dir ? data.dir.dy : 0;
    const bulletDz = data.dir ? data.dir.dz : Math.cos(data.rotY);
    io.to(room.id).emit('bullet', {
      x: muzzleX, y: 2.0, z: muzzleZ,
      dx: bulletDx, dy: bulletDy, dz: bulletDz,
      weapon: player.weapon
    });
  });

  socket.on('reload', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    player.ammo[player.weapon] = WEAPONS[player.weapon].magSize;
  });

  socket.on('switchWeapon', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    if (WEAPONS[data.weapon] && player.inventory.includes(data.weapon)) {
      player.weapon = data.weapon;
    }
  });

  socket.on('throwGrenade', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive || player.grenades <= 0) return;

    player.grenades--;
    const throwDist = 40;
    const tx = player.x + Math.sin(data.rotY) * throwDist;
    const tz = player.z + Math.cos(data.rotY) * throwDist;

    room.grenades.push({
      x: player.x, y: 2, z: player.z,
      tx, tz,
      thrower: socket.id,
      throwerName: player.name,
      time: Date.now(),
      explodeTime: Date.now() + 3000
    });

    io.to(room.id).emit('grenadeThrown', {
      x: player.x, y: 2, z: player.z, tx, tz
    });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.players.delete(socket.id);
        // If no human players left, clean up the room entirely
        if (room.players.size === 0) {
          clearInterval(room.gameLoop);
          clearInterval(room.zoneTimer);
          rooms.delete(currentRoom);
          console.log(`Room ${currentRoom} removed - no players left`);
        } else {
          checkGameEnd(room);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Battle Royale server running on http://localhost:${PORT}`);
});
