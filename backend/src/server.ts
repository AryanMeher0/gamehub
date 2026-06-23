import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import healthRouter from "./routes/health";
import {
  createRoom, joinRoom, leaveRoom, disconnectPlayer, reconnectPlayer, restoreRoom,
  setReady, selectGame, getRoomByPlayer, getRoomCodeByPlayer, getRoom,
} from "./rooms/roomManager";
import {
  createGame, processRoll, resolveCard, buyProperty, skipProperty,
  endTurn, buyBuilding, handlePlayerDisconnect,
  reassignPlayerId, loadSavedGame, persistGame, getGame,
} from "./games/monopoly/gameManager";
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

const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "http://localhost:3000" }));
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
    const state = reassignPlayerId(roomCode, oldSocketId, socket.id);
    if (state) {
      state.log.push(`${state.players[socket.id]?.name ?? "A player"} reconnected.`);
      persistGame(roomCode);
      io.to(roomCode).emit("game:stateUpdated", state);
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

  // ── CREATE ROOM ───────────────────────────────────────────────────────────
  socket.on("createRoom", () => {
    const room = createRoom(socket.id);
    socket.join(room.roomCode);
    console.log(`Room created: ${room.roomCode} by ${socket.id}`);
    socket.emit("roomUpdated", room);
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
  });

  // ── LEAVE ROOM ────────────────────────────────────────────────────────────
  socket.on("leaveRoom", ({ roomCode }: { roomCode: string }) => {
    const updatedRoom = leaveRoom(roomCode, socket.id);
    socket.leave(roomCode);
    console.log(`Player ${socket.id} left room: ${roomCode}`);
    if (updatedRoom) io.to(roomCode).emit("roomUpdated", updatedRoom);
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

    const playerIds = Object.keys(room.players);
    console.log(`Game started: ${room.selectedGameId} in room ${roomCode}`);

    if (room.selectedGameId === "monopoly") {
      const gameState = createGame(roomCode, playerIds);
      persistGame(roomCode);
      io.to(roomCode).emit("startGame", { roomCode, gameId: room.selectedGameId });
      io.to(roomCode).emit("game:stateUpdated", gameState);
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
  });

  // ── GAME: ROLL DICE ───────────────────────────────────────────────────────
  socket.on("game:roll", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = processRoll(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
  });

  // ── GAME: RESOLVE CARD ────────────────────────────────────────────────────
  socket.on("game:resolveCard", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = resolveCard(roomCode, socket.id);
    if (error) { socket.emit("game:error", { message: error }); return; }
    persistGame(roomCode);
    io.to(roomCode).emit("game:stateUpdated", state);
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
  });

  // ── GAME: SKIP PROPERTY ───────────────────────────────────────────────────
  socket.on("game:skipProperty", ({ roomCode }: { roomCode: string }) => {
    const { state, error } = skipProperty(roomCode, socket.id);
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
  });

  // ── GAME: CREATE TRADE ────────────────────────────────────────────────────
  socket.on("game:createTrade", (payload: {
    roomCode: string; toId: string; offeredCash: number; requestedCash: number;
    offeredPropertyIndices: number[]; requestedPropertyIndices: number[];
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
