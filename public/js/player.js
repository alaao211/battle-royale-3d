// Player class - handles local player and remote player rendering
class Player {
  constructor(scene, isLocal) {
    this.scene = scene;
    this.isLocal = isLocal;
    this.mesh = null;
    this.weaponMeshes = {};
    this.currentWeaponMesh = null;

    this.x = 0;
    this.y = 1.5;
    this.z = 0;
    this.rotY = 0;
    this.health = 100;
    this.alive = true;
    this.weapon = null;
    this.prevX = 0;
    this.prevZ = 0;

    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();

    const bodyColor = this.isLocal ? 0x3498db : 0xe74c3c;
    const armColor = this.isLocal ? 0x2980b9 : 0xc0392b;

    // Body (torso)
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.45, 1.5, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0;
    body.castShadow = true;
    this.mesh.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.1;
    head.castShadow = true;
    this.mesh.add(head);

    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.38, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.15;
    this.mesh.add(helmet);

    // Arms - use pivots for animation
    const armGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.8, 6);
    const armMat = new THREE.MeshLambertMaterial({ color: armColor });

    // Left arm pivot (at shoulder)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.65, 0.35, 0);
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.y = -0.4; // arm hangs from pivot
    this.leftArmPivot.add(leftArm);
    this.mesh.add(this.leftArmPivot);

    // Right arm pivot (at shoulder)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.65, 0.35, 0);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.y = -0.4;
    this.rightArmPivot.add(rightArm);
    this.mesh.add(this.rightArmPivot);

    // Weapon holder (attached to right arm)
    this.weaponHolder = new THREE.Group();
    this.weaponHolder.position.set(0, -0.7, 0.3);
    this.rightArmPivot.add(this.weaponHolder);

