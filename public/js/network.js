// Network Manager - Socket.IO connection
class NetworkManager {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.weapons = null;
    this.mapSize = 500;
    this.connected = false;

    // Callbacks
    this.onJoined = null;
    this.onGameStart = null;
    this.onGameState = null;
    this.onBullet = null;
    this.onExplosion = null;
    this.onGrenadeThrown = null;
    this.onKill = null;
    this.onHitMarker = null;
    this.onZoneShrink = null;
    this.onGameEnd = null;
    this.onPickedUp = null;
  }

  connect() {
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
    });

    this.socket.on('joined', (data) => {
      this.playerId = data.playerId;
      this.weapons = data.weapons;
      this.mapSize = data.mapSize;
      if (this.onJoined) this.onJoined(data);
    });

    this.socket.on('gameStart', (data) => {
      if (this.onGameStart) this.onGameStart(data);
    });

    this.socket.on('gameState', (data) => {
      if (this.onGameState) this.onGameState(data);
    });

    this.socket.on('bullet', (data) => {
      if (this.onBullet) this.onBullet(data);
    });

    this.socket.on('explosion', (data) => {
      if (this.onExplosion) this.onExplosion(data);
    });

    this.socket.on('grenadeThrown', (data) => {
      if (this.onGrenadeThrown) this.onGrenadeThrown(data);
    });

    this.socket.on('kill', (data) => {
      if (this.onKill) this.onKill(data);
    });

    this.socket.on('hitMarker', () => {
      if (this.onHitMarker) this.onHitMarker();
    });

    this.socket.on('zoneShrink', (data) => {
      if (this.onZoneShrink) this.onZoneShrink(data);
    });

    this.socket.on('gameEnd', (data) => {
      if (this.onGameEnd) this.onGameEnd(data);
    });

    this.socket.on('pickedUp', (data) => {
      if (this.onPickedUp) this.onPickedUp(data);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Disconnected from server');
    });
  }

  joinGame(name) {
    if (this.socket) {
      this.socket.emit('joinGame', { name });
    }
  }

  sendMove(position) {
    if (this.socket && this.connected) {
      this.socket.emit('move', position);
    }
  }

  sendShoot(rotY, pitch, dir) {
    if (this.socket && this.connected) {
      this.socket.emit('shoot', { rotY, pitch: pitch || 0, dir });
    }
  }

  sendReload() {
    if (this.socket && this.connected) {
      this.socket.emit('reload');
    }
  }

  sendSwitchWeapon(weapon) {
    if (this.socket && this.connected) {
      this.socket.emit('switchWeapon', { weapon });
    }
  }

  sendThrowGrenade(rotY) {
    if (this.socket && this.connected) {
      this.socket.emit('throwGrenade', { rotY });
    }
  }
}
