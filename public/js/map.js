// Map Builder - Creates the 3D world
class GameMap {
  constructor(scene, mapSize) {
    this.scene = scene;
    this.mapSize = mapSize;
    this.buildings = [];
    this.trees = [];
    this.zoneMesh = null;
    this.zoneRadius = mapSize / 2;
  }

  build(buildingsData, treesData) {
    this.createGround();
    this.createSkybox();
    this.createBuildings(buildingsData);
    this.createTrees(treesData);
    this.createZone();
    this.createLighting();
  }

  createGround() {
    // Main ground
    const groundGeo = new THREE.PlaneGeometry(this.mapSize, this.mapSize, 50, 50);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a7c3f });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Ground grid lines for orientation
    const gridHelper = new THREE.GridHelper(this.mapSize, 50, 0x3a6c2f, 0x3a6c2f);
    gridHelper.position.y = 0.05;
    gridHelper.material.opacity = 0.15;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    // Map boundary walls
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: 0.3 });
    const wallH = 30;
    const half = this.mapSize / 2;

    const walls = [
      { pos: [0, wallH/2, -half], size: [this.mapSize, wallH, 2] },
      { pos: [0, wallH/2, half], size: [this.mapSize, wallH, 2] },
      { pos: [-half, wallH/2, 0], size: [2, wallH, this.mapSize] },
      { pos: [half, wallH/2, 0], size: [2, wallH, this.mapSize] }
    ];

    walls.forEach(w => {
      const geo = new THREE.BoxGeometry(...w.size);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(...w.pos);
      this.scene.add(mesh);
    });
  }

  createSkybox() {
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 150, 400);
  }

  createBuildings(buildingsData) {
    buildingsData.forEach(b => {
      const group = new THREE.Group();

      // Main building body
      const bodyGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const bodyMat = new THREE.MeshLambertMaterial({ color: b.color });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Roof
      const roofGeo = new THREE.BoxGeometry(b.w + 1, 0.5, b.d + 1);
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = b.h / 2 + 0.25;
      roof.castShadow = true;
      group.add(roof);

      // Windows
      const winMat = new THREE.MeshLambertMaterial({ color: 0x88ccff, emissive: 0x224466 });
      const winSize = 1.5;
      for (let side = 0; side < 4; side++) {
        const numWins = Math.floor((side % 2 === 0 ? b.w : b.d) / 6);
        for (let i = 0; i < numWins; i++) {
          const winGeo = new THREE.BoxGeometry(
            side % 2 === 0 ? winSize : 0.2,
            winSize,
            side % 2 === 0 ? 0.2 : winSize
          );
          const win = new THREE.Mesh(winGeo, winMat);
          const offset = (i - (numWins - 1) / 2) * 6;
          switch (side) {
            case 0: win.position.set(offset, 1, b.d / 2 + 0.1); break;
            case 1: win.position.set(offset, 1, -b.d / 2 - 0.1); break;
            case 2: win.position.set(b.w / 2 + 0.1, 1, offset); break;
            case 3: win.position.set(-b.w / 2 - 0.1, 1, offset); break;
          }
          group.add(win);
        }
      }

      group.position.set(b.x, b.y, b.z);
      this.scene.add(group);
      this.buildings.push({ mesh: group, data: b });
    });
  }

  createTrees(treesData) {
    treesData.forEach(t => {
      const group = new THREE.Group();

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.3 * t.scale, 0.5 * t.scale, 4 * t.scale, 8);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2 * t.scale;
      trunk.castShadow = true;
      group.add(trunk);

      // Leaves (3 layers)
      const leafColors = [0x228B22, 0x2E8B57, 0x32CD32];
      for (let i = 0; i < 3; i++) {
        const radius = (3 - i * 0.7) * t.scale;
        const leafGeo = new THREE.SphereGeometry(radius, 8, 6);
        const leafMat = new THREE.MeshLambertMaterial({ color: leafColors[i] });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = (4.5 + i * 1.8) * t.scale;
        leaf.castShadow = true;
        group.add(leaf);
      }

      group.position.set(t.x, 0, t.z);
      this.scene.add(group);
      this.trees.push(group);
    });
  }

  createZone() {
    const segments = 64;
    const geo = new THREE.CylinderGeometry(this.mapSize / 2, this.mapSize / 2, 50, segments, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3498db,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.zoneMesh = new THREE.Mesh(geo, mat);
    this.zoneMesh.position.y = 25;
    this.scene.add(this.zoneMesh);

    // Zone edge glow ring on ground
    const ringGeo = new THREE.RingGeometry(this.mapSize / 2 - 1, this.mapSize / 2, segments);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3498db,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    this.zoneRing = new THREE.Mesh(ringGeo, ringMat);
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.position.y = 0.2;
    this.scene.add(this.zoneRing);
  }

  updateZone(zone) {
    if (!this.zoneMesh) return;
    this.zoneRadius = zone.radius;

    // Update cylinder
    this.zoneMesh.geometry.dispose();
    this.zoneMesh.geometry = new THREE.CylinderGeometry(zone.radius, zone.radius, 50, 64, 1, true);
    this.zoneMesh.position.set(zone.x, 25, zone.z);

    // Update ring
    this.zoneRing.geometry.dispose();
    this.zoneRing.geometry = new THREE.RingGeometry(zone.radius - 1, zone.radius, 64);
    this.zoneRing.position.set(zone.x, 0.2, zone.z);
  }

  createLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x404050, 0.6);
    this.scene.add(ambient);

    // Directional (sun)
    const sun = new THREE.DirectionalLight(0xffeedd, 0.8);
    sun.position.set(100, 150, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    this.scene.add(sun);

    // Hemisphere light
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a7c3f, 0.4);
    this.scene.add(hemi);
  }
}
