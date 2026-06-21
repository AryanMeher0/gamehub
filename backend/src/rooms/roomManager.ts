const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

interface Room {
  roomCode: string;
  createdAt: number;
  players: string[];
}

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

function createRoom(creatorSocketId: string): string {
  const roomCode = generateRoomCode();
  rooms[roomCode] = { roomCode, createdAt: Date.now(), players: [creatorSocketId] };
  return roomCode;
}

function joinRoom(roomCode: string, socketId: string): { success: boolean; message?: string } {
  const room = rooms[roomCode];
  if (!room) return { success: false, message: "Room not found" };
  room.players.push(socketId);
  return { success: true };
}

export { createRoom, joinRoom, rooms };
