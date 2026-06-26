import { Room, Player, BotType } from "../types";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

const rooms: Record<string, Room> = {};

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: CODE_LENGTH }, () =>
      CHARS.charAt(Math.floor(Math.random() * CHARS.length))
    ).join("");
  } while (rooms[code]);
  return code;
}

function createRoom(socketId: string): Room {
  const roomCode = generateRoomCode().toUpperCase();

  const player: Player = { id: socketId, ready: false };
  rooms[roomCode] = {
    roomCode,
    host: socketId,
    players: { [socketId]: player },
    createdAt: Date.now(),
    selectedGameId: null,
    disconnectedIds: [],
  };
  return rooms[roomCode];
}

function joinRoom(roomCode: string, socketId: string): { success: boolean; room?: Room; message?: string } {
  const normalized = roomCode.toUpperCase();
  const room = rooms[normalized];

  if (!room) return { success: false, message: "Room not found" };
  if (room.players[socketId]) return { success: true, room };

  room.players[socketId] = { id: socketId, ready: false };
  // Ensure returned roomCode matches the canonical key we used.
  room.roomCode = normalized;

  return { success: true, room };
}

function leaveRoom(roomCode: string, socketId: string): Room | null {
  const room = rooms[roomCode];
  if (!room) return null;
  delete room.players[socketId];
  if (Object.keys(room.players).length === 0) {
    delete rooms[roomCode];
    return null;
  }
  if (room.host === socketId) {
    room.host = Object.keys(room.players)[0];
  }
  return room;
}

/** Mark a player as disconnected without removing them from the room. */
function disconnectPlayer(roomCode: string, socketId: string): Room | null {
  const room = rooms[roomCode];
  if (!room) return null;
  const player = room.players[socketId];
  if (!player) return room;
  player.disconnected = true;
  room.disconnectedIds = room.disconnectedIds ?? [];
  if (!room.disconnectedIds.includes(socketId)) room.disconnectedIds.push(socketId);
  // Promote a new host if needed (pick first non-disconnected player)
  if (room.host === socketId) {
    const next = Object.values(room.players).find((p) => !p.disconnected);
    if (next) room.host = next.id;
  }
  return room;
}

/**
 * Reconnect: remap oldSocketId → newSocketId inside the room.
 * Returns the old socket ID that was reclaimed, or null.
 */
function reconnectPlayer(
  roomCode: string,
  newSocketId: string,
  oldSocketId: string
): { room: Room; oldId: string } | null {
  const room = rooms[roomCode];
  if (!room) return null;
  const player = room.players[oldSocketId];
  if (!player) return null;

  // Remap player entry
  delete room.players[oldSocketId];
  player.id = newSocketId;
  player.disconnected = false;
  room.players[newSocketId] = player;

  // Fix host reference
  if (room.host === oldSocketId) room.host = newSocketId;

  // Remove from disconnected list
  room.disconnectedIds = (room.disconnectedIds ?? []).filter((id) => id !== oldSocketId);

  return { room, oldId: oldSocketId };
}

/** Restore a room from a saved snapshot (for backend-restart resume). */
function restoreRoom(room: Room): void {
  rooms[room.roomCode] = room;
}

function setReady(roomCode: string, socketId: string, ready: boolean): Room | null {
  const room = rooms[roomCode];
  if (!room || !room.players[socketId]) return null;
  room.players[socketId].ready = ready;
  return room;
}

function selectGame(roomCode: string, socketId: string, gameId: string): Room | null {
  const room = rooms[roomCode];
  if (!room || room.host !== socketId) return null;
  room.selectedGameId = gameId;
  return room;
}

function removeBot(roomCode: string, hostId: string, botId: string): Room | null {
  const room = rooms[roomCode];
  if (!room || room.host !== hostId) return null;
  const player = room.players[botId];
  if (!player?.isBot) return null;
  delete room.players[botId];
  return room;
}

function setBotDifficulty(roomCode: string, hostId: string, botId: string, difficulty: BotType): Room | null {
  const room = rooms[roomCode];
  if (!room || room.host !== hostId) return null;
  const player = room.players[botId];
  if (!player?.isBot) return null;
  player.botType = difficulty;
  return room;
}

function getRoom(roomCode: string): Room | null {
  return rooms[roomCode] ?? null;
}

function getRoomByPlayer(socketId: string): Room | null {
  return Object.values(rooms).find((r) => r.players[socketId]) ?? null;
}

function getRoomCodeByPlayer(socketId: string): string | null {
  return Object.values(rooms).find((r) => r.players[socketId])?.roomCode ?? null;
}

export {
  createRoom, joinRoom, leaveRoom,
  disconnectPlayer, reconnectPlayer, restoreRoom,
  setReady, selectGame, getRoom, getRoomByPlayer, getRoomCodeByPlayer,
  removeBot, setBotDifficulty,
};
