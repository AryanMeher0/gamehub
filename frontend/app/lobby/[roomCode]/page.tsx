"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Room, Player, BotType } from "@/types/lobby";
import { GAME_REGISTRY } from "@/lib/games";

const GAME_ICONS: Record<string, string> = {
  monopoly: "🎩",
  stack5: "🧱",
  arena_brawler: "⚔️",
};

export default function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [socketId, setSocketId] = useState<string>("");
  const [lobbyError, setLobbyError] = useState<string>("");

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");
    const rc = (roomCode ?? "").toUpperCase();

    function onConnect() { setSocketId(socket.id ?? ""); }
    function onRoomUpdated(updated: Room) { setRoom(updated); }
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
  function handleRemoveBot(botId: string) {
    getSocket().emit("lobby:removeBot", { roomCode: (roomCode ?? "").toUpperCase(), botId });
  }
  function handleSetBotDifficulty(botId: string, difficulty: BotType) {
    getSocket().emit("lobby:setBotDifficulty", { roomCode: (roomCode ?? "").toUpperCase(), botId, difficulty });
  }

  const players = room ? Object.values(room.players) : [];
  const isHost = room?.host === socketId;
  const myReady = room?.players[socketId]?.ready ?? false;
  const allReady = players.length > 0 && players.every((p) => p.ready);
  const selectedGame = room?.selectedGameId
    ? GAME_REGISTRY.find((g) => g.id === room.selectedGameId)
    : null;
  const canStart = allReady && !!selectedGame && players.length >= (selectedGame?.minPlayers ?? 2);
  const startLabel = !selectedGame
    ? "Select a game first"
    : players.length < (selectedGame?.minPlayers ?? 2)
    ? `Need ${(selectedGame.minPlayers) - players.length} more player${(selectedGame.minPlayers) - players.length !== 1 ? "s" : ""}`
    : !allReady
    ? "Waiting for all to ready up…"
    : "Start Game →";

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white"
        style={{ background: "radial-gradient(ellipse at 50% 60%, #1a4d30 0%, #0a2518 60%, #060f0a 100%)" }}>
        <div className="text-center fade-up">
          <div className="text-4xl mb-4 animate-pulse">🎮</div>
          <p className="text-green-400 font-bold">Connecting to lobby…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-8 text-white"
      style={{ background: "radial-gradient(ellipse at 50% 60%, #1a4d30 0%, #0a2518 60%, #060f0a 100%)" }}>

      {/* Room code */}
      <div className="text-center fade-up">
        <p className="text-xs font-bold uppercase tracking-widest text-green-800 mb-1">Room Code</p>
        <h1 className="text-5xl font-black tracking-[0.3em] text-green-300">{roomCode?.toUpperCase()}</h1>
        {isHost && (
          <span className="mt-2 inline-block rounded-full bg-green-900/60 border border-green-700/40 px-3 py-0.5 text-xs font-bold text-green-400">
            You are the host
          </span>
        )}
      </div>

      {/* Error toast */}
      {lobbyError && (
        <div className="rounded-xl border border-red-700/60 bg-red-950/90 px-5 py-2.5 text-sm font-bold text-red-200 shadow-xl card-in">
          ⚠ {lobbyError}
        </div>
      )}

      <div className="w-full max-w-sm flex flex-col gap-4">

        {/* Game picker */}
        <div className="rounded-2xl border border-green-900/40 bg-black/40 p-4 backdrop-blur fade-up" style={{ animationDelay: "60ms" }}>
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-green-800">
            {isHost ? "Select a Game" : "Selected Game"}
          </p>
          <div className="flex flex-col gap-2">
            {GAME_REGISTRY.map((game) => {
              const isSelected = room.selectedGameId === game.id;
              const notEnough = players.length < game.minPlayers;
              return (
                <button
                  key={game.id}
                  onClick={() => isHost && handleSelectGame(game.id)}
                  disabled={!isHost}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200
                    ${isSelected
                      ? "border-green-500/60 bg-green-950/60 shadow-lg shadow-green-900/20"
                      : "border-green-900/30 bg-black/20 hover:border-green-700/40 hover:bg-green-900/10"}
                    ${!isHost ? "cursor-default" : "cursor-pointer active:scale-[0.98]"}
                  `}
                >
                  <span className="text-2xl">{GAME_ICONS[game.id] ?? "🎮"}</span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-green-200">{game.name}</span>
                      {isSelected && (
                        <span className="rounded-full bg-green-700/60 border border-green-600/40 px-2 py-0.5 text-[9px] font-black text-green-300">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-green-800 leading-relaxed">{game.description}</p>
                    <p className="text-[9px] text-green-900">
                      {game.minPlayers}–{game.maxPlayers} players
                      {notEnough && (
                        <span className="ml-1 text-amber-700">
                          (need {game.minPlayers - players.length} more)
                        </span>
                      )}
                    </p>
                  </div>
                  {isSelected && <span className="text-green-400 text-sm">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Players */}
        <div className="rounded-2xl border border-green-900/40 bg-black/40 p-4 backdrop-blur fade-up" style={{ animationDelay: "120ms" }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-green-800">Players</p>
            <p className="text-[10px] text-green-900">{players.length} connected</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {players.map((player: Player) => (
              <div key={player.id}
                className="rounded-xl px-3 py-2.5 transition-all"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Avatar */}
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black text-green-300"
                      style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(74,222,128,0.2)" }}>
                      {(player.displayName ?? player.id).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-bold text-green-200">
                      {player.displayName ?? player.id.slice(0, 8) + "…"}
                    </span>
                    {player.isBot && (
                      <span className="rounded-full bg-cyan-900/60 border border-cyan-700/40 px-1.5 py-0.5 text-[8px] font-bold text-cyan-300">BOT</span>
                    )}
                    {player.id === room.host && (
                      <span className="rounded-full bg-amber-900/60 border border-amber-700/40 px-1.5 py-0.5 text-[8px] font-bold text-amber-300">Host</span>
                    )}
                    {player.id === socketId && !player.isBot && (
                      <span className="rounded-full bg-green-900/40 border border-green-800/30 px-1.5 py-0.5 text-[8px] text-green-700">You</span>
                    )}
                  </div>
                  <span className={`text-xs font-black ${player.ready ? "text-green-400" : "text-green-900"}`}>
                    {player.ready ? "✓ Ready" : "Not ready"}
                  </span>
                </div>
                {/* Bot difficulty controls */}
                {player.isBot && isHost && (
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={player.botType ?? "easy"}
                      onChange={(e) => handleSetBotDifficulty(player.id, e.target.value as BotType)}
                      className="flex-1 rounded-lg bg-black/30 border border-green-900/40 px-2 py-1 text-xs text-green-300 outline-none focus:border-green-700">
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                    <button onClick={() => handleRemoveBot(player.id)}
                      className="rounded-lg bg-red-950/60 border border-red-800/40 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-900/60 active:scale-95 transition-all">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 fade-up" style={{ animationDelay: "180ms" }}>
          <button onClick={handleReady}
            className={`w-full rounded-2xl py-4 text-base font-black transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 shadow-lg ${
              myReady
                ? "bg-green-600 text-white shadow-green-900/50"
                : "bg-black/40 border border-green-900/50 text-green-600 hover:bg-green-900/20"
            }`}>
            {myReady ? "✓ Ready" : "Set Ready"}
          </button>

          {isHost && (
            <button onClick={handleAddBot}
              className="w-full rounded-2xl bg-black/40 border border-cyan-900/50 py-3.5 text-sm font-black text-cyan-500 hover:bg-cyan-900/20 hover:-translate-y-0.5 active:scale-95 transition-all duration-150">
              + Add Bot
            </button>
          )}

          {isHost && (
            <button onClick={handleStart} disabled={!canStart}
              className={`w-full rounded-2xl py-4 text-base font-black transition-all duration-150 shadow-lg
                ${canStart
                  ? "bg-green-600 text-white hover:-translate-y-0.5 hover:bg-green-500 hover:shadow-xl active:scale-95 shadow-green-900/60"
                  : "bg-black/20 border border-green-900/30 text-green-900 cursor-not-allowed"
                }`}>
              {startLabel}
            </button>
          )}

          <button onClick={handleLeave}
            className="text-xs text-green-900 hover:text-green-600 transition-colors text-center pt-1">
            Leave Room
          </button>
        </div>
      </div>
    </main>
  );
}
