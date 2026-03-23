// Main Game Engine
let game = null;

class Game {
  constructor() {
    // Three.js
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Systems
    this.map = null;
    this.weapons = new WeaponsSystem();
    this.effects = new EffectsSystem(this.scene);
    this.hud = new HUD();
    this.network = new NetworkManager();
    this.audio = new AudioSystem();
    this.controller = null;

    // Game state
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.remoteBots = new Map();
    this.gameState = null;
    this.mapSize = 500;
    this.buildings = [];
    this.running = false;
    this.lastTime = 0;
    this.previousHealth = 100;

    // Input state
    this.mouseDown = false;
    this.lastSendTime = 0;

    // Airplane/drop state
    this.inAirplane = false;
    this.dropping = false;
    this.airplaneMesh = null;

    // Loot
    this.lootMeshes = new Map();

    this.setupEvents();
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Mouse buttons
    document.addEventListener('mousedown', (e) => {
      if (!this.running) return;

      // Request pointer lock (desktop only)
      if (!this.isMobile && !document.pointerLockElement) {
        document.body.requestPointerLock();
        return;
      }

      if (e.button === 0) {
        this.mouseDown = true;
        this.audio.resume();
        this.tryShoot();
      }
      if (e.button === 2) {
        this.controller.zoomed = true;
        this.camera.fov = 35;
        this.camera.updateProjectionMatrix();
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) {
        this.controller.zoomed = false;
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!this.running) return;

      // Drop from airplane
      if ((e.code === 'Space' || e.code === 'KeyF') && this.inAirplane) {
        this.network.socket.emit('drop');
        this.inAirplane = false;
        this.dropping = true;
        return;
      }

      switch (e.code) {
        case 'Digit1': this.switchWeapon('ar'); break;
        case 'Digit2': this.switchWeapon('sniper'); break;
        case 'Digit3': this.switchWeapon('shotgun'); break;
        case 'KeyR': this.reload(); break;
        case 'KeyG': this.throwGrenade(); break;
        case 'KeyE': this.tryPickup(); break;
      }
    });

    // Network callbacks
    this.network.onJoined = (data) => {
      this.mapSize = data.mapSize;
      this.hud.mapSize = data.mapSize;
    };

    this.network.onGameStart = (data) => {
      this.initGame(data);
    };

    this.network.onGameState = (data) => {
      this.updateFromServer(data);
    };

    this.network.onBullet = (data) => {
      const range = this.weapons.weapons[data.weapon]?.range || 100;
      const toX = data.tx || data.x + (data.dx || 0) * range;
      const toZ = data.tz || data.z + (data.dz || 0) * range;
      this.effects.createBulletTrail(data.x, data.y, data.z, toX, data.y, toZ);
      this.effects.createMuzzleFlash(data.x, data.y + 0.5, data.z);
      this.audio.playShot(data.weapon);
    };

    this.network.onExplosion = (data) => {
      this.effects.createExplosion(data.x, data.y || 0, data.z);
      this.audio.playExplosion();
    };

    this.network.onGrenadeThrown = (data) => {
      this.effects.createGrenadeTrail(data.x, data.y, data.z, data.tx, data.tz);
      this.audio.playGrenadeThrow();
    };

    this.network.onKill = (data) => {
      this.hud.addKillFeedEntry(data.killer, data.victim, data.weapon);

      // Check if we got a kill
      if (data.killer === this.playerName) {
        this.hud.showKillNotification(data.victim);
        this.audio.playKill();
      }
    };

    this.network.onHitMarker = () => {
      // Flash crosshair
      const crosshair = document.getElementById('crosshair');
      crosshair.style.filter = 'brightness(3)';
      setTimeout(() => { crosshair.style.filter = ''; }, 100);
      this.audio.playHitMarker();
    };

    this.network.onZoneShrink = (data) => {
      // Zone shrink handled in updateFromServer
    };

    this.network.onGameEnd = (data) => {
      this.showGameOver(data);
    };

    // ====== MOBILE CONTROLS ======
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (this.isMobile) {
      document.body.classList.add('is-mobile');
      this.setupMobileControls();
    }

    // Pickup callback
    this.network.onPickedUp = (data) => {
      if (data.type === 'weapon') {
        if (!this.weapons.inventory) this.weapons.inventory = [];
        if (!this.weapons.inventory.includes(data.weapon)) {
          this.weapons.inventory.push(data.weapon);
        }
        this.weapons.ammo[data.weapon] = this.weapons.weapons[data.weapon].magSize;
        // Auto-equip if no weapon
        if (!this.weapons.currentWeapon) {
          this.weapons.currentWeapon = data.weapon;
        }
        this.audio.playWeaponSwitch();
      } else if (data.type === 'ammo') {
        this.weapons.ammo[data.weapon] = (this.weapons.ammo[data.weapon] || 0) + data.amount;
      } else if (data.type === 'grenade') {
        this.weapons.grenades += data.amount;
      }
      // Show pickup notification
      this.showPickupNotification(data.label);
      this.hud.updateWeapon(this.weapons.currentWeapon, this.weapons.weapons, this.weapons.ammo, this.weapons.grenades);
    };
  }