    // Legs with pivots
    const legGeo = new THREE.CylinderGeometry(0.15, 0.13, 0.8, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.2, -0.75, 0);
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.y = -0.4;
    this.leftLegPivot.add(leftLeg);
    this.mesh.add(this.leftLegPivot);
    this.leftLeg = this.leftLegPivot;

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.2, -0.75, 0);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.y = -0.4;
    this.rightLegPivot.add(rightLeg);
    this.mesh.add(this.rightLegPivot);
    this.rightLeg = this.rightLegPivot;

    // Name tag (for remote players)
    if (!this.isLocal) {
      this.nameTag = this.createNameTag('Player');
      this.nameTag.position.y = 2;
      this.mesh.add(this.nameTag);
    }

    // Health bar above head (for remote players)
    if (!this.isLocal) {
      this.healthBarGroup = new THREE.Group();
      const bgGeo = new THREE.PlaneGeometry(1.2, 0.12);
      const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      this.healthBarGroup.add(bg);

      const fillGeo = new THREE.PlaneGeometry(1.2, 0.1);
      const fillMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
      this.healthFill = new THREE.Mesh(fillGeo, fillMat);
      this.healthFill.position.z = 0.01;
      this.healthBarGroup.add(this.healthFill);

      this.healthBarGroup.position.y = 1.7;
      this.mesh.add(this.healthBarGroup);
    }

    this.scene.add(this.mesh);
  }

  createNameTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  updateNameTag(name) {
    if (this.nameTag) {
      this.mesh.remove(this.nameTag);
      this.nameTag.material.map.dispose();
      this.nameTag.material.dispose();
      this.nameTag = this.createNameTag(name);
      this.nameTag.position.y = 2;
      this.mesh.add(this.nameTag);
    }
  }

  update(data) {
    if (!this.mesh) return;

    // Smooth interpolation for remote players
    if (!this.isLocal) {
      this.x += (data.x - this.x) * 0.3;
      this.y += (data.y - this.y) * 0.3;
      this.z += (data.z - this.z) * 0.3;
    } else {
      this.x = data.x;
      this.y = data.y;
      this.z = data.z;
    }

    this.rotY = data.rotY;
    this.health = data.health;
    this.alive = data.alive;

    // Update weapon model if changed
    const prevWeapon = this.weapon;
    this.weapon = data.weapon;
    if (this.weapon !== prevWeapon) {
      this.updateWeaponModel();
    }

    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.rotY;
    this.mesh.visible = this.alive;

    // Auto-animate remote players based on position change
    if (!this.isLocal) {
      const dx = this.x - this.prevX;
      const dz = this.z - this.prevZ;
      const moveSpeed = Math.sqrt(dx * dx + dz * dz);
      this.animateWalking(moveSpeed);
      this.prevX = this.x;
      this.prevZ = this.z;
    }

    // Update health bar
    if (this.healthFill) {
      const ratio = Math.max(0, this.health / 100);
      this.healthFill.scale.x = ratio;
      this.healthFill.position.x = -(1 - ratio) * 0.6;
      if (this.health > 60) this.healthFill.material.color.setHex(0x2ecc71);
      else if (this.health > 30) this.healthFill.material.color.setHex(0xf39c12);
      else this.healthFill.material.color.setHex(0xe74c3c);
    }

    // Make name/health face camera
    if (this.healthBarGroup) {
      this.healthBarGroup.lookAt(
        this.scene.children.find(c => c.isCamera)?.position || new THREE.Vector3(0, 10, 10)
      );
    }
  }

  animateWalking(speed) {
    if (!this.leftLeg || !this.rightLeg) return;

    const time = Date.now() * 0.008;
    const isMoving = speed > 0.1;

    // Leg animation
    if (isMoving) {
      const legSwing = Math.sin(time) * 0.6;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;
    } else {
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
    }

    // Arm animation
    if (this.leftArmPivot && this.rightArmPivot) {
      if (this.weapon) {
        // Holding weapon - arms raised and forward
        const targetRightX = -1.2; // arm forward holding gun
        const targetLeftX = -1.0;
        this.rightArmPivot.rotation.x += (targetRightX - this.rightArmPivot.rotation.x) * 0.15;
        this.leftArmPivot.rotation.x += (targetLeftX - this.leftArmPivot.rotation.x) * 0.15;

        // Slight sway when moving
        if (isMoving) {
          this.rightArmPivot.rotation.x += Math.sin(time * 0.5) * 0.03;
          this.leftArmPivot.rotation.x += Math.sin(time * 0.5 + 0.5) * 0.03;
        }
      } else {
        // Empty hands - arms swing naturally when walking
        if (isMoving) {
          this.leftArmPivot.rotation.x = Math.sin(time) * 0.4;
          this.rightArmPivot.rotation.x = -Math.sin(time) * 0.4;
        } else {
          // Idle - arms hang down
          this.leftArmPivot.rotation.x *= 0.85;
          this.rightArmPivot.rotation.x *= 0.85;
        }
      }
    }

    // Body sway when moving
    if (isMoving) {
      this.mesh.children[0].rotation.z = Math.sin(time * 2) * 0.02; // subtle torso sway
    }
  }

  updateWeaponModel() {
    if (!this.weaponHolder) return;

    // Clear existing weapon
    while (this.weaponHolder.children.length > 0) {
      this.weaponHolder.remove(this.weaponHolder.children[0]);
    }

    if (!this.weapon) return;

    // Create simple weapon model based on type
    const gunColor = 0x333333;
    const woodColor = 0x8B4513;

    if (this.weapon === 'ar') {
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.8),
        new THREE.MeshLambertMaterial({ color: gunColor })
      );
      barrel.position.z = 0.3;
      this.weaponHolder.add(barrel);
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.12, 0.25),
        new THREE.MeshLambertMaterial({ color: woodColor })
      );
      stock.position.z = -0.2;
      this.weaponHolder.add(stock);
    } else if (this.weapon === 'sniper') {
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x2c3e50 })
      );
      barrel.position.z = 0.5;
      this.weaponHolder.add(barrel);
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      scope.position.set(0, 0.06, 0.3);
      this.weaponHolder.add(scope);
    } else if (this.weapon === 'shotgun') {
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.08, 0.7),
        new THREE.MeshLambertMaterial({ color: gunColor })
      );
      barrel.position.z = 0.25;
      this.weaponHolder.add(barrel);
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.06, 0.2),
        new THREE.MeshLambertMaterial({ color: woodColor })
      );
      pump.position.set(0, -0.05, 0.1);
      this.weaponHolder.add(pump);
    }
  }

  remove() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
    }
  }
}

// Player controller for local player
class PlayerController {
  constructor(camera, mapSize, buildings) {
    this.camera = camera;
    this.mapSize = mapSize;
    this.buildings = buildings || [];

    this.x = 0;
    this.y = 1.5;
    this.z = 0;
    this.rotY = 0;
    this.pitch = 0;

    this.moveSpeed = 15;
    this.jumpForce = 8;
    this.gravity = 20;
    this.velocityY = 0;
    this.onGround = true;

    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.sensitivity = 0.003;

    this.cameraDistance = 8;
    this.cameraHeight = 4;
    this.zoomed = false;
    this.isMobile = false;

    // Joystick input (set by game.js on mobile)
    this.joystickX = 0;
    this.joystickZ = 0;

    this.setupInput();
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  update(deltaTime) {
    // Mouse look
    this.rotY -= this.mouseDX * this.sensitivity;
    this.pitch -= this.mouseDY * this.sensitivity;
    this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 4, this.pitch));
    this.mouseDX = 0;
    this.mouseDY = 0;

