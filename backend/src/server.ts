import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import healthRouter from "./routes/health";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  getRoomByPlayer,
} from "./rooms/roomManager";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "http://localhost:3000" },
});

const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "GameHub API", status: "running" });
});

app.use("/api", healthRouter);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // CREATE ROOM
  socket.on("createRoom", () => {
    const room = createRoom(socket.id);
    socket.join(room.roomCode);
    console.log(`Room created: ${room.roomCode} by ${socket.id}`);
    socket.emit("roomUpdated", room);
  });

  // JOIN ROOM
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

  // LEAVE ROOM
  socket.on("leaveRoom", ({ roomCode }: { roomCode: string }) => {
    const updatedRoom = leaveRoom(roomCode, socket.id);
    socket.leave(roomCode);
    console.log(`Player ${socket.id} left room: ${roomCode}`);
    if (updatedRoom) {
      io.to(roomCode).emit("roomUpdated", updatedRoom);
    }
  });

  // PLAYER READY
  socket.on("playerReady", ({ roomCode, ready }: { roomCode: string; ready: boolean }) => {
    const updatedRoom = setReady(roomCode, socket.id, ready);
    if (!updatedRoom) return;
    io.to(roomCode).emit("roomUpdated", updatedRoom);
  });

  // START GAME
  socket.on("startGame", ({ roomCode }: { roomCode: string }) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.host !== socket.id) return;
    const allReady = Object.values(room.players).every((p) => p.ready);
    if (!allReady) return;
    console.log(`Game started in room: ${roomCode}`);
    io.to(roomCode).emit("startGame", { roomCode });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    const updatedRoom = leaveRoom(room.roomCode, socket.id);
    if (updatedRoom) {
      io.to(room.roomCode).emit("roomUpdated", updatedRoom);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
