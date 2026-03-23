// Weapons system
class WeaponsSystem {
  constructor() {
    this.weapons = {
      ar: {
        name: 'AR-15',
        damage: 25,
        fireRate: 150,
        range: 200,
        magSize: 30,
        reloadTime: 2000,
        spread: 0.03,
        auto: true
      },
      sniper: {
        name: 'AWM Sniper',
        damage: 80,
        fireRate: 1500,
        range: 500,
        magSize: 5,
        reloadTime: 3000,
        spread: 0.005,
        auto: false
      },
      shotgun: {
        name: 'S12K Shotgun',
        damage: 20,
        fireRate: 800,
        range: 50,
        magSize: 8,
        reloadTime: 2500,
        spread: 0.15,
        pellets: 5,
        auto: false
      }
    };

    this.currentWeapon = null; // Start with no weapon
    this.inventory = []; // Collected weapons
    this.ammo = { ar: 0, sniper: 0, shotgun: 0 };
    this.grenades = 0;
    this.lastShotTime = 0;
    this.reloading = false;
    this.reloadStart = 0;
    this.mouseDown = false;
    this.zoomed = false;
  }

  getCurrentWeapon() {
    if (!this.currentWeapon) return null;
    return this.weapons[this.currentWeapon];
  }

  canShoot() {
    if (!this.currentWeapon) return false;
    if (this.reloading) return false;
    if (this.ammo[this.currentWeapon] <= 0) return false;
    const now = Date.now();
    return (now - this.lastShotTime) >= this.getCurrentWeapon().fireRate;
  }

  shoot() {
    if (!this.canShoot()) return false;
    this.ammo[this.currentWeapon]--;
    this.lastShotTime = Date.now();
    return true;
  }

  reload() {
    if (this.reloading || !this.currentWeapon) return;
    const weapon = this.getCurrentWeapon();
    if (this.ammo[this.currentWeapon] >= weapon.magSize) return;

    this.reloading = true;
    this.reloadStart = Date.now();

    setTimeout(() => {
      this.ammo[this.currentWeapon] = weapon.magSize;
      this.reloading = false;
    }, weapon.reloadTime);
  }

  switchWeapon(weapon) {
    if (this.weapons[weapon] && weapon !== this.currentWeapon && this.inventory.includes(weapon)) {
      this.currentWeapon = weapon;
      this.reloading = false;
      return true;
    }
    return false;
  }

  createWeaponModel(scene) {
    // Simple weapon models
    const models = {};

    // AR
    const arGroup = new THREE.Group();
    const arBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    arGroup.add(arBody);
    const arStock = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.2, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x8B4513 })
    );
    arStock.position.set(0, -0.05, -0.6);
    arGroup.add(arStock);
    const arBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    arBarrel.rotation.x = Math.PI / 2;
    arBarrel.position.set(0, 0, 0.85);
    arGroup.add(arBarrel);
    models.ar = arGroup;

    // Sniper
    const sniperGroup = new THREE.Group();
    const sniperBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x2c3e50 })
    );
    sniperGroup.add(sniperBody);
    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    scope.position.set(0, 0.12, 0.2);
    sniperGroup.add(scope);
    const sniperBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    sniperBarrel.rotation.x = Math.PI / 2;
    sniperBarrel.position.set(0, 0, 1.1);
    sniperGroup.add(sniperBarrel);
    models.sniper = sniperGroup;

    // Shotgun
    const sgGroup = new THREE.Group();
    const sgBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.14, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    );
    sgGroup.add(sgBody);
    const sgPump = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x8B4513 })
    );
    sgPump.position.set(0, -0.1, 0.2);
    sgGroup.add(sgPump);
    const sgBarrel1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    sgBarrel1.rotation.x = Math.PI / 2;
    sgBarrel1.position.set(0, 0, 0.7);
    sgGroup.add(sgBarrel1);
    models.shotgun = sgGroup;

    return models;
  }
}