  setupMobileControls() {
    const mobileControls = document.getElementById('mobileControls');
    const joystickArea = document.getElementById('joystickArea');
    const joystickBase = document.getElementById('joystickBase');
    const joystickThumb = document.getElementById('joystickThumb');
    const cameraArea = document.getElementById('cameraArea');

    // Joystick state
    this.joystickActive = false;
    this.joystickX = 0;
    this.joystickZ = 0;
    let joystickTouchId = null;
    const joystickBaseRect = { cx: 0, cy: 0, radius: 60 };

    // Show mobile controls when game starts
    this.showMobileControls = () => {
      mobileControls.style.display = 'block';
      // Update drop button visibility
      const dropBtn = document.getElementById('dropBtn');
      if (this.inAirplane) dropBtn.style.display = 'flex';
      else dropBtn.style.display = 'none';
    };

    // --- JOYSTICK ---
    joystickArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;
      const rect = joystickBase.getBoundingClientRect();
      joystickBaseRect.cx = rect.left + rect.width / 2;
      joystickBaseRect.cy = rect.top + rect.height / 2;
      this.joystickActive = true;
    }, { passive: false });

    joystickArea.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          let dx = touch.clientX - joystickBaseRect.cx;
          let dy = touch.clientY - joystickBaseRect.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = joystickBaseRect.radius;
          if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
          }
          joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
          this.joystickX = dx / maxDist; // -1 to 1 (left/right)
          this.joystickZ = -dy / maxDist; // -1 to 1 (back/forward, inverted)
        }
      }
    }, { passive: false });

    const resetJoystick = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          joystickTouchId = null;
          this.joystickActive = false;
          this.joystickX = 0;
          this.joystickZ = 0;
          joystickThumb.style.transform = 'translate(0px, 0px)';
        }
      }
    };
    joystickArea.addEventListener('touchend', resetJoystick, { passive: false });
    joystickArea.addEventListener('touchcancel', resetJoystick, { passive: false });

    // --- CAMERA ROTATION ---
    let cameraTouchId = null;
    let lastCamX = 0, lastCamY = 0;
    const cameraSensitivity = 0.005;

    cameraArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (cameraTouchId !== null) return;
      const touch = e.changedTouches[0];
      cameraTouchId = touch.identifier;
      lastCamX = touch.clientX;
      lastCamY = touch.clientY;
    }, { passive: false });

    cameraArea.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === cameraTouchId && this.controller) {
          const dx = touch.clientX - lastCamX;
          const dy = touch.clientY - lastCamY;
          this.controller.rotY -= dx * cameraSensitivity;
          this.controller.pitch -= dy * cameraSensitivity;
          this.controller.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 4, this.controller.pitch));
          lastCamX = touch.clientX;
          lastCamY = touch.clientY;
        }
      }
    }, { passive: false });

    const resetCamera = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === cameraTouchId) {
          cameraTouchId = null;
        }
      }
    };
    cameraArea.addEventListener('touchend', resetCamera, { passive: false });
    cameraArea.addEventListener('touchcancel', resetCamera, { passive: false });

    // --- SHOOT BUTTON (supports hold for auto-fire + camera movement) ---
    let shootInterval = null;
    let shootTouchId = null;
    let lastShootX = 0, lastShootY = 0;
    const shootBtn = document.getElementById('shootBtn');
    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      shootTouchId = touch.identifier;
      lastShootX = touch.clientX;
      lastShootY = touch.clientY;
      this.mouseDown = true;
      this.audio.resume();
      this.tryShoot();
      shootInterval = setInterval(() => {
        if (this.weapons.getCurrentWeapon()?.auto) this.tryShoot();
      }, 100);
    }, { passive: false });
    shootBtn.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === shootTouchId && this.controller) {
          const dx = touch.clientX - lastShootX;
          const dy = touch.clientY - lastShootY;
          this.controller.rotY -= dx * cameraSensitivity;
          this.controller.pitch -= dy * cameraSensitivity;
          this.controller.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 4, this.controller.pitch));
          lastShootX = touch.clientX;
          lastShootY = touch.clientY;
        }
      }
    }, { passive: false });
    shootBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.mouseDown = false;
      shootTouchId = null;
      clearInterval(shootInterval);
    }, { passive: false });
    shootBtn.addEventListener('touchcancel', (e) => {
      this.mouseDown = false;
      shootTouchId = null;
      clearInterval(shootInterval);
    }, { passive: false });

    // --- SCOPE BUTTON (toggle) ---
    const scopeBtn = document.getElementById('scopeBtn');
    scopeBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!this.controller) return;
      this.controller.zoomed = !this.controller.zoomed;
      this.camera.fov = this.controller.zoomed ? 35 : 75;
      this.camera.updateProjectionMatrix();
      scopeBtn.classList.toggle('active', this.controller.zoomed);
    }, { passive: false });

    // --- JUMP ---
    document.getElementById('jumpBtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.controller) this.controller.keys['Space'] = true;
    }, { passive: false });
    document.getElementById('jumpBtn').addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.controller) this.controller.keys['Space'] = false;
    }, { passive: false });

    // --- PICKUP (repeats while held) ---
    let pickupInterval = null;
    document.getElementById('pickupBtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.tryPickup();
      pickupInterval = setInterval(() => this.tryPickup(), 200);
    }, { passive: false });
    document.getElementById('pickupBtn').addEventListener('touchend', (e) => {
      e.preventDefault();
      clearInterval(pickupInterval);
    }, { passive: false });
    document.getElementById('pickupBtn').addEventListener('touchcancel', () => {
      clearInterval(pickupInterval);
    }, { passive: false });

    // --- RELOAD ---
    document.getElementById('reloadBtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.reload();
    }, { passive: false });

    // --- GRENADE ---
    document.getElementById('grenadeBtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.throwGrenade();
    }, { passive: false });

    // --- DROP FROM AIRPLANE ---
    document.getElementById('dropBtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.inAirplane) {
        this.network.socket.emit('drop');
        this.inAirplane = false;
        this.dropping = true;
        document.getElementById('dropBtn').style.display = 'none';
      }
    }, { passive: false });

    // --- WEAPON SLOTS (make them work with touch) ---
    document.querySelectorAll('.weapon-slot').forEach(slot => {
      slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const weapon = slot.dataset.weapon;
        if (weapon) this.switchWeapon(weapon);
      }, { passive: false });
    });

    // Prevent default touch behavior on body
    document.body.addEventListener('touchmove', (e) => {
      if (this.running) e.preventDefault();
    }, { passive: false });
  }

  start(playerName) {
    this.playerName = playerName;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('loading').style.display = 'flex';

    this.network.connect();

    // Wait a bit for connection then join
    setTimeout(() => {
      this.network.joinGame(playerName);
    }, 500);
  }

  initGame(data) {
    document.getElementById('loading').style.display = 'none';

    this.buildings = data.buildings;

    // Build map
    this.map = new GameMap(this.scene, this.mapSize);
    this.map.build(data.buildings, data.trees);

    // Find local player
    const localData = data.players.find(p => p.id === this.network.playerId);
    if (localData) {
      // Setup controller
      this.controller = new PlayerController(this.camera, this.mapSize, data.buildings);
      this.controller.x = localData.x;
      this.controller.y = localData.y;
      this.controller.z = localData.z;

      // Create local player mesh
      this.localPlayer = new Player(this.scene, true);
      this.localPlayer.update(localData);

      // Airplane state
      this.inAirplane = localData.inAirplane || false;
      this.dropping = localData.dropping || false;

      // Mobile: show controls and configure
      if (this.isMobile && this.showMobileControls) {
        this.showMobileControls();
        this.controller.isMobile = true;
      }
    }

    // Create airplane mesh
    if (data.airplane) {
      this.createAirplaneMesh();
    }

    // Show drop instruction
    if (this.inAirplane) {
      this.showDropHint();
    }

    // Request pointer lock
    document.body.requestPointerLock();

    this.running = true;
    this.lastTime = performance.now();
    this.gameLoop();
  }

  createAirplaneMesh() {
    const group = new THREE.Group();
    // Fuselage
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 30, 8),
      new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    body.rotation.z = Math.PI / 2;
    group.add(body);
    // Wings
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
    );
    group.add(wing);
    // Tail
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(10, 8, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
    );
    tail.position.set(-14, 3, 0);
    group.add(tail);
    group.position.y = 100;
    this.scene.add(group);
    this.airplaneMesh = group;
  }

  showDropHint() {
    let hint = document.getElementById('dropHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'dropHint';
      hint.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:28px;font-weight:bold;text-align:center;text-shadow:2px 2px 4px #000;z-index:100;pointer-events:none;';
      hint.innerHTML = '🪂 اضغط SPACE أو F للقفز من الطائرة 🪂';
      document.body.appendChild(hint);
    }
    hint.style.display = 'block';
  }

  hideDropHint() {
    const hint = document.getElementById('dropHint');
    if (hint) hint.style.display = 'none';
  }

  tryPickup() {
    if (!this.controller || this.inAirplane || this.dropping) return;
    if (!this._currentLoot) return;
    // Find nearest loot within range
    let nearest = null;
    let nearestDist = 10;
    for (const item of this._currentLoot) {
      const dx = this.controller.x - item.x;
      const dz = this.controller.z - item.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = item;
      }
    }
    if (nearest) {
      this.network.socket.emit('pickup', { lootId: nearest.id });
    }
  }

  showPickupNotification(label) {
    let el = document.getElementById('pickupNotif');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pickupNotif';
      el.style.cssText = 'position:fixed;bottom:25%;left:50%;transform:translateX(-50%);color:#2ecc71;font-size:20px;font-weight:bold;text-shadow:1px 1px 3px #000;z-index:100;pointer-events:none;transition:opacity 0.5s;';
      document.body.appendChild(el);
    }
    el.textContent = `+ ${label}`;
    el.style.opacity = '1';
    clearTimeout(this._pickupTimer);
    this._pickupTimer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }

  updateLootMeshes(lootData) {
    if (!lootData) return;
    this._currentLoot = lootData;

    const currentIds = new Set(lootData.map(l => l.id));

    // Remove picked up loot
    this.lootMeshes.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(mesh);
        this.lootMeshes.delete(id);
      }
    });

    // Add new loot
    for (const item of lootData) {
      if (this.lootMeshes.has(item.id)) {
        // Animate rotation
        this.lootMeshes.get(item.id).rotation.y += 0.02;
        continue;
      }

      const group = new THREE.Group();

      // Glow base
      const baseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
      let color;
      if (item.type === 'weapon') color = 0xf39c12;
      else if (item.type === 'ammo') color = 0x3498db;
      else color = 0xe74c3c;

      const baseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      group.add(base);

      // Item box
      const boxGeo = new THREE.BoxGeometry(0.6, 0.4, 0.4);
      const boxMat = new THREE.MeshLambertMaterial({ color });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.y = 0.4;
      box.castShadow = true;
      group.add(box);

      group.position.set(item.x, item.y, item.z);
      this.scene.add(group);
      this.lootMeshes.set(item.id, group);
    }

    // Show pickup hint for nearest item
    this.updatePickupHint();
  }

  updatePickupHint() {
    let hint = document.getElementById('pickupHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'pickupHint';
      hint.style.cssText = 'position:fixed;bottom:35%;left:50%;transform:translateX(-50%);color:#fff;font-size:16px;text-shadow:1px 1px 3px #000;z-index:100;pointer-events:none;';
      document.body.appendChild(hint);
    }

    if (!this._currentLoot || !this.controller) {
      hint.style.display = 'none';
      return;
    }

    let nearest = null;
    let nearestDist = 5;
    for (const item of this._currentLoot) {
      const dx = this.controller.x - item.x;
      const dz = this.controller.z - item.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = item;
      }
    }

    if (nearest) {
      hint.textContent = `[E] التقط ${nearest.label}`;
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  }

  gameLoop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.gameLoop());

    const now = performance.now();
    const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.controller) {
      let moveAmount = 0;

      if (this.inAirplane || this.dropping) {
        // In airplane or dropping - don't allow movement, just update camera
        this.controller.pitch = -0.3; // Look down
        // Camera follows from above
        this.camera.position.set(this.controller.x - 10, this.controller.y + 15, this.controller.z - 10);
        this.camera.lookAt(this.controller.x, this.controller.y, this.controller.z);
      } else {
        // Pass joystick values to controller (mobile)
        if (this.isMobile) {
          this.controller.joystickX = this.joystickX || 0;
          this.controller.joystickZ = this.joystickZ || 0;
        }

        moveAmount = this.controller.update(deltaTime);

        // Send position to server
        if (now - this.lastSendTime > 50) {
          this.network.sendMove(this.controller.getPosition());
          this.lastSendTime = now;
        }
      }

      // Update local player mesh
      if (this.localPlayer) {
        this.localPlayer.update({
          x: this.controller.x,
          y: this.controller.y,
          z: this.controller.z,
          rotY: this.controller.rotY,
          health: this.localPlayer.health,
          alive: this.localPlayer.alive,
          weapon: this.weapons.currentWeapon
        });
        this.localPlayer.animateWalking(moveAmount);
      }

      // Auto-fire for auto weapons (only when on ground)
      if (this.mouseDown && !this.inAirplane && !this.dropping && this.weapons.getCurrentWeapon()?.auto) {
        this.tryShoot();
      }

      // Auto-pickup removed - using pickup button instead
    }

    // Update effects
    this.effects.update(deltaTime);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  updateFromServer(data) {
    if (!this.running) return;

    // Update zone
    if (this.map && data.zone) {
      this.map.updateZone(data.zone);

      // Zone warning
      if (this.controller) {
        const dx = this.controller.x - data.zone.x;
        const dz = this.controller.z - data.zone.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const outsideZone = dist > data.zone.radius;
        this.hud.showZoneWarning(outsideZone);
        if (outsideZone && (!this._lastZoneWarn || Date.now() - this._lastZoneWarn > 3000)) {
          this.audio.playZoneWarning();
          this._lastZoneWarn = Date.now();
        }
      }
    }

    // Update airplane position
    if (data.airplane && this.airplaneMesh) {
      const ap = data.airplane;
      if (ap.active) {
        const px = ap.startX + (ap.endX - ap.startX) * ap.progress;
        const pz = ap.startZ + (ap.endZ - ap.startZ) * ap.progress;
        this.airplaneMesh.position.set(px, ap.altitude, pz);
        this.airplaneMesh.rotation.y = Math.atan2(ap.endX - ap.startX, ap.endZ - ap.startZ);
        this.airplaneMesh.visible = true;
      } else {
        this.airplaneMesh.visible = false;
      }
    }

    // Update alive count
    this.hud.updateAliveCount(data.aliveCount);

    // Update local player health
    const localData = data.players.find(p => p.id === this.network.playerId);
    if (localData && this.localPlayer) {
      // Update airplane/drop state
      if (localData.inAirplane) {
        this.inAirplane = true;
        this.dropping = false;
        if (this.isMobile) document.getElementById('dropBtn').style.display = 'flex';
        this.controller.x = localData.x;
        this.controller.y = localData.y;
        this.controller.z = localData.z;
      } else if (localData.dropping) {
        this.inAirplane = false;
        this.dropping = true;
        this.hideDropHint();
        if (this.isMobile) document.getElementById('dropBtn').style.display = 'none';
        this.controller.x = localData.x;
        this.controller.y = localData.y;
        this.controller.z = localData.z;
      } else if (this.dropping && !localData.dropping) {
        // Just landed
        this.dropping = false;
        this.controller.x = localData.x;
        this.controller.y = 1.5;
        this.controller.z = localData.z;
      }

      this.localPlayer.health = localData.health;
      this.localPlayer.alive = localData.alive;

      // Damage effect
      if (localData.health < this.previousHealth) {
        this.hud.showDamage();
        this.audio.playHurt();
      }
      this.previousHealth = localData.health;

      this.hud.updateHealth(localData.health);
      this.hud.updateWeapon(this.weapons.currentWeapon, this.weapons.weapons, this.weapons.ammo, this.weapons.grenades);

      if (!localData.alive) {
        // Player died - show spectator
        this.running = false;
        setTimeout(() => {
          this.showGameOver({ winner: 'None', isBot: true, youDied: true });
        }, 1500);
      }
    }

    // Update remote players
    const currentIds = new Set();
    data.players.forEach(p => {
      if (p.id === this.network.playerId) return;
      currentIds.add(p.id);

      if (!this.remotePlayers.has(p.id)) {
        const rp = new Player(this.scene, false);
        rp.updateNameTag(p.name);
        this.remotePlayers.set(p.id, rp);
      }
      this.remotePlayers.get(p.id).update(p);
    });

    // Remove disconnected players
    this.remotePlayers.forEach((player, id) => {
      if (!currentIds.has(id)) {
        player.remove();
        this.remotePlayers.delete(id);
      }
    });

    // Update bots
    const botIds = new Set();
    data.bots.forEach(b => {
      botIds.add(b.id);
      if (!this.remoteBots.has(b.id)) {
        const bot = new Player(this.scene, false);
        bot.updateNameTag(b.name);
        this.remoteBots.set(b.id, bot);
      }
      this.remoteBots.get(b.id).update(b);
    });

    // Remove dead bots
    this.remoteBots.forEach((bot, id) => {
      if (!botIds.has(id)) {
        bot.remove();
        this.remoteBots.delete(id);
      }
    });

    // Update loot
    this.updateLootMeshes(data.loot);

    // Update minimap
    if (this.controller) {
      const allEntities = [...data.players.filter(p => p.id !== this.network.playerId), ...data.bots];
      this.hud.updateMinimap(
        this.controller.x, this.controller.z, this.controller.rotY,
        allEntities, data.zone, this.buildings
      );
    }
  }

  tryShoot() {
    if (!this.controller || !this.localPlayer?.alive) return;
    if (this.inAirplane || this.dropping) return;
    if (!this.weapons.currentWeapon) return; // No weapon equipped

    if (this.weapons.shoot()) {
      // Raycast from camera center (crosshair) to find target point in world
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const targetPoint = raycaster.ray.at(300, new THREE.Vector3()); // 300 units ahead

      // Muzzle position (gun position)
      const muzzleX = this.controller.x + Math.sin(this.controller.rotY) * 2 + Math.cos(this.controller.rotY) * 0.8;
      const muzzleY = this.controller.y + 1.5;
      const muzzleZ = this.controller.z + Math.cos(this.controller.rotY) * 2 - Math.sin(this.controller.rotY) * 0.8;

      // Calculate direction from muzzle to target point
      const dirX = targetPoint.x - muzzleX;
      const dirY = targetPoint.y - muzzleY;
      const dirZ = targetPoint.z - muzzleZ;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

      // Send normalized direction to server
      this.network.sendShoot(this.controller.rotY, this.controller.pitch, {
        dx: dirX / dirLen,
        dy: dirY / dirLen,
        dz: dirZ / dirLen
      });

      // Local muzzle flash + sound
      this.effects.createMuzzleFlash(muzzleX, muzzleY, muzzleZ);
      this.audio.playShot(this.weapons.currentWeapon);

      // Update HUD
      this.hud.updateWeapon(this.weapons.currentWeapon, this.weapons.weapons, this.weapons.ammo, this.weapons.grenades);

      // Camera recoil
      this.controller.pitch += (Math.random() - 0.3) * 0.02;
    } else if (this.weapons.currentWeapon && this.weapons.ammo[this.weapons.currentWeapon] <= 0 && !this.weapons.reloading) {
      this.reload();
    }
  }

  reload() {
    this.weapons.reload();
    this.network.sendReload();
    this.audio.playReload();
  }

  switchWeapon(weapon) {
    if (this.weapons.switchWeapon(weapon)) {
      this.network.sendSwitchWeapon(weapon);
      this.hud.updateWeapon(weapon, this.weapons.weapons, this.weapons.ammo, this.weapons.grenades);
      this.audio.playWeaponSwitch();
    }
  }

  throwGrenade() {
    if (this.weapons.grenades <= 0) return;
    this.weapons.grenades--;
    this.network.sendThrowGrenade(this.controller.rotY);
    this.hud.updateWeapon(this.weapons.currentWeapon, this.weapons.weapons, this.weapons.ammo, this.weapons.grenades);
  }

  showGameOver(data) {
    this.running = false;
    document.exitPointerLock();
    document.body.style.cursor = 'auto';

    const gameOverEl = document.getElementById('gameOver');
    const titleEl = document.getElementById('gameOverTitle');
    const statsEl = document.getElementById('gameOverStats');

    gameOverEl.style.display = 'flex';

    if (data.youDied) {
      titleEl.textContent = '💀 GAME OVER';
      titleEl.className = 'loser';
      statsEl.innerHTML = `<p>تم القضاء عليك!</p><p>الفائز: ${this.escapeHtml(data.winner || 'Unknown')}</p>`;
    } else if (data.winner === this.playerName) {
      titleEl.textContent = '🏆 WINNER WINNER CHICKEN DINNER! 🏆';
      titleEl.className = 'winner';
      statsEl.innerHTML = `<p>أنت الفائز! 🎉</p>`;
    } else {
      titleEl.textContent = 'GAME OVER';
      titleEl.className = '';
      statsEl.innerHTML = `<p>الفائز: ${this.escapeHtml(data.winner)}</p>`;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global join function
function joinGame() {
  const nameInput = document.getElementById('playerName');
  const name = nameInput.value.trim() || 'Player_' + Math.floor(Math.random() * 1000);

  game = new Game();
  game.start(name);
}
