const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

interface Room {
  createdAt: number;
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

function createRoom(): string {
  const roomCode = generateRoomCode();
  rooms[roomCode] = { createdAt: Date.now() };
  return roomCode;
}

export { createRoom, rooms };
