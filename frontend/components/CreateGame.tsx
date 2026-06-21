"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Room } from "@/types/lobby";

export default function CreateGame({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket = getSocket();

    function onRoomUpdated(room: Room) {
      router.push(`/lobby/${room.roomCode}`);
    }

    socket.on("roomUpdated", onRoomUpdated);
    return () => { socket.off("roomUpdated", onRoomUpdated); };
  }, [router]);

  function handleCreate() {
    setLoading(true);
    setError("");
    getSocket().emit("createRoom");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 px-4 text-white">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-black tracking-tight">Create Game</h1>
        <p className="text-gray-400 text-sm">A new room will be generated for you</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-4">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-bold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          {loading ? "Creating..." : "Create Room"}
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
