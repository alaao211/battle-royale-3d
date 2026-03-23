// HUD Manager
class HUD {
  constructor() {
    this.healthFill = document.getElementById('healthFill');
    this.healthText = document.getElementById('healthText');
    this.weaponName = document.getElementById('weaponName');
    this.ammoCount = document.getElementById('ammoCount');
    this.grenadeCount = document.getElementById('grenadeCount');
    this.aliveNumber = document.getElementById('aliveNumber');
    this.killFeed = document.getElementById('killFeed');
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap.getContext('2d');
    this.damageOverlay = document.getElementById('damageOverlay');
    this.zoneWarning = document.getElementById('zoneWarning');
    this.killNotification = document.getElementById('killNotification');
    this.weaponSlots = document.querySelectorAll('.weapon-slot');

    this.killFeedEntries = [];
    this.mapSize = 500;
  }

  updateHealth(health) {
    const pct = Math.max(0, Math.min(100, health));
    this.healthFill.style.width = pct + '%';
    this.healthText.textContent = Math.ceil(pct);

    if (pct > 60) {
      this.healthFill.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
    } else if (pct > 30) {
      this.healthFill.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
    } else {
      this.healthFill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
    }
  }

  updateWeapon(weaponKey, weapons, ammo, grenades) {
    if (!weaponKey) {
      this.weaponName.textContent = 'No Weapon';
      this.ammoCount.textContent = '-- / --';
      this.grenadeCount.textContent = `${grenades}`;
      this.weaponSlots.forEach(slot => slot.classList.remove('active'));
      return;
    }

    const weapon = weapons[weaponKey];
    if (!weapon) return;

    this.weaponName.textContent = weapon.name;
    this.ammoCount.textContent = `${ammo[weaponKey]} / ${weapon.magSize}`;
    this.grenadeCount.textContent = `${grenades}`;

    this.weaponSlots.forEach(slot => {
      slot.classList.toggle('active', slot.dataset.weapon === weaponKey);
      // Highlight slots that have weapons in inventory
      if (window.game && window.game.weapons && window.game.weapons.inventory) {
        slot.classList.toggle('has-weapon', window.game.weapons.inventory.includes(slot.dataset.weapon));
      }
    });
  }

  updateAliveCount(count) {
    this.aliveNumber.textContent = count;
  }

  addKillFeedEntry(killer, victim, weapon) {
    const weaponIcons = {
      ar: '🔫',
      sniper: '🎯',
      shotgun: '💥',
      grenade: '💣',
      zone: '🔵'
    };

    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.innerHTML = `<span class="killer">${this.escapeHtml(killer)}</span> <span class="weapon-icon">${weaponIcons[weapon] || '🔫'}</span> <span class="victim">${this.escapeHtml(victim)}</span>`;
    this.killFeed.prepend(entry);

    this.killFeedEntries.push(entry);
    if (this.killFeedEntries.length > 6) {
      const old = this.killFeedEntries.shift();
      old.remove();
    }

    // Auto-remove after 8 seconds
    setTimeout(() => {
      entry.style.opacity = '0';
      entry.style.transition = 'opacity 0.5s';
      setTimeout(() => {
        entry.remove();
        const idx = this.killFeedEntries.indexOf(entry);
        if (idx > -1) this.killFeedEntries.splice(idx, 1);
      }, 500);
    }, 8000);
  }

  showKillNotification(victimName) {
    this.killNotification.textContent = `☠ Eliminated ${victimName}`;
    this.killNotification.style.display = 'block';
    setTimeout(() => {
      this.killNotification.style.display = 'none';
    }, 2000);
  }

  showDamage() {
    this.damageOverlay.style.opacity = '0.6';
    setTimeout(() => {
      this.damageOverlay.style.opacity = '0';
    }, 200);
  }

  showZoneWarning(show) {
    this.zoneWarning.style.display = show ? 'block' : 'none';
  }

  updateMinimap(playerX, playerZ, playerRotY, entities, zone, buildings) {
    const ctx = this.minimapCtx;
    const w = this.minimap.width;
    const h = this.minimap.height;
    const scale = w / this.mapSize;

    // Clear
    ctx.fillStyle = 'rgba(10, 15, 20, 0.85)';
    ctx.fillRect(0, 0, w, h);

    // Map border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);

    // Buildings
    ctx.fillStyle = 'rgba(160, 140, 100, 0.5)';
    buildings.forEach(b => {
      ctx.fillRect(
        (b.x - b.w / 2 + this.mapSize / 2) * scale,
        (b.z - b.d / 2 + this.mapSize / 2) * scale,
        b.w * scale,
        b.d * scale
      );
    });

    // Zone circle (only draw if it fits within map area)
    if (zone.radius < this.mapSize) {
      // Fill outside zone with danger color
      ctx.save();
      ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
      ctx.fillRect(0, 0, w, h);

      // Clear inside zone (safe area)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(
        (zone.x + this.mapSize / 2) * scale,
        (zone.z + this.mapSize / 2) * scale,
        zone.radius * scale,
        0, Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      // Zone border ring
      ctx.beginPath();
      ctx.arc(
        (zone.x + this.mapSize / 2) * scale,
        (zone.z + this.mapSize / 2) * scale,
        zone.radius * scale,
        0, Math.PI * 2
      );
      ctx.strokeStyle = 'rgba(52, 152, 219, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Other entities
    entities.forEach(e => {
      if (!e.alive) return;
      const ex = (e.x + this.mapSize / 2) * scale;
      const ez = (e.z + this.mapSize / 2) * scale;
      // Clamp to minimap bounds
      if (ex < -5 || ex > w + 5 || ez < -5 || ez > h + 5) return;
      ctx.beginPath();
      ctx.arc(ex, ez, e.isBot ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = e.isBot ? '#e74c3c' : '#ff6600';
      ctx.fill();
    });

    // Local player (white triangle with direction)
    const px = Math.max(5, Math.min(w - 5, (playerX + this.mapSize / 2) * scale));
    const pz = Math.max(5, Math.min(h - 5, (playerZ + this.mapSize / 2) * scale));
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-playerRotY);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
