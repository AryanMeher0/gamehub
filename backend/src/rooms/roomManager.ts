import { Room, Player } from "../types";

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
  const roomCode = generateRoomCode();
  const player: Player = { id: socketId, ready: false };
  rooms[roomCode] = {
    roomCode,
    host: socketId,
    players: { [socketId]: player },
    createdAt: Date.now(),
  };
  return rooms[roomCode];
}

function joinRoom(roomCode: string, socketId: string): { success: boolean; room?: Room; message?: string } {
  const room = rooms[roomCode];
  if (!room) return { success: false, message: "Room not found" };
  if (room.players[socketId]) return { success: true, room };
  room.players[socketId] = { id: socketId, ready: false };
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

function setReady(roomCode: string, socketId: string, ready: boolean): Room | null {
  const room = rooms[roomCode];
  if (!room || !room.players[socketId]) return null;
  room.players[socketId].ready = ready;
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

export { createRoom, joinRoom, leaveRoom, setReady, getRoom, getRoomByPlayer, getRoomCodeByPlayer };
