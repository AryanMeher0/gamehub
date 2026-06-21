"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type Status = "Connecting..." | "Connected" | "Disconnected";

export default function SocketStatus() {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<Status>("Connecting...");
  const [welcome, setWelcome] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);

  useEffect(() => {
    const socket: Socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => setStatus("Connected"));
    socket.on("disconnect", () => setStatus("Disconnected"));
    socket.on("server:welcome", (data: { message: string }) =>
      setWelcome(data.message)
    );
    socket.on("server:room-created", (data: { roomCode: string }) => {
      setRoomCode(data.roomCode);
      setCreating(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function handleCreateRoom() {
    if (!socketRef.current || creating) return;
    setCreating(true);
    setRoomCode("");
    socketRef.current.emit("client:create-room");
  }

  const statusColor =
    status === "Connected"
      ? "text-green-400"
      : status === "Disconnected"
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <div className="flex flex-col items-center gap-4 text-sm">
      <p>
        Socket Status:{" "}
        <span className={`font-semibold ${statusColor}`}>{status}</span>
      </p>
      {welcome && <p className="text-gray-400">{welcome}</p>}

      <div className="flex gap-4">
        <button
          onClick={handleCreateRoom}
          disabled={creating || status !== "Connected"}
          className="rounded-xl bg-indigo-600 px-6 py-3 text-lg font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Room"}
        </button>
        <button
          disabled
          className="rounded-xl bg-gray-700 px-6 py-3 text-lg font-semibold opacity-50 cursor-not-allowed"
        >
          Join Room
        </button>
      </div>

      {roomCode && (
        <div className="mt-2 rounded-xl border border-indigo-500 bg-gray-900 px-8 py-4 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-400">Room Code</p>
          <p className="mt-1 text-3xl font-bold tracking-widest text-indigo-400">
            {roomCode}
          </p>
        </div>
      )}
    </div>
  );
}
