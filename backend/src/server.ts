import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import healthRouter from "./routes/health";
import {
  createRoom, joinRoom, leaveRoom, disconnectPlayer, reconnectPlayer, restoreRoom,
  setReady, selectGame, getRoomByPlayer, getRoomCodeByPlayer, getRoom,
  removeBot, setBotDifficulty, getAllRooms,
} from "./rooms/roomManager";
import { initBotScheduler, scheduleBotActions } from "./bots/botScheduler";
import {
  createGame, processRoll, resolveCard, buyProperty, skipProperty,
  auctionBid, auctionPass, endTurn, buyBuilding, sellBuilding,
  payJailFine, useGojf, mortgageProperty, unmortgageProperty,
  handlePlayerDisconnect, reassignPlayerId, loadSavedGame, persistGame, getGame,
} from "./games/monopoly/gameManager";
import {
  createGame as s5Create, drawCard as s5Draw, playCard as s5Play,
  tradeForMaster as s5Trade, secure as s5Secure, steal as s5Steal,
  endTurn as s5EndTurn, forceAdvanceTurn as s5ForceAdvance,
  reassignPlayerId as s5Reassign, getGame as s5Get,
  saveHistory as s5SaveHistory, undoAction as s5Undo,
  operatorForceNextTurn as s5OpForceNext, operatorGiveMC as s5OpGiveMC,
  operatorClearStack as s5OpClearStack, operatorEndGame as s5OpEndGame,
  operatorShuffleDeck as s5OpShuffleDeck, operatorTransferDiscard as s5OpTransferDiscard,
  PlayCardInput,
} from "./games/stack5/gameManager";
import { CardColor, CardShape } from "./games/stack5/types";

import { createTrade, acceptTrade, rejectTrade } from "./games/monopoly/tradeManager";
import {
  applyOperatorAction, OPERATOR_CARDS, OperatorAction,
} from "./games/monopoly/operatorManager";
import { BOARD } from "./games/monopoly/board";
import { GAME_REGISTRY, getGame as getGameDef } from "./games/registry";
import {
  registerDisconnect, claimReconnectById, clearSession,
} from "./reconnectManager";
import { listSaves, loadGame } from "./saveManager";
import { Room, BotType } from "./types";
import { BOT_NAME_POOL } from "./bots/botNames";


const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
  origin: "*"
}
});

initBotScheduler(io);

// ── Stack5 turn timers ────────────────────────────────────────────────────────
const s5Timers: Record<string, ReturnType<typeof setTimeout>> = {};

function s5ClearTimer(roomCode: string) {
  if (s5Timers[roomCode]) { clearTimeout(s5Timers[roomCode]); delete s5Timers[roomCode]; }
}

function s5StartTimer(roomCode: string) {
  const state = s5Get(roomCode);
  if (!state || state.gameOver || state.turnTimerSeconds <= 0) return;
  s5ClearTimer(roomCode);
  s5Timers[roomCode] = setTimeout(() => {
    const { state: next, error } = s5ForceAdvance(roomCode);
    if (error || !next) return;
    io.to(roomCode).emit("stack5:stateUpdated", next);
    s5StartTimer(roomCode);
  }, state.turnTimerSeconds * 1000);
}

const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "GameHub API", status: "running" });
});

app.get("/api/games", (_req, res) => {
  res.json(GAME_REGISTRY);
});

app.get("/api/saves", (_req, res) => {
  res.json(listSaves());
});

