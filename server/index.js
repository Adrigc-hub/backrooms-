/**
 * Backrooms VR Game - Main Server
 * WebSocket-based multiplayer game server
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import game systems
const GameServer = require('./game/GameServer');
const Player = require('./game/Player');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// Game instance
const gameServer = new GameServer();

// Connection tracking
const players = new Map();
const servers = new Map();

// WebSocket connection handler
wss.on('connection', (ws) => {
  const playerId = uuidv4();
  let player = null;
  let currentServerId = null;

  console.log(`[SERVER] New connection: ${playerId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, playerId, data);
    } catch (error) {
      console.error(`[ERROR] Failed to parse message: ${error.message}`);
    }
  });

  ws.on('close', () => {
    if (player) {
      gameServer.removePlayer(playerId);
      console.log(`[SERVER] Player disconnected: ${playerId}`);
    }
  });

  ws.on('error', (error) => {
    console.error(`[ERROR] WebSocket error: ${error.message}`);
  });

  /**
   * Handle incoming messages from client
   */
  function handleMessage(ws, playerId, data) {
    const { type, payload } = data;

    switch (type) {
      case 'JOIN_GAME':
        handleJoinGame(ws, playerId, payload);
        break;

      case 'PLAYER_MOVE':
        handlePlayerMove(playerId, payload);
        break;

      case 'PLAYER_NOCLIP':
        handleNoClip(playerId, payload);
        break;

      case 'PLAYER_ESCAPE':
        handleEscape(playerId, payload);
        break;

      case 'QUEST_COMPLETE':
        handleQuestComplete(playerId, payload);
        break;

      case 'SHOP_PURCHASE':
        handleShopPurchase(playerId, payload);
        break;

      case 'EMOTE_TRIGGER':
        handleEmote(playerId, payload);
        break;

      case 'INTERACT':
        handleInteract(playerId, payload);
        break;

      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        break;

      default:
        console.warn(`[WARN] Unknown message type: ${type}`);
    }
  }

  /**
   * Player joins game
   */
  function handleJoinGame(ws, playerId, payload) {
    const { username, platform } = payload;

    player = new Player(playerId, username, platform);
    players.set(playerId, { ws, player });

    // Find or create game server
    let gameInstance = Array.from(servers.values()).find(s => s.getPlayerCount() < 5);
    if (!gameInstance) {
      gameInstance = gameServer.createGameInstance(uuidv4());
      servers.set(gameInstance.id, gameInstance);
    }

    currentServerId = gameInstance.id;
    gameInstance.addPlayer(player);

    // Send confirmation and initial state
    ws.send(JSON.stringify({
      type: 'JOIN_SUCCESS',
      playerId,
      serverId: currentServerId,
      gameState: gameInstance.getGameState()
    }));

    // Broadcast player joined to all in server
    broadcastToServer(currentServerId, {
      type: 'PLAYER_JOINED',
      player: player.getPublicData()
    }, playerId);

    console.log(`[SERVER] ${username} joined server ${currentServerId}`);
  }

  /**
   * Handle player movement
   */
  function handlePlayerMove(playerId, payload) {
    if (!player) return;
    const { position, rotation, velocity } = payload;
    
    player.setPosition(position);
    player.setRotation(rotation);
    player.setVelocity(velocity);

    broadcastToServer(currentServerId, {
      type: 'PLAYER_MOVED',
      playerId,
      position,
      rotation,
      velocity
    }, playerId);
  }

  /**
   * Handle no-clip attempt
   */
  function handleNoClip(playerId, payload) {
    if (!player) return;
    const { noclipType, targetLevel, direction } = payload;

    const gameInstance = servers.get(currentServerId);
    if (!gameInstance) return;

    const result = gameInstance.attemptNoClip(playerId, noclipType, targetLevel, direction);

    ws.send(JSON.stringify({
      type: 'NOCLIP_RESULT',
      success: result.success,
      message: result.message,
      newLevel: result.newLevel,
      portalId: result.portalId,
      portalStability: result.portalStability
    }));

    if (result.success) {
      broadcastToServer(currentServerId, {
        type: 'PLAYER_NOCLIPPED',
        playerId,
        fromLevel: player.currentLevel,
        toLevel: result.newLevel,
        noclipType
      });

      player.setLevel(result.newLevel);
    }
  }

  /**
   * Handle escape attempt
   */
  function handleEscape(playerId, payload) {
    if (!player) return;
    const { escapeType, itemsUsed } = payload;

    const gameInstance = servers.get(currentServerId);
    if (!gameInstance) return;

    const result = gameInstance.attemptEscape(playerId, escapeType, itemsUsed);

    ws.send(JSON.stringify({
      type: 'ESCAPE_RESULT',
      success: result.success,
      message: result.message,
      progressPercent: result.progressPercent,
      requiredPlayers: result.requiredPlayers
    }));

    if (result.success) {
      broadcastToServer(currentServerId, {
        type: 'PLAYER_ESCAPED',
        playerId,
        escapeType,
        reward: result.reward
      });

      player.addCurrency(result.reward);
      player.incrementStat('escapesCompleted');
    }
  }

  /**
   * Handle quest completion
   */
  function handleQuestComplete(playerId, payload) {
    if (!player) return;
    const { questId } = payload;

    const reward = gameServer.completeQuest(playerId, questId);

    ws.send(JSON.stringify({
      type: 'QUEST_COMPLETED',
      questId,
      reward: reward.currency,
      items: reward.items,
      xp: reward.xp
    }));

    player.addCurrency(reward.currency);
    player.addXP(reward.xp);

    broadcastToServer(currentServerId, {
      type: 'QUEST_COMPLETED_BROADCAST',
      playerId,
      questId,
      reward: reward.currency
    });
  }

  /**
   * Handle shop purchase
   */
  function handleShopPurchase(playerId, payload) {
    if (!player) return;
    const { itemId, itemType } = payload; // emote, skin, ability, equipment

    const result = gameServer.purchaseItem(playerId, itemId, itemType);

    ws.send(JSON.stringify({
      type: 'PURCHASE_RESULT',
      success: result.success,
      message: result.message,
      newBalance: player.getCurrency()
    }));

    if (result.success) {
      player.addItem(itemId, itemType);
      broadcastToServer(currentServerId, {
        type: 'PLAYER_PURCHASED',
        playerId,
        itemId,
        itemType
      });
    }
  }

  /**
   * Handle emote trigger
   */
  function handleEmote(playerId, payload) {
    if (!player) return;
    const { emoteId } = payload;

    broadcastToServer(currentServerId, {
      type: 'PLAYER_EMOTE',
      playerId,
      emoteId,
      position: player.getPosition()
    });
  }

  /**
   * Handle interaction with objects
   */
  function handleInteract(playerId, payload) {
    if (!player) return;
    const { objectId, interactionType } = payload;

    const gameInstance = servers.get(currentServerId);
    if (!gameInstance) return;

    const result = gameInstance.interact(playerId, objectId, interactionType);

    if (result.success) {
      if (result.itemGranted) {
        player.addItem(result.itemGranted.id, result.itemGranted.type);
      }
      if (result.currencyGranted) {
        player.addCurrency(result.currencyGranted);
      }

      ws.send(JSON.stringify({
        type: 'INTERACTION_SUCCESS',
        objectId,
        result
      }));

      broadcastToServer(currentServerId, {
        type: 'OBJECT_INTERACTED',
        playerId,
        objectId,
        interactionType
      });
    }
  }

  /**
   * Broadcast message to all players in a game server
   */
  function broadcastToServer(serverId, message, excludePlayerId = null) {
    const gameInstance = servers.get(serverId);
    if (!gameInstance) return;

    const playersInServer = gameInstance.getPlayers();
    playersInServer.forEach(p => {
      if (excludePlayerId && p.id === excludePlayerId) return;
      const playerData = players.get(p.id);
      if (playerData && playerData.ws.readyState === WebSocket.OPEN) {
        playerData.ws.send(JSON.stringify(message));
      }
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] Backrooms VR Game Server running on port ${PORT}`);
  console.log(`[SERVER] Visit http://localhost:8080 to play`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  wss.clients.forEach(client => client.close());
  server.close();
  process.exit(0);
});

module.exports = { app, wss };
