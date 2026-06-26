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

const GAME_INFO: Record<string, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  stack5: {
    label: "Stack5",
    color: "#16a34a",
    bg: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
    icon: "🧱",
    desc: "Build stacks, earn points, master cards",
  },
};

export default function HomeScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [name, setName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("gamehub:name") ?? "" : ""
  );
  const [joining, setJoining] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef(name);
  nameRef.current = name;

  // Save name to localStorage whenever it changes
  function setAndSaveName(v: string) {
    setName(v);
    if (typeof window !== "undefined") localStorage.setItem("gamehub:name", v);
  }

  useEffect(() => {
    const socket = getSocket();

    function onRoomList(list: RoomSummary[]) {
      setRooms(list.filter((r) => r.gameId === "stack5" || r.gameId === null));
    }
    function onJoinError(d: { message: string }) {
      setError(d.message);
      setJoining(null);
      setCreating(false);
    }
    function onRoomUpdated(room: { roomCode: string; selectedGameId: string | null }) {
      // Navigate to game once we know the room code
      if (room.selectedGameId === "stack5" || room.selectedGameId === null) {
        router.push(`/game/stack5/${room.roomCode.toUpperCase()}`);
      }
    }

    socket.on("rooms:list", onRoomList);
    socket.on("joinError", onJoinError);
    socket.on("roomUpdated", onRoomUpdated);

    socket.emit("rooms:getList");

    // Refresh list every 5s in case missed broadcasts
    const interval = setInterval(() => socket.emit("rooms:getList"), 5000);

    return () => {
      socket.off("rooms:list", onRoomList);
      socket.off("joinError", onJoinError);
      socket.off("roomUpdated", onRoomUpdated);
      clearInterval(interval);
    };
  }, [router]);

  function handleCreate() {
    const n = nameRef.current.trim();
    if (!n) { setError("Enter your name first"); return; }
    setCreating(true);
    setError("");
    const socket = getSocket();
    socket.emit("createRoom");
    // After roomUpdated fires, we navigate and then set the name in the game page
    // Store name so game page can pick it up
    sessionStorage.setItem("gamehub:pendingName", n);
  }

  function handleJoin(roomCode: string) {
    const n = nameRef.current.trim();
    if (!n) { setError("Enter your name first"); return; }
    setJoining(roomCode);
    setError("");
    sessionStorage.setItem("gamehub:pendingName", n);
    const socket = getSocket();
    socket.emit("joinRoom", { roomCode });
  }

  const waitingRooms = rooms.filter((r) => r.status === "waiting");
  const playingRooms = rooms.filter((r) => r.status === "playing");

  return (
    <main className="min-h-screen" style={{ background: "#e8f5e9" }}>

      {/* ── Header ── */}
      <header style={{ background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #388e3c 100%)" }}
        className="px-6 py-5 shadow-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-2xl shadow-lg"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              🎮
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-none">GameHub</h1>
              <p className="text-xs text-green-300 mt-0.5">Multiplayer card games</p>
            </div>
          </div>

          {/* Name input */}
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400 text-sm">👤</span>
              <input
                type="text"
                maxLength={20}
                value={name}
                onChange={(e) => setAndSaveName(e.target.value)}
                placeholder="Your name…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl font-bold text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 transition-all"
                style={{ background: "rgba(255,255,255,0.92)" }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 px-6 py-3 text-sm font-bold text-red-700 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Game type banner ── */}
        <div className="mb-8 rounded-3xl overflow-hidden shadow-xl" style={{ background: GAME_INFO.stack5.bg }}>
          <div className="flex items-center gap-6 p-6">
            <div className="text-6xl drop-shadow-lg">🧱</div>
            <div className="flex-1">
              <h2 className="text-3xl font-black text-white tracking-tight">Stack5</h2>
              <p className="text-green-200 mt-1">{GAME_INFO.stack5.desc}</p>
              <div className="flex items-center gap-4 mt-3">
                <span className="text-xs font-bold text-green-300 bg-black/20 rounded-full px-3 py-1">2–6 players</span>
                <span className="text-xs font-bold text-green-300 bg-black/20 rounded-full px-3 py-1">Card game</span>
                <span className="text-xs font-bold text-green-300 bg-black/20 rounded-full px-3 py-1">Online multiplayer</span>
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="shrink-0 rounded-2xl px-7 py-4 text-lg font-black text-green-900 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-150 disabled:opacity-60"
              style={{ background: "#bbf7d0" }}>
              {creating ? "Creating…" : "+ Create Game"}
            </button>
          </div>
        </div>

        {/* ── Waiting rooms ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black text-gray-800">
              Open Games
              <span className="ml-2 rounded-full bg-green-500 text-white text-xs px-2.5 py-0.5 font-bold">{waitingRooms.length}</span>
            </h3>
            <p className="text-xs text-gray-500">Updates live</p>
          </div>

          {waitingRooms.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white/50 py-12 text-center">
              <p className="text-4xl mb-3">🃏</p>
              <p className="font-bold text-gray-500">No open games right now</p>
              <p className="text-sm text-gray-400 mt-1">Create one and invite friends!</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {waitingRooms.map((room) => (
                <RoomCard key={room.roomCode} room={room} joining={joining} onJoin={handleJoin} />
              ))}
            </div>
          )}
        </section>

        {/* ── Playing rooms ── */}
        {playingRooms.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xl font-black text-gray-800">In Progress</h3>
              <span className="rounded-full bg-orange-400 text-white text-xs px-2.5 py-0.5 font-bold">{playingRooms.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {playingRooms.map((room) => (
                <RoomCard key={room.roomCode} room={room} joining={joining} onJoin={handleJoin} playing />
              ))}
            </div>
          </section>
        )}

        {/* ── How to play ── */}
        <section className="mt-12 rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-black text-gray-800 mb-4">How to Play</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Enter your name", desc: "Type your name in the box above — it'll be remembered next time." },
              { step: "2", title: "Create or join", desc: "Start a new game or jump into an open one. No room code needed." },
              { step: "3", title: "Play!", desc: "Build 5-card stacks by color or shape. First to 3 points wins." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-green-500 text-white font-black flex items-center justify-center shrink-0 text-sm shadow">{step}</div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
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

function RoomCard({ room, joining, onJoin, playing }: {
  room: RoomSummary;
  joining: string | null;
  onJoin: (code: string) => void;
  playing?: boolean;
}) {
  const isJoining = joining === room.roomCode;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      {/* Color stripe */}
      <div className="h-1.5" style={{ background: playing ? "#f97316" : "#16a34a" }} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🧱</span>
              <span className="font-black text-gray-800">Stack5</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`h-2 w-2 rounded-full ${playing ? "bg-orange-400 animate-pulse" : "bg-green-400 animate-pulse"}`} />
              <span className={`text-xs font-bold ${playing ? "text-orange-500" : "text-green-600"}`}>
                {playing ? "In progress" : "Waiting for players"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-gray-800">{room.playerCount}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">player{room.playerCount !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Player names */}
        {room.playerNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {room.playerNames.slice(0, 5).map((n, i) => (
              <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{n}</span>
            ))}
            {room.playerNames.length > 5 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">+{room.playerNames.length - 5}</span>
            )}
          </div>
        )}

        <button
          onClick={() => onJoin(room.roomCode)}
          disabled={!!joining}
          className="w-full rounded-xl py-2.5 text-sm font-black transition-all duration-150 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
          style={{
            background: playing ? "#fff7ed" : "#f0fdf4",
            color: playing ? "#c2410c" : "#15803d",
            border: `1.5px solid ${playing ? "#fed7aa" : "#bbf7d0"}`,
          }}>
          {isJoining ? "Joining…" : playing ? "Spectate / Rejoin" : "Join Game →"}
        </button>
      </div>
    </div>
  );
}
