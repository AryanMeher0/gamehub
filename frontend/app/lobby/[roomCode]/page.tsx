"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Room, Player } from "@/types/lobby";

import { GAME_REGISTRY } from "@/lib/games";
import GamePicker from "@/components/lobby/GamePicker";

export default function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [socketId, setSocketId] = useState<string>("");
  const [lobbyError, setLobbyError] = useState<string>("");

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");
    // Normalize to match backend storage/room namespaces
    const normalizedRoomCode = (roomCode ?? "").toUpperCase();

    function onConnect() { setSocketId(socket.id ?? ""); }

    function onRoomUpdated(updated: Room) {
      console.log("ROOM UPDATED RECEIVED", updated);
      setRoom(updated);
    }

    function onStartGame({ gameId }: { roomCode: string; gameId: string }) {
      router.push(`/game/${gameId}/${roomCode}`);
    }
    function onLobbyError(data: { message: string }) {
      setLobbyError(data.message);
      setTimeout(() => setLobbyError(""), 4000);
    }

    socket.on("connect", onConnect);
    socket.on("roomUpdated", onRoomUpdated);
    socket.on("startGame", onStartGame);
    socket.on("lobbyError", onLobbyError);

    const rc = normalizedRoomCode;

    // Emit join room event
    socket.emit("joinRoom", { roomCode: rc });

    return () => {
      socket.off("connect", onConnect);
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("startGame", onStartGame);
      socket.off("lobbyError", onLobbyError);
    };
  }, [roomCode, router]);

  function handleLeave() {
    getSocket().emit("leaveRoom", { roomCode: (roomCode ?? "").toUpperCase() });
    router.push("/");
  }

  function handleReady() {
    if (!room) return;
    const myPlayer = room.players[socketId];
    getSocket().emit("playerReady", { roomCode: (roomCode ?? "").toUpperCase(), ready: !myPlayer?.ready });
  }

  function handleSelectGame(gameId: string) {
    getSocket().emit("lobby:selectGame", { roomCode: (roomCode ?? "").toUpperCase(), gameId });
  }

  function handleStart() {
    getSocket().emit("startGame", { roomCode: (roomCode ?? "").toUpperCase() });
  }

  function handleAddBot() {
    getSocket().emit("lobby:addBot", { roomCode: (roomCode ?? "").toUpperCase() });
  }


  const players = room ? Object.values(room.players) : [];
  const isHost = room?.host === socketId;
  const myReady = room?.players[socketId]?.ready ?? false;
  const allReady = players.length > 0 && players.every((p) => p.ready);

  const selectedGame = room?.selectedGameId
    ? GAME_REGISTRY.find((g) => g.id === room.selectedGameId)
    : null;

  const canStart =
    allReady &&
    !!selectedGame &&
    players.length >= (selectedGame?.minPlayers ?? 2);


  const startLabel = !selectedGame
    ? "Select a game first"
    : players.length < (selectedGame?.minPlayers ?? 2)
    ? `Need ${selectedGame.minPlayers - players.length} more player(s)`
    : !allReady
    ? "Waiting for players..."
    : "Start Game →";

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="text-gray-400 animate-pulse">Connecting to lobby...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 px-4 py-8 text-white">
      {/* Room Code */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs uppercase tracking-widest text-gray-500">Room Code</p>
        <h1 className="text-5xl font-black tracking-[0.3em] text-indigo-400">{roomCode}</h1>
        {isHost && (
          <span className="mt-1 rounded-full bg-indigo-900 px-3 py-0.5 text-xs font-semibold text-indigo-300">
            You are the host
          </span>
        )}
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Game Picker */}
        <GamePicker
          selectedGameId={room.selectedGameId}
          isHost={isHost}
          playerCount={players.length}
          onSelect={handleSelectGame}
        />

        {/* Player List */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-300">Players</p>
            <p className="text-sm text-gray-500">{players.length} connected</p>

          </div>
          <ul className="flex flex-col gap-2">
            {players.map((player: Player) => (
              <li
                key={player.id}
                className="flex items-center justify-between rounded-xl bg-gray-800 px-4 py-3"
              >
                <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-gray-300">
                    {player.displayName ?? player.id.slice(0, 8) + "…"}
                  </span>
                  {player.isBot && (
                    <span className="rounded-full bg-sky-900 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                      BOT
                    </span>
                  )}

                  {player.id === room.host && (

                    <span className="rounded-full bg-yellow-900 px-2 py-0.5 text-xs text-yellow-400">
                      Host
                    </span>
                  )}
                  {player.id === socketId && (
                    <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                      You
                    </span>
                  )}
                </div>
                <span className={`text-xs font-semibold ${player.ready ? "text-green-400" : "text-gray-500"}`}>
                  {player.ready ? "Ready" : "Not Ready"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Lobby error */}
        {lobbyError && (
          <p className="rounded-xl bg-red-900/40 px-4 py-2 text-center text-sm text-red-400">
            {lobbyError}
          </p>
        )}

        {/* Actions */}
        <button
          onClick={handleReady}
          className={`w-full rounded-2xl py-4 text-lg font-bold transition-all active:scale-95 ${
            myReady ? "bg-green-700 hover:bg-green-600" : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          {myReady ? "✓ Ready" : "Set Ready"}
        </button>

        {isHost && (
          <button
            onClick={handleAddBot}
            className="w-full rounded-2xl bg-sky-700 py-4 text-lg font-bold hover:bg-sky-600 active:scale-95 transition-all"
          >
            Add Bot
          </button>
        )}

        {isHost && (
          <button
            onClick={handleStart}

            disabled={!canStart}
            className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-bold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition-all"
          >
            {startLabel}
          </button>
        )}

        <button
          onClick={handleLeave}
          className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
        >
          Leave Room
        </button>

      </div>
    </main>
  );
}
