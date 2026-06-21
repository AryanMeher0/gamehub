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

  const [joinInput, setJoinInput] = useState<string>("");
  const [joining, setJoining] = useState<boolean>(false);
  const [joinedRoom, setJoinedRoom] = useState<string>("");
  const [joinError, setJoinError] = useState<string>("");

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

    socket.on("server:join-success", (data: { roomCode: string }) => {
      setJoinedRoom(data.roomCode);
      setJoinError("");
      setJoining(false);
    });

    socket.on("server:join-failed", (data: { message: string }) => {
      setJoinError(data.message);
      setJoinedRoom("");
      setJoining(false);
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

  function handleJoinRoom() {
    if (!socketRef.current || joining || !joinInput.trim()) return;
    setJoining(true);
    setJoinedRoom("");
    setJoinError("");
    socketRef.current.emit("client:join-room", { roomCode: joinInput.trim().toUpperCase() });
  }

  const statusColor =
    status === "Connected"
      ? "text-green-400"
      : status === "Disconnected"
      ? "text-red-400"
      : "text-yellow-400";

  const isConnected = status === "Connected";

  return (
    <div className="flex flex-col items-center gap-6 text-sm w-full max-w-sm">
      <p>
        Socket Status:{" "}
        <span className={`font-semibold ${statusColor}`}>{status}</span>
      </p>
      {welcome && <p className="text-gray-400">{welcome}</p>}

      {/* Create Room */}
      <div className="flex flex-col items-center gap-3 w-full">
        <button
          onClick={handleCreateRoom}
          disabled={creating || !isConnected}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-lg font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Room"}
        </button>

        {roomCode && (
          <div className="w-full rounded-xl border border-indigo-500 bg-gray-900 px-8 py-4 text-center">
            <p className="text-xs uppercase tracking-widest text-gray-400">Room Code</p>
            <p className="mt-1 text-3xl font-bold tracking-widest text-indigo-400">
              {roomCode}
            </p>
          </div>
        )}
      </div>

      <div className="w-full border-t border-gray-700" />

      {/* Join Room */}
      <div className="flex flex-col items-center gap-3 w-full">
        <input
          type="text"
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
          placeholder="Enter room code"
          maxLength={6}
          disabled={!isConnected}
          className="w-full rounded-xl bg-gray-800 px-4 py-3 text-center text-lg font-mono tracking-widest text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={handleJoinRoom}
          disabled={joining || !isConnected || !joinInput.trim()}
          className="w-full rounded-xl bg-gray-700 px-6 py-3 text-lg font-semibold hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joining ? "Joining..." : "Join Room"}
        </button>

        {joinedRoom && (
          <p className="font-semibold text-green-400">Joined Room: {joinedRoom}</p>
        )}
        {joinError && (
          <p className="font-semibold text-red-400">{joinError}</p>
        )}
      </div>
    </div>
  );
}
