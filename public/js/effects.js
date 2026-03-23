// Visual Effects System
class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.bulletTrails = [];
    this.muzzleFlashes = [];
  }

  update(deltaTime) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.add(p.velocity.clone().multiplyScalar(deltaTime));
      p.velocity.y -= 9.8 * deltaTime; // gravity
      const alpha = p.life / p.maxLife;
      p.mesh.material.opacity = alpha;
      p.mesh.scale.setScalar(alpha * p.scale);
    }

    // Update bullet trails
    for (let i = this.bulletTrails.length - 1; i >= 0; i--) {
      const trail = this.bulletTrails[i];
      trail.life -= deltaTime;
      if (trail.life <= 0) {
        this.scene.remove(trail.mesh);
        trail.mesh.geometry.dispose();
        trail.mesh.material.dispose();
        this.bulletTrails.splice(i, 1);
        continue;
      }
      trail.mesh.material.opacity = trail.life / trail.maxLife;
    }

    // Update muzzle flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const flash = this.muzzleFlashes[i];
      flash.life -= deltaTime;
      if (flash.life <= 0) {
        this.scene.remove(flash.mesh);
        flash.mesh.geometry.dispose();
        flash.mesh.material.dispose();
        this.muzzleFlashes.splice(i, 1);
      }
    }
  }

  createExplosion(x, y, z) {
    // Central flash
    const flashGeo = new THREE.SphereGeometry(3, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 1
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(x, y + 1, z);
    this.scene.add(flash);
    this.particles.push({
      mesh: flash, velocity: new THREE.Vector3(0, 2, 0),
      life: 0.5, maxLife: 0.5, scale: 3
    });

    // Explosion particles
    const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff0000, 0x444444];
    for (let i = 0; i < 30; i++) {
      const size = 0.3 + Math.random() * 0.8;
      const geo = new THREE.SphereGeometry(size, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 1, z);
      this.scene.add(mesh);

      const speed = 5 + Math.random() * 15;
      const angle = Math.random() * Math.PI * 2;
      const upSpeed = 3 + Math.random() * 10;

      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          upSpeed,
          Math.sin(angle) * speed
        ),
        life: 0.5 + Math.random() * 1,
        maxLife: 1.5,
        scale: size
      });
    }

    // Smoke
    for (let i = 0; i < 10; i++) {
      const size = 1 + Math.random() * 2;
      const geo = new THREE.SphereGeometry(size, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x555555,
        transparent: true,
        opacity: 0.6
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 3,
        y + 2 + Math.random() * 3,
        z + (Math.random() - 0.5) * 3
      );
      this.scene.add(mesh);

      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          2 + Math.random() * 3,
          (Math.random() - 0.5) * 2
        ),
        life: 1 + Math.random() * 2,
        maxLife: 3,
        scale: size
      });
    }

    // Ground ring
    const ringGeo = new THREE.RingGeometry(0.5, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.1, z);
    this.scene.add(ring);
    this.particles.push({
      mesh: ring, velocity: new THREE.Vector3(0, 0, 0),
      life: 1, maxLife: 1, scale: 1
    });
  }

  createBulletTrail(fromX, fromY, fromZ, toX, toY, toZ) {
    const direction = new THREE.Vector3(toX - fromX, toY - fromY, toZ - fromZ);
    const length = direction.length();
    direction.normalize();

    const geo = new THREE.CylinderGeometry(0.02, 0.02, length, 4);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    const trail = new THREE.Mesh(geo, mat);

    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    const midZ = (fromZ + toZ) / 2;
    trail.position.set(midX, midY, midZ);
    trail.lookAt(toX, toY, toZ);

    this.scene.add(trail);
    this.bulletTrails.push({
      mesh: trail,
      life: 0.15,
      maxLife: 0.15
    });
  }

  createMuzzleFlash(x, y, z) {
    const flashGeo = new THREE.SphereGeometry(0.3, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 1
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(x, y, z);
    this.scene.add(flash);
    this.muzzleFlashes.push({ mesh: flash, life: 0.05 });

    // Point light flash
    const light = new THREE.PointLight(0xffaa00, 3, 10);
    light.position.set(x, y, z);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 50);
  }

  createGrenadeTrail(fromX, fromY, fromZ, toX, toZ) {
    // Grenade arc visualization
    const points = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      const y = fromY + Math.sin(t * Math.PI) * 10; // arc
      points.push(new THREE.Vector3(x, y, z));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.5
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    // Remove after 3 seconds
    setTimeout(() => {
      this.scene.remove(line);
      geo.dispose();
      mat.dispose();
    }, 3000);

    // Grenade ball
    const grenadeGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const grenade = new THREE.Mesh(grenadeGeo, grenadeMat);
    grenade.position.set(fromX, fromY, fromZ);
    this.scene.add(grenade);

    // Animate grenade
    const startTime = Date.now();
    const duration = 3000;
    const animateGrenade = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      grenade.position.x = fromX + (toX - fromX) * t;
      grenade.position.z = fromZ + (toZ - fromZ) * t;
      grenade.position.y = fromY + Math.sin(t * Math.PI) * 10;
      grenade.rotation.x += 0.1;
      grenade.rotation.z += 0.05;

      if (t < 1) {
        requestAnimationFrame(animateGrenade);
      } else {
        this.scene.remove(grenade);
        grenadeGeo.dispose();
        grenadeMat.dispose();
      }
    };
    animateGrenade();
  }
}
