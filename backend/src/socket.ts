import { Server } from "socket.io";
import http from "http";

const PORT = process.env.PORT || 3000;
const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "https://your-frontend-domain.com", // Replace with your frontend domain
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
