import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("https://gamehub-backend-xqoy.onrender.com", {
      autoConnect: true,
    });
  }
  return socket;
}