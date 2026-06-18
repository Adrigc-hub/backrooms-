/**
 * Player Class
 * Manages individual player state, progress, and inventory
 */

class Player {
  constructor(id, username, platform = 'pc') {
    this.id = id;
    this.username = username;
    this.platform = platform; // 'vr' or 'pc'
    
    // Position & Movement
    this.position = { x: 0, y: 1.6, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    
    // Game State
    this.currentLevel = 0;
    this.health = 100;
    this.stamina = 100;
    this.maxHealth = 100;
    this.maxStamina = 100;
    
    // Currency & Progression
    this.currency = 0; // In-game money
    this.xp = 0;
    this.level = 1;
    
    // Inventory
    this.inventory = {
      items: [],
      abilities: ['basic_noclip', 'basic_escape'],
      emotes: ['wave', 'dance'],
      equipment: []
    };
    
    // Unlocked Content
    this.unlockedLevels = [0]; // Start at level 0
    this.unlockedNoClipTypes = ['wall_phasing'];
    this.unlockedEscapeTypes = ['level_completion'];
    this.discoveredPortals = new Map(); // portalId -> { stability, lastUsed }
    
    // Completed Quests
    this.completedQuests = new Set();
    this.activeQuests = new Set();
    
    // Statistics
    this.stats = {
      levelsExplored: 1,
      entitiesEncountered: 0,
      timePlayed: 0,
      noclipsPerformed: 0,
      escapesCompleted: 0,
      currencyEarned: 0,
      itemsCollected: 0,
      questsCompleted: 0
    };
    
    // Voice State
    this.voiceEnabled = false;
    this.micMuted = false;
    
    // Fear Level (increases when near entities)
    this.fearLevel = 0;
    this.maxFearLevel = 100;
    
    // Last Update Time
    this.lastUpdate = Date.now();
  }

  /**
   * Update player position
   */
  setPosition(position) {
    this.position = { ...position };
  }

  getPosition() {
    return this.position;
  }

  /**
   * Update player rotation
   */
  setRotation(rotation) {
    this.rotation = { ...rotation };
  }

  getRotation() {
    return this.rotation;
  }

  /**
   * Update player velocity
   */
  setVelocity(velocity) {
    this.velocity = { ...velocity };
  }

  /**
   * Set current level
   */
  setLevel(levelNumber) {
    this.currentLevel = levelNumber;
    if (!this.unlockedLevels.includes(levelNumber)) {
      this.unlockedLevels.push(levelNumber);
      this.stats.levelsExplored++;
    }
  }

  /**
   * Modify health
   */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      this.onDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Handle death - respawn at level start
   */
  onDeath() {
    this.health = this.maxHealth;
    this.position = { x: 0, y: 1.6, z: 0 };
    // Signal server to handle respawn
  }

  /**
   * Stamina management
   */
  useStamina(amount) {
    this.stamina = Math.max(0, this.stamina - amount);
  }

  regenerateStamina(amount = 1) {
    this.stamina = Math.min(this.maxStamina, this.stamina + amount);
  }

  /**
   * Currency management
   */
  addCurrency(amount) {
    this.currency += amount;
    this.stats.currencyEarned += amount;
  }

  removeCurrency(amount) {
    this.currency = Math.max(0, this.currency - amount);
  }

  getCurrency() {
    return this.currency;
  }

  /**
   * XP and leveling
   */
  addXP(amount) {
    this.xp += amount;
    this.checkLevelUp();
  }

  checkLevelUp() {
    const xpPerLevel = 1000;
    const newLevel = Math.floor(this.xp / xpPerLevel) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      this.maxHealth += 10;
      this.health = this.maxHealth;
      this.maxStamina += 5;
      this.stamina = this.maxStamina;
      // Unlock new content
      this.onLevelUp();
    }
  }