    // Movement
    let moveX = 0;
    let moveZ = 0;
    const speed = this.moveSpeed * deltaTime;

    // Keyboard movement
    if (this.keys['KeyW']) { moveX += Math.sin(this.rotY) * speed; moveZ += Math.cos(this.rotY) * speed; }
    if (this.keys['KeyS']) { moveX -= Math.sin(this.rotY) * speed; moveZ -= Math.cos(this.rotY) * speed; }
    if (this.keys['KeyA']) { moveX += Math.sin(this.rotY + Math.PI/2) * speed; moveZ += Math.cos(this.rotY + Math.PI/2) * speed; }
    if (this.keys['KeyD']) { moveX -= Math.sin(this.rotY + Math.PI/2) * speed; moveZ -= Math.cos(this.rotY + Math.PI/2) * speed; }

    // Joystick movement (mobile)
    if (this.joystickX !== 0 || this.joystickZ !== 0) {
      // Forward/back relative to camera direction
      moveX += Math.sin(this.rotY) * this.joystickZ * speed;
      moveZ += Math.cos(this.rotY) * this.joystickZ * speed;
      // Strafe left/right
      moveX += Math.sin(this.rotY + Math.PI/2) * this.joystickX * speed;
      moveZ += Math.cos(this.rotY + Math.PI/2) * this.joystickX * speed;
    }

    // Check building collision
    const newX = this.x + moveX;
    const newZ = this.z + moveZ;
    const half = this.mapSize / 2 - 2;

    let canMoveX = true;
    let canMoveZ = true;

    for (const b of this.buildings) {
      const bx1 = b.x - b.w / 2 - 1.2;
      const bx2 = b.x + b.w / 2 + 1.2;
      const bz1 = b.z - b.d / 2 - 1.2;
      const bz2 = b.z + b.d / 2 + 1.2;

      if (newX > bx1 && newX < bx2 && this.z > bz1 && this.z < bz2) canMoveX = false;
      if (this.x > bx1 && this.x < bx2 && newZ > bz1 && newZ < bz2) canMoveZ = false;
    }

    if (canMoveX) this.x = Math.max(-half, Math.min(half, newX));
    if (canMoveZ) this.z = Math.max(-half, Math.min(half, newZ));

    // Jump & gravity
    if (this.keys['Space'] && this.onGround) {
      this.velocityY = this.jumpForce;
      this.onGround = false;
    }

    this.velocityY -= this.gravity * deltaTime;
    this.y += this.velocityY * deltaTime;

    if (this.y <= 1.5) {
      this.y = 1.5;
      this.velocityY = 0;
      this.onGround = true;
    }

    // Update camera - over-the-shoulder style
    const camDist = this.zoomed ? 5 : this.cameraDistance;
    const camH = this.zoomed ? 2.5 : this.cameraHeight;
    const shoulderOffset = this.zoomed ? 1.2 : 0.8; // offset to the right

    // Camera position behind and slightly to the right of player
    const camX = this.x - Math.sin(this.rotY) * camDist * Math.cos(this.pitch)
                + Math.cos(this.rotY) * shoulderOffset;
    const camY = this.y + camH - Math.sin(this.pitch) * camDist;
    const camZ = this.z - Math.cos(this.rotY) * camDist * Math.cos(this.pitch)
                - Math.sin(this.rotY) * shoulderOffset;

    // Look at point ahead of the player, including pitch
    const lookAheadDist = this.zoomed ? 15 : 5;
    const lookX = this.x + Math.sin(this.rotY) * lookAheadDist * Math.cos(this.pitch);
    const lookY = this.y + 1.5 + Math.sin(this.pitch) * lookAheadDist;
    const lookZ = this.z + Math.cos(this.rotY) * lookAheadDist * Math.cos(this.pitch);

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(lookX, lookY, lookZ);

    const moveAmount = Math.sqrt(moveX * moveX + moveZ * moveZ);
    return moveAmount;
  }

  getPosition() {
    return { x: this.x, y: this.y, z: this.z, rotY: this.rotY };
  }
}