app.use("/api", healthRouter);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // ── RECONNECT ─────────────────────────────────────────────────────────────
  // Client sends stored oldSocketId immediately after connecting
  socket.on("game:reconnect", ({ roomCode, oldSocketId }: { roomCode: string; oldSocketId: string }) => {
    const session = claimReconnectById(socket.id, oldSocketId);
    if (!session) {
      socket.emit("game:reconnectFailed", { message: "Reconnect window expired or session not found" });
      return;
    }
    const roomResult = reconnectPlayer(roomCode, socket.id, oldSocketId);
    if (roomResult) {
      socket.join(roomCode);
      io.to(roomCode).emit("roomUpdated", roomResult.room);
    }
    const room = getRoom(roomCode);
    if (room?.selectedGameId === "stack5") {
      const s5state = s5Reassign(roomCode, oldSocketId, socket.id);
      if (s5state) io.to(roomCode).emit("stack5:stateUpdated", s5state);
    } else {
      const state = reassignPlayerId(roomCode, oldSocketId, socket.id);
      if (state) {
        state.log.push(`${state.players[socket.id]?.name ?? "A player"} reconnected.`);
        persistGame(roomCode);
        io.to(roomCode).emit("game:stateUpdated", state);
      }
    }
    socket.emit("game:reconnected", { roomCode });
    console.log(`[reconnect] ${oldSocketId} → ${socket.id} in room ${roomCode}`);
  });

  // ── RESUME SAVED GAME ─────────────────────────────────────────────────────
  // Host joins a room restored from disk; all players rejoin via joinRoom first
  socket.on("game:resume", ({ roomCode }: { roomCode: string }) => {
    const room = getRoom(roomCode);
    if (!room || room.host !== socket.id) {
      socket.emit("game:error", { message: "Only the host can resume a saved game" });
      return;
    }
    const state = loadSavedGame(roomCode);
    if (!state) {
      socket.emit("game:error", { message: "No save found for this room" });
      return;
    }
    state.log.push("♻️ Game resumed from save.");
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    console.log(`[resume] Room ${roomCode} resumed by ${socket.id}`);
  });

  // ── LIST SAVES ────────────────────────────────────────────────────────────
  socket.on("lobby:listSaves", () => {
    socket.emit("lobby:saves", listSaves());
  });

  // ── RESTORE ROOM FROM SAVE ────────────────────────────────────────────────
  // Host reconnects to a saved room after backend restart
  socket.on("lobby:restoreRoom", ({ roomCode }: { roomCode: string }) => {
    const existing = getRoom(roomCode);
    if (existing) {
      // Room already in memory — just join
      const result = joinRoom(roomCode, socket.id);
      if (result.room) {
        socket.join(roomCode);
        socket.emit("roomUpdated", result.room);
      }
      return;
    }
    // Reconstruct room from save metadata
    const save = loadGame<{ roomCode: string; players: Record<string, { id: string; name: string }> }>(roomCode);
    if (!save) {
      socket.emit("joinError", { message: "Save not found" });
      return;
    }
    const restoredRoom: Room = {
      roomCode,
      host: socket.id,
      players: { [socket.id]: { id: socket.id, ready: true } },
      createdAt: Date.now(),
      selectedGameId: "monopoly",
      disconnectedIds: [],
    };
    restoreRoom(restoredRoom);
    socket.join(roomCode);
    socket.emit("roomUpdated", restoredRoom);
    console.log(`[restore] Room ${roomCode} restored by ${socket.id}`);
  });

  // ── ROOM LIST ─────────────────────────────────────────────────────────────
  socket.on("rooms:getList", () => {
    socket.emit("rooms:list", getAllRooms());
  });

  // ── CREATE ROOM ───────────────────────────────────────────────────────────
  socket.on("createRoom", () => {
    const room = createRoom(socket.id);
    const rc = room.roomCode.toUpperCase();
    socket.join(rc);
    console.log(`Room created: ${rc} by ${socket.id}`);
    socket.emit("roomUpdated", { ...room, roomCode: rc });
    io.emit("rooms:list", getAllRooms());
  });

  // ── JOIN ROOM ─────────────────────────────────────────────────────────────
  socket.on("joinRoom", ({ roomCode }: { roomCode: string }) => {
    const result = joinRoom(roomCode.toUpperCase(), socket.id);
    if (!result.success || !result.room) {
      socket.emit("joinError", { message: result.message ?? "Failed to join room" });
      return;
    }
    socket.join(roomCode.toUpperCase());
    console.log(`Player ${socket.id} joined room: ${roomCode}`);
    io.to(roomCode.toUpperCase()).emit("roomUpdated", result.room);
    io.emit("rooms:list", getAllRooms());
  });

  // ── LEAVE ROOM ────────────────────────────────────────────────────────────
  socket.on("leaveRoom", ({ roomCode }: { roomCode: string }) => {
    const updatedRoom = leaveRoom(roomCode, socket.id);
    socket.leave(roomCode);
    console.log(`Player ${socket.id} left room: ${roomCode}`);
    if (updatedRoom) io.to(roomCode).emit("roomUpdated", updatedRoom);
    io.emit("rooms:list", getAllRooms());
  });

  // ── PLAYER READY ──────────────────────────────────────────────────────────
  socket.on("playerReady", ({ roomCode, ready }: { roomCode: string; ready: boolean }) => {
    const updatedRoom = setReady(roomCode, socket.id, ready);
    if (!updatedRoom) return;
    io.to(roomCode).emit("roomUpdated", updatedRoom);
  });

  // ── SELECT GAME ───────────────────────────────────────────────────────────
  socket.on("lobby:selectGame", ({ roomCode, gameId }: { roomCode: string; gameId: string }) => {
    const gameDef = getGameDef(gameId);
    if (!gameDef) { socket.emit("lobbyError", { message: "Unknown game" }); return; }
    const updatedRoom = selectGame(roomCode, socket.id, gameId);
    if (!updatedRoom) { socket.emit("lobbyError", { message: "Only the host can select a game" }); return; }
    console.log(`Game selected: ${gameId} in room ${roomCode}`);
    io.to(roomCode).emit("roomUpdated", updatedRoom);
  });

  // ── START GAME ────────────────────────────────────────────────────────────
  socket.on("lobby:addBot", ({ roomCode }: { roomCode: string }) => {
    const normalizedRoomCode = roomCode.toUpperCase();
    const room = getRoom(normalizedRoomCode);
    if (!room) return;
    if (room.host !== socket.id) {
      socket.emit("lobbyError", { message: "Only the host can add bots" });
      return;
    }

    // Determine bot id and name
    const existingBotCount = Object.values(room.players).filter((p) => p.isBot).length;
    const botIndex = existingBotCount % BOT_NAME_POOL.length;
    const nextBotName = BOT_NAME_POOL[botIndex];

    // Use normalizedRoomCode for bot id consistency
    const botId = `bot_${normalizedRoomCode}_${existingBotCount + 1}`;

    // Prevent duplicate bots in case of rapid clicks
    if (room.players[botId]) return;

    const botPlayer: import("./types").Player = {
      id: botId,
      ready: true,
      isBot: true,
      botType: "easy" as BotType,
      displayName: nextBotName,
    };

    room.players[botId] = botPlayer;
    io.to(normalizedRoomCode).emit("roomUpdated", room);
  });

  socket.on("lobby:removeBot", ({ roomCode, botId }: { roomCode: string; botId: string }) => {
    const normalizedRoomCode = roomCode.toUpperCase();
    const updatedRoom = removeBot(normalizedRoomCode, socket.id, botId);
    if (!updatedRoom) {
      socket.emit("lobbyError", { message: "Cannot remove bot" });
      return;
    }
    io.to(normalizedRoomCode).emit("roomUpdated", updatedRoom);
  });

  socket.on("lobby:setBotDifficulty", ({ roomCode, botId, difficulty }: { roomCode: string; botId: string; difficulty: BotType }) => {
    const normalizedRoomCode = roomCode.toUpperCase();
    const updatedRoom = setBotDifficulty(normalizedRoomCode, socket.id, botId, difficulty);
    if (!updatedRoom) {
      socket.emit("lobbyError", { message: "Cannot change bot difficulty" });
      return;
    }
    io.to(normalizedRoomCode).emit("roomUpdated", updatedRoom);
  });

  socket.on("startGame", ({ roomCode }: { roomCode: string }) => {

    const room = getRoomByPlayer(socket.id);
    if (!room || room.host !== socket.id) return;

    const allReady = Object.values(room.players).every((p) => p.ready);
    if (!allReady) return;

    if (!room.selectedGameId) {
      socket.emit("lobbyError", { message: "Please select a game first" });
      return;
    }
    const gameDef = getGameDef(room.selectedGameId);
    if (!gameDef) return;

    const playerCount = Object.keys(room.players).length;
    if (playerCount < gameDef.minPlayers) {
      socket.emit("lobbyError", { message: `${gameDef.name} requires at least ${gameDef.minPlayers} players` });
      return;
    }

    console.log(`Game started: ${room.selectedGameId} in room ${roomCode}`);

    if (room.selectedGameId === "monopoly") {
      const gameState = createGame(roomCode, room.players);
      persistGame(roomCode);
      io.to(roomCode).emit("startGame", { roomCode, gameId: room.selectedGameId });
      io.to(roomCode).emit("game:stateUpdated", gameState);
      scheduleBotActions(roomCode, gameState);
    } else {
      io.to(roomCode).emit("startGame", { roomCode, gameId: room.selectedGameId });
    }
  });

  // ── GAME: GET STATE ───────────────────────────────────────────────────────
  socket.on("game:getState", ({ roomCode }: { roomCode: string }) => {
    const state = getGame(roomCode);
    if (state) socket.emit("game:stateUpdated", state);
  });

  socket.on("operator:getAccess", ({ roomCode }: { roomCode: string }) => {
    const normalizedRoomCode = roomCode.toUpperCase();
    const room = getRoom(normalizedRoomCode);
    const state = getGame(normalizedRoomCode);

    if (!room || room.host !== socket.id) {
      socket.emit("operator:access", { authorized: false, message: "Access Denied" });
      return;
    }
    if (!state || room.selectedGameId !== "monopoly") {
      socket.emit("operator:access", {
        authorized: false,
        message: "Monopoly game not found",
      });
      return;
    }

    socket.emit("operator:access", {
      authorized: true,
      state,
      board: BOARD,
      cards: OPERATOR_CARDS,
    });
  });

  socket.on("operator:action", (payload: { roomCode: string; action: OperatorAction }) => {
    const normalizedRoomCode = payload.roomCode.toUpperCase();
    const room = getRoom(normalizedRoomCode);
    const state = getGame(normalizedRoomCode);

    if (!room || room.host !== socket.id) {
      socket.emit("operator:error", { message: "Access Denied" });
      return;
    }
    if (!state || room.selectedGameId !== "monopoly") {
      socket.emit("operator:error", { message: "Monopoly game not found" });
      return;
    }

    const result = applyOperatorAction(normalizedRoomCode, state, payload.action);
    if (result.error) {
      socket.emit("operator:error", { message: result.error });
      return;
    }

    persistGame(normalizedRoomCode);
    io.to(normalizedRoomCode).emit("game:stateUpdated", result.state);
    socket.emit("operator:result", { message: result.message });
    if (result.triggerBotScheduler) {
      scheduleBotActions(normalizedRoomCode, result.state);
    }
  });

  // ── GAME: ROLL DICE ───────────────────────────────────────────────────────
  socket.on("game:roll", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = processRoll(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: RESOLVE CARD ────────────────────────────────────────────────────
  socket.on("game:resolveCard", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = resolveCard(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: BUY BUILDING ────────────────────────────────────────────────────
  socket.on("game:buyBuilding", ({ roomCode, spaceIndex }: { roomCode: string; spaceIndex: number }) => {
    const { state, error } = buyBuilding(roomCode, socket.id, spaceIndex);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
  });

  // ── GAME: BUY PROPERTY ────────────────────────────────────────────────────
  socket.on("game:buyProperty", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = buyProperty(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: SKIP PROPERTY ───────────────────────────────────────────────────
  socket.on("game:skipProperty", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = skipProperty(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: AUCTION BID ─────────────────────────────────────────────────────
  socket.on("game:auctionBid", ({ roomCode, amount }: { roomCode: string; amount: number }) => {
    const { state, error } = auctionBid(roomCode, socket.id, amount);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: AUCTION PASS ────────────────────────────────────────────────────
  socket.on("game:auctionPass", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = auctionPass(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: PAY JAIL FINE ───────────────────────────────────────────────────
  socket.on("game:payJailFine", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = payJailFine(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: USE GOJF CARD ───────────────────────────────────────────────────
  socket.on("game:useGojf", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = useGojf(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: SELL BUILDING ───────────────────────────────────────────────────
  socket.on("game:sellBuilding", ({ roomCode, spaceIndex }: { roomCode: string; spaceIndex: number }) => {
    const { state, error } = sellBuilding(roomCode, socket.id, spaceIndex);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
  });

  // ── GAME: MORTGAGE PROPERTY ───────────────────────────────────────────────
  socket.on("game:mortgage", ({ roomCode, spaceIndex }: { roomCode: string; spaceIndex: number }) => {
    const { state, error } = mortgageProperty(roomCode, socket.id, spaceIndex);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
  });

  // ── GAME: UNMORTGAGE PROPERTY ─────────────────────────────────────────────
  socket.on("game:unmortgage", ({ roomCode, spaceIndex }: { roomCode: string; spaceIndex: number }) => {
    const { state, error } = unmortgageProperty(roomCode, socket.id, spaceIndex);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
  });

  // ── GAME: END TURN ────────────────────────────────────────────────────────
  socket.on("game:endTurn", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = endTurn(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    scheduleBotActions(roomCode, state);
  });

  // ── GAME: CREATE TRADE ────────────────────────────────────────────────────
  socket.on("game:createTrade", (payload: {
    roomCode: string; toId: string; offeredCash: number; requestedCash: number;
    offeredPropertyIndices: number[]; requestedPropertyIndices: number[];
    offeredGojfCount?: number; requestedGojfCount?: number;
  }) => {
    const state = getGame(payload.roomCode);
    if (!state) { socket.emit("game:error", { message: "Game not found" }); return; }
    const { trade, error } = createTrade(state, { ...payload, fromId: socket.id });
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(payload.roomCode);
    io.to(payload.roomCode).emit("game:stateUpdated", state);
    io.to(payload.roomCode).emit("game:tradeUpdated", trade);
  });

  // ── GAME: ACCEPT TRADE ────────────────────────────────────────────────────
  socket.on("game:acceptTrade", ({ roomCode, tradeId }: { roomCode: string; tradeId: string }) => {
    const state = getGame(roomCode);
    if (!state) { socket.emit("game:error", { message: "Game not found" }); return; }
    const { error } = acceptTrade(state, tradeId, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    io.to(roomCode).emit("game:tradeUpdated", state.trades[tradeId]);
  });

  // ── GAME: REJECT TRADE ────────────────────────────────────────────────────
  socket.on("game:rejectTrade", ({ roomCode, tradeId }: { roomCode: string; tradeId: string }) => {
    const state = getGame(roomCode);
    if (!state) { socket.emit("game:error", { message: "Game not found" }); return; }
    const { error } = rejectTrade(state, tradeId, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
    io.to(roomCode).emit("game:tradeUpdated", state.trades[tradeId]);
  });

  // ── STACK5: CONFIGURE ────────────────────────────────────────────────────
  socket.on("stack5:configure", ({
    roomCode, targetScore, startingMasterCards, turnTimerSeconds, numDecks,
  }: { roomCode: string; targetScore: number; startingMasterCards: number; turnTimerSeconds?: number; numDecks?: number }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) {
      socket.emit("stack5:error", { message: "Only the host can start the game" });
      return;
    }
    if (![2, 3, 4].includes(targetScore) || ![1, 2, 3, 4].includes(startingMasterCards)) {
      socket.emit("stack5:error", { message: "Invalid configuration" });
      return;
    }
    const timer = [0, 15, 30, 60].includes(turnTimerSeconds ?? 0) ? (turnTimerSeconds ?? 0) : 0;
    const decks = [1, 2].includes(numDecks ?? 1) ? (numDecks ?? 1) : 1;
    const state = s5Create(rc, room.players, targetScore, startingMasterCards, timer, socket.id, decks);
    io.to(rc).emit("stack5:stateUpdated", state);
    s5StartTimer(rc);
  });

  socket.on("room:setDisplayName", ({ roomCode, name }: { roomCode: string; name: string }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || !room.players[socket.id]) return;
    const trimmed = String(name).trim().slice(0, 20);
    if (!trimmed) return;
    room.players[socket.id].displayName = trimmed;
    io.to(rc).emit("roomUpdated", room);
    io.emit("rooms:list", getAllRooms());
  });

  // ── STACK5: GET STATE ─────────────────────────────────────────────────────
  socket.on("stack5:getState", ({ roomCode }: { roomCode: string }) => {
    const state = s5Get(roomCode.toUpperCase());
    if (state) socket.emit("stack5:stateUpdated", state);
  });

  // ── STACK5: DRAW CARD ─────────────────────────────────────────────────────
  socket.on("stack5:drawCard", ({ roomCode }: { roomCode: string }) => {
    const rc = roomCode.toUpperCase();
    s5SaveHistory(rc);
    const { state, error } = s5Draw(rc, socket.id);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  // ── STACK5: PLAY CARD ─────────────────────────────────────────────────────
  socket.on("stack5:playCard", (payload: {
    roomCode: string;
    cardId: string;
    slotIndex?: number;
    chosenColor?: CardColor;
    chosenShape?: CardShape;
    targetPlayerId?: string;
  }) => {
    const rc = payload.roomCode.toUpperCase();
    s5SaveHistory(rc);
    const input: PlayCardInput = {
      cardId: payload.cardId,
      slotIndex: payload.slotIndex,
      chosenColor: payload.chosenColor,
      chosenShape: payload.chosenShape,
      targetPlayerId: payload.targetPlayerId,
    };
    const { state, error } = s5Play(rc, socket.id, input);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  // ── STACK5: TRADE FOR MASTER ──────────────────────────────────────────────
  socket.on("stack5:tradeForMaster", ({ roomCode, cardIds }: { roomCode: string; cardIds: string[] }) => {
    const rc = roomCode.toUpperCase();
    s5SaveHistory(rc);
    const { state, error } = s5Trade(rc, socket.id, cardIds);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  // ── STACK5: SECURE ────────────────────────────────────────────────────────
  socket.on("stack5:secure", ({ roomCode, slotIndex }: { roomCode: string; slotIndex: number }) => {
    const rc = roomCode.toUpperCase();
    s5SaveHistory(rc);
    const { state, error } = s5Secure(rc, socket.id, slotIndex);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  // ── STACK5: STEAL ─────────────────────────────────────────────────────────
  socket.on("stack5:steal", ({
    roomCode, targetPlayerId, targetSlotIndex,
  }: { roomCode: string; targetPlayerId: string; targetSlotIndex: number }) => {
    const rc = roomCode.toUpperCase();
    s5SaveHistory(rc);
    const { state, error } = s5Steal(rc, socket.id, targetPlayerId, targetSlotIndex);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  // ── STACK5: END TURN ──────────────────────────────────────────────────────
  socket.on("stack5:endTurn", ({ roomCode }: { roomCode: string }) => {
    const rc = roomCode.toUpperCase();
    s5SaveHistory(rc);
    const { state, error } = s5EndTurn(rc, socket.id);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  // ── STACK5: OPERATOR ─────────────────────────────────────────────────────
  socket.on("stack5:operator:undo", ({ roomCode }: { roomCode: string }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5Undo(rc);
    if (error && !state) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    if (error) socket.emit("stack5:error", { message: error });
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  socket.on("stack5:operator:forceNextTurn", ({ roomCode }: { roomCode: string }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5OpForceNext(rc);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc); s5StartTimer(rc);
  });

  socket.on("stack5:operator:giveMC", ({
    roomCode, targetPlayerId, amount,
  }: { roomCode: string; targetPlayerId: string; amount: number }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5OpGiveMC(rc, targetPlayerId, amount);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
  });

  socket.on("stack5:operator:clearStack", ({
    roomCode, targetPlayerId, slotIndex,
  }: { roomCode: string; targetPlayerId: string; slotIndex: number }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5OpClearStack(rc, targetPlayerId, slotIndex);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
  });

  socket.on("stack5:operator:endGame", ({
    roomCode, winnerId,
  }: { roomCode: string; winnerId: string }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5OpEndGame(rc, winnerId);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
    s5ClearTimer(rc);
  });

  socket.on("stack5:operator:shuffleDeck", ({ roomCode }: { roomCode: string }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5OpShuffleDeck(rc);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
  });

  socket.on("stack5:operator:transferDiscard", ({ roomCode }: { roomCode: string }) => {
    const rc = roomCode.toUpperCase();
    const room = getRoom(rc);
    if (!room || room.host !== socket.id) { socket.emit("stack5:error", { message: "Host only" }); return; }
    const { state, error } = s5OpTransferDiscard(rc);
    if (error) { socket.emit("stack5:error", { message: error }); return; }
    io.to(rc).emit("stack5:stateUpdated", state);
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const roomCode = getRoomCodeByPlayer(socket.id);

    if (roomCode) {
      const room = getRoom(roomCode);
      const gameId = room?.selectedGameId ?? "monopoly";

      // Mark disconnected in room (do NOT remove yet)
      disconnectPlayer(roomCode, socket.id);
      const updatedRoom = getRoom(roomCode);
      if (updatedRoom) io.to(roomCode).emit("roomUpdated", updatedRoom);

      // Register 5-min reconnect window; on expiry apply real removal
      registerDisconnect(socket.id, roomCode, gameId, (oldId, rc) => {
        console.log(`[reconnect] Window expired for ${oldId} in room ${rc}`);
        // Permanent removal
        const state = handlePlayerDisconnect(rc, oldId);
        if (state) {
          persistGame(rc);
          io.to(rc).emit("game:stateUpdated", state);
        }
        const r = getRoom(rc);
        if (r) {
          leaveRoom(rc, oldId);
          const updated = getRoom(rc);
          if (updated) io.to(rc).emit("roomUpdated", updated);
        }
      });
    } else {
      // Not in a game room — just clean up lobby
      const lobbyRoom = getRoomByPlayer(socket.id);
      if (lobbyRoom) {
        const updatedRoom = leaveRoom(lobbyRoom.roomCode, socket.id);
        if (updatedRoom) io.to(lobbyRoom.roomCode).emit("roomUpdated", updatedRoom);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
