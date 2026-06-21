"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Room } from "@/types/lobby";

export default function JoinGame({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket = getSocket();

    function onRoomUpdated(room: Room) {
      router.push(`/lobby/${room.roomCode}`);
    }

    function onJoinError(data: { message: string }) {
      setError(data.message);
      setLoading(false);
    }

    socket.on("roomUpdated", onRoomUpdated);
    socket.on("joinError", onJoinError);
    return () => {
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("joinError", onJoinError);
    };
  }, [router]);

  function handleJoin() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    getSocket().emit("joinRoom", { roomCode: code.trim().toUpperCase() });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 px-4 text-white">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-black tracking-tight">Join Game</h1>
        <p className="text-gray-400 text-sm">Enter the 6-character room code</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-4">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="AB12CD"
          maxLength={6}
          className="w-full rounded-2xl bg-gray-800 px-4 py-4 text-center text-2xl font-mono font-bold tracking-[0.4em] text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleJoin}
          disabled={loading || code.trim().length < 6}
          className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-bold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back
        </button>
      </div>
    </main>
  );
}
