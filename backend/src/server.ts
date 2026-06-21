import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import healthRouter from "./routes/health";
import { createRoom } from "./rooms/roomManager";

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

  socket.emit("server:welcome", { message: "Connected to GameHub server" });

  socket.on("client:create-room", () => {
    const roomCode = createRoom();
    console.log(`Room Created: ${roomCode}`);
    socket.emit("server:room-created", { roomCode });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