  onLevelUp() {
    // Unlock abilities, no-clip types, escape types based on level
    const levelMilestones = {
      2: ['ceiling_ascent'],
      4: ['dimensional_rift'],
      6: ['entity_portal'],
      8: ['quantum_tunneling'],
      3: ['entity_appeasement'],
      5: ['reality_anchor'],
      7: ['collective_escape'],
      9: ['paradox_resolution']
    };

    if (levelMilestones[this.level]) {
      levelMilestones[this.level].forEach(ability => {
        if (ability.includes('noclip') && !this.unlockedNoClipTypes.includes(ability)) {
          this.unlockedNoClipTypes.push(ability);
        } else if (!this.unlockedEscapeTypes.includes(ability)) {
          this.unlockedEscapeTypes.push(ability);
        }
      });
    }
  }

  /**
   * Inventory management
   */
  addItem(itemId, itemType = 'consumable') {
    const item = { id: itemId, type: itemType, timestamp: Date.now() };
    this.inventory.items.push(item);
    this.stats.itemsCollected++;
  }

  removeItem(itemId) {
    this.inventory.items = this.inventory.items.filter(i => i.id !== itemId);
  }

  hasItem(itemId) {
    return this.inventory.items.some(i => i.id === itemId);
  }

  /**
   * Quest management
   */
  addActiveQuest(questId) {
    this.activeQuests.add(questId);
  }

  completeQuest(questId) {
    this.activeQuests.delete(questId);
    this.completedQuests.add(questId);
    this.stats.questsCompleted++;
  }

  isQuestComplete(questId) {
    return this.completedQuests.has(questId);
  }

  /**
   * Ability tracking
   */
  unlockNoClipType(noclipType) {
    if (!this.unlockedNoClipTypes.includes(noclipType)) {
      this.unlockedNoClipTypes.push(noclipType);
    }
  }

  unlockEscapeType(escapeType) {
    if (!this.unlockedEscapeTypes.includes(escapeType)) {
      this.unlockedEscapeTypes.push(escapeType);
    }
  }

  /**
   * Fear management
   */
  increaseFear(amount) {
    this.fearLevel = Math.min(this.maxFearLevel, this.fearLevel + amount);
  }

  decreaseFear(amount) {
    this.fearLevel = Math.max(0, this.fearLevel - amount);
  }

  /**
   * Portal tracking
   */
  addPortal(portalId, stability = 100) {
    this.discoveredPortals.set(portalId, {
      stability,
      lastUsed: Date.now(),
      uses: 0
    });
  }

  getPortal(portalId) {
    return this.discoveredPortals.get(portalId);
  }

  updatePortalUsage(portalId) {
    const portal = this.discoveredPortals.get(portalId);
    if (portal) {
      portal.lastUsed = Date.now();
      portal.uses++;
      // Portals degrade with use
      portal.stability = Math.max(0, portal.stability - 5);
    }
  }

  /**
   * Get public player data (for sending to other players)
   */
  getPublicData() {
    return {
      id: this.id,
      username: this.username,
      platform: this.platform,
      position: this.position,
      rotation: this.rotation,
      currentLevel: this.currentLevel,
      health: this.health,
      fearLevel: this.fearLevel,
      activeEmote: null // Will be set when emoting
    };
  }

  /**
   * Get full player data (for client state)
   */
  getFullData() {
    return {
      ...this.getPublicData(),
      currency: this.currency,
      xp: this.xp,
      level: this.level,
      health: this.health,
      stamina: this.stamina,
      inventory: this.inventory,
      unlockedLevels: this.unlockedLevels,
      unlockedNoClipTypes: this.unlockedNoClipTypes,
      unlockedEscapeTypes: this.unlockedEscapeTypes,
      stats: this.stats
    };
  }

  /**
   * Increment stat
   */
  incrementStat(statName, amount = 1) {
    if (this.stats.hasOwnProperty(statName)) {
      this.stats[statName] += amount;
    }
  }

  /**
   * Reset player to respawn state (for death or leaving level)
   */
  reset() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.fearLevel = 0;
    this.position = { x: 0, y: 1.6, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
  }
}

module.exports = Player;
