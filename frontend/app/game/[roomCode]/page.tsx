"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { GameState } from "@/types/game";
import Board from "@/components/game/Board";
import PlayerPanel from "@/components/game/PlayerPanel";
import GameLog from "@/components/game/GameLog";

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [state, setState] = useState<GameState | null>(null);
  const [socketId, setSocketId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");

    function onConnect() { setSocketId(socket.id ?? ""); }

    function onStateUpdated(s: GameState) {
      setState(s);
      setError("");
    }

    function onError(data: { message: string }) {
      setError(data.message);
      setTimeout(() => setError(""), 3000);
    }

    socket.on("connect", onConnect);
    socket.on("game:stateUpdated", onStateUpdated);
    socket.on("game:error", onError);

    // Request current state in case we navigated here after startGame was emitted
    socket.emit("game:getState", { roomCode });

    return () => {
      socket.off("connect", onConnect);
      socket.off("game:stateUpdated", onStateUpdated);
      socket.off("game:error", onError);
    };
  }, [roomCode]);

  function handleRoll() {
    getSocket().emit("game:roll", { roomCode });
  }

  function handleEndTurn() {
    getSocket().emit("game:endTurn", { roomCode });
  }

  function handleLeave() {
    getSocket().emit("leaveRoom", { roomCode });
    router.push("/");
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="animate-pulse text-gray-400">Loading game...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-indigo-400">GameHub</span>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-400">
            {roomCode}
          </span>
        </div>
        {error && (
          <span className="rounded-lg bg-red-900/50 px-3 py-1 text-xs text-red-400">{error}</span>
        )}
        <button
          onClick={handleLeave}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Leave
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
        {/* Board — square, takes as much space as possible */}
        <div className="w-full lg:flex-1">
          <Board players={state.players} />
        </div>

        {/* Sidebar */}
        <div className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
          <PlayerPanel
            state={state}
            socketId={socketId}
            onRoll={handleRoll}
            onEndTurn={handleEndTurn}
          />
          <GameLog log={state.log} />
        </div>
      </div>
    </main>
  );
}
