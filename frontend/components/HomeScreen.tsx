"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";

type RoomSummary = {
  roomCode: string;
  playerCount: number;
  gameId: string | null;
  status: "waiting" | "playing";
  playerNames: string[];
  createdAt: number;
};

const GAMES = [
  {
    id: "stack5",
    label: "Stack5",
    icon: "🧱",
    desc: "Build color/shape stacks, earn points with Master Cards",
    tags: ["2–6 players", "Card game"],
    bg: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
    btnColor: "#bbf7d0",
    btnText: "#14532d",
    route: (code: string) => `/game/stack5/${code}`,
  },
  {
    id: "monopoly",
    label: "Monopoly",
    icon: "🎩",
    desc: "Buy properties, build houses, bankrupt your rivals",
    tags: ["2–8 players", "Board game"],
    bg: "linear-gradient(135deg, #b45309 0%, #92400e 100%)",
    btnColor: "#fef3c7",
    btnText: "#78350f",
    route: (code: string) => `/lobby/${code}`,
  },
] as const;

type GameId = typeof GAMES[number]["id"];

function gameRoute(gameId: string | null, code: string): string {
  const g = GAMES.find((g) => g.id === gameId);
  return g ? g.route(code) : `/game/stack5/${code}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [name, setName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("gamehub:name") ?? "" : ""
  );
  const [joining, setJoining] = useState<string | null>(null);
  const [creating, setCreating] = useState<GameId | null>(null);
  const [error, setError] = useState("");
  const nameRef = useRef(name);
  nameRef.current = name;

  // Tracks what game we're navigating to after create/join
  const awaitingNavRef = useRef<{ gameId: string | null; roomCode?: string } | null>(null);

  function setAndSaveName(v: string) {
    setName(v);
    if (typeof window !== "undefined") localStorage.setItem("gamehub:name", v);
  }

  useEffect(() => {
    const socket = getSocket();

    function onRoomList(list: RoomSummary[]) {
      setRooms(list);
    }
    function onJoinError(d: { message: string }) {
      setError(d.message);
      setJoining(null);
      setCreating(null);
      awaitingNavRef.current = null;
    }
    function onRoomUpdated(room: { roomCode: string; host: string; selectedGameId: string | null }) {
      if (!room) return;
      const nav = awaitingNavRef.current;
      if (!nav) return;
      // For join: must match the room code we joined
      if (nav.roomCode && nav.roomCode.toUpperCase() !== room.roomCode.toUpperCase()) return;
      // For create: must be a room where we're host
      if (!nav.roomCode && room.host !== socket.id) return;

      awaitingNavRef.current = null;
      setCreating(null);
      setJoining(null);

      const gid = nav.gameId ?? room.selectedGameId;
      // Mark the room with this game type so other players can see it in the browser
      if (nav.gameId && !nav.roomCode) {
        socket.emit("lobby:selectGame", { roomCode: room.roomCode, gameId: nav.gameId });
      }
      router.push(gameRoute(gid, room.roomCode.toUpperCase()));
    }

    socket.on("rooms:list", onRoomList);
    socket.on("joinError", onJoinError);
    socket.on("roomUpdated", onRoomUpdated);
    socket.emit("rooms:getList");

    const interval = setInterval(() => socket.emit("rooms:getList"), 5000);

    return () => {
      socket.off("rooms:list", onRoomList);
      socket.off("joinError", onJoinError);
      socket.off("roomUpdated", onRoomUpdated);
      clearInterval(interval);
    };
  }, [router]);

  function handleCreate(gameId: GameId) {
    const n = nameRef.current.trim();
    if (!n) { setError("Enter your name first"); return; }
    setCreating(gameId);
    setError("");
    sessionStorage.setItem("gamehub:pendingName", n);
    awaitingNavRef.current = { gameId };
    const socket = getSocket();
    // selectGame will be called by the server when stack5:configure is called,
    // but we also call it here so the room appears in the correct section immediately.
    // We emit createRoom and then mark the game via lobby:selectGame in onRoomUpdated.
    socket.emit("createRoom");
  }

  function handleJoin(roomCode: string, gameId: string | null) {
    const n = nameRef.current.trim();
    if (!n) { setError("Enter your name first"); return; }
    setJoining(roomCode);
    setError("");
    sessionStorage.setItem("gamehub:pendingName", n);
    awaitingNavRef.current = { gameId, roomCode };
    getSocket().emit("joinRoom", { roomCode });
  }

  // Group rooms by game type
  const stack5Rooms = rooms.filter((r) => r.gameId === "stack5");
  const monopolyRooms = rooms.filter((r) => r.gameId === "monopoly");
  const openRooms = rooms.filter((r) => !r.gameId); // created but game not yet selected

  return (
    <main className="min-h-screen" style={{ background: "radial-gradient(ellipse at 50% 30%, #1a2040 0%, #0c1228 55%, #060810 100%)" }}>

      {/* ── Header ── */}
      <header style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}
        className="px-6 py-5 shadow-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-2xl shadow-lg"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              🎮
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-none">GameHub</h1>
              <p className="text-xs text-amber-300 mt-0.5">Multiplayer games — no sign up needed</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm">👤</span>
              <input
                type="text"
                maxLength={20}
                value={name}
                onChange={(e) => setAndSaveName(e.target.value)}
                placeholder="Your name…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl font-bold text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-950/80 border-l-4 border-red-500 px-6 py-3 text-sm font-bold text-red-300 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

        {/* ── Game sections ── */}
        {GAMES.map((game) => {
          const gameRooms = game.id === "stack5" ? [...stack5Rooms, ...openRooms] : monopolyRooms;
          const waiting = gameRooms.filter((r) => r.status === "waiting");
          const playing = gameRooms.filter((r) => r.status === "playing");

          return (
            <section key={game.id}>
              {/* Game banner */}
              <div className="mb-4 rounded-3xl overflow-hidden shadow-xl" style={{ background: game.bg }}>
                <div className="flex items-center gap-5 p-5">
                  <div className="text-5xl drop-shadow-lg shrink-0">{game.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-black text-white tracking-tight">{game.label}</h2>
                    <p className="text-white/70 text-sm mt-0.5">{game.desc}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {game.tags.map((t) => (
                        <span key={t} className="text-[10px] font-bold text-white/60 bg-black/20 rounded-full px-2.5 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreate(game.id)}
                    disabled={creating !== null}
                    className="shrink-0 rounded-2xl px-6 py-3.5 text-base font-black hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-150 disabled:opacity-60"
                    style={{ background: game.btnColor, color: game.btnText }}>
                    {creating === game.id ? "Creating…" : "+ Create"}
                  </button>
                </div>
              </div>

              {/* Open rooms */}
              {waiting.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                    Open
                    <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px]">{waiting.length}</span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {waiting.map((room) => (
                      <RoomCard key={room.roomCode} room={room} game={game}
                        joining={joining} onJoin={handleJoin} />
                    ))}
                  </div>
                </div>
              )}

              {/* In progress rooms */}
              {playing.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                    In Progress
                    <span className="rounded-full bg-orange-400 text-white px-2 py-0.5 text-[10px]">{playing.length}</span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {playing.map((room) => (
                      <RoomCard key={room.roomCode} room={room} game={game}
                        joining={joining} onJoin={handleJoin} playing />
                    ))}
                  </div>
                </div>
              )}

              {waiting.length === 0 && playing.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-black/20 py-8 text-center">
                  <p className="text-2xl mb-2">{game.icon}</p>
                  <p className="font-bold text-slate-500 text-sm">No {game.label} games yet</p>
                  <p className="text-xs text-slate-500 mt-0.5">Be the first to create one!</p>
                </div>
              )}
            </section>
          );
        })}

        {/* ── How to play ── */}
        <section className="rounded-2xl bg-slate-900/80 p-6 shadow-sm border border-slate-800">
          <h3 className="text-lg font-black text-white mb-4">How to Play</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Enter your name", desc: "Type your name above — it's remembered next time." },
              { step: "2", title: "Create or join", desc: "Start a new game or jump into an open one. No room codes needed." },
              { step: "3", title: "Play!", desc: "Stack5: build 5-card stacks by color or shape. First to 3 points wins." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-500 text-white font-black flex items-center justify-center shrink-0 text-sm shadow">{step}</div>
                <div>
                  <p className="font-bold text-white text-sm">{title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// ─── RoomCard ─────────────────────────────────────────────────────────────────

function RoomCard({ room, game, joining, onJoin, playing }: {
  room: RoomSummary;
  game: typeof GAMES[number];
  joining: string | null;
  onJoin: (code: string, gameId: string | null) => void;
  playing?: boolean;
}) {
  const isJoining = joining === room.roomCode;

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="h-1.5" style={{ background: playing ? "#f97316" : "#f59e0b" }} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{game.icon}</span>
              <span className="font-black text-white">{game.label}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`h-2 w-2 rounded-full ${playing ? "bg-orange-400 animate-pulse" : "bg-amber-400 animate-pulse"}`} />
              <span className={`text-xs font-bold ${playing ? "text-orange-500" : "text-amber-600"}`}>
                {playing ? "In progress" : "Waiting for players"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-white">{room.playerCount}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">player{room.playerCount !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {room.playerNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {room.playerNames.slice(0, 5).map((n, i) => (
              <span key={i} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">{n}</span>
            ))}
            {room.playerNames.length > 5 && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-500">+{room.playerNames.length - 5}</span>
            )}
          </div>
        )}

        <button
          onClick={() => onJoin(room.roomCode, room.gameId)}
          disabled={!!joining}
          className="w-full rounded-xl py-2.5 text-sm font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
          style={{
            background: playing ? "rgba(234,88,12,0.15)" : "rgba(245,158,11,0.12)",
            color: playing ? "#fb923c" : "#f59e0b",
            border: `1.5px solid ${playing ? "rgba(234,88,12,0.4)" : "rgba(245,158,11,0.35)"}`,
          }}>
          {isJoining ? "Joining…" : playing ? "Spectate / Rejoin" : "Join Game →"}
        </button>
      </div>
    </div>
  );
}
