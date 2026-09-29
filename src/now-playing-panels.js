const { randomBytes } = require('node:crypto');

class NowPlayingPanelStore {
  constructor({ maxEntries = 100, ttlMs = 6 * 60 * 60 * 1000, now = Date.now, createId } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.createId = createId || (() => randomBytes(12).toString('hex'));
    this.panels = new Map();
  }

  register(guildId, trackId) {
    this.pruneExpired();
    const panelId = this.createId();
    this.panels.set(panelId, {
      guildId,
      trackId,
      expiresAt: this.now() + this.ttlMs,
    });

    while (this.panels.size > this.maxEntries) {
      this.panels.delete(this.panels.keys().next().value);
    }

    return panelId;
  }

  get(panelId) {
    const panel = this.panels.get(panelId);
    if (!panel) return null;
    if (panel.expiresAt <= this.now()) {
      this.panels.delete(panelId);
      return null;
    }
    return panel;
  }

  delete(panelId) {
    return this.panels.delete(panelId);
  }

  deleteForGuild(guildId) {
    for (const [panelId, panel] of this.panels) {
      if (panel.guildId === guildId) this.panels.delete(panelId);
    }
  }

  deleteForTrack(guildId, trackId) {
    for (const [panelId, panel] of this.panels) {
      if (panel.guildId === guildId && panel.trackId === trackId) this.panels.delete(panelId);
    }
  }

  pruneExpired() {
    const now = this.now();
    for (const [panelId, panel] of this.panels) {
      if (panel.expiresAt <= now) this.panels.delete(panelId);
    }
  }

  get size() {
    this.pruneExpired();
    return this.panels.size;
  }
}

module.exports = { NowPlayingPanelStore };
