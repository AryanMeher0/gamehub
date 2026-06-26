"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import {
  Stack5State, Stack5Card, Stack5Stack, Stack5Player, CardColor, CardShape,
} from "@/types/stack5";

// ─── UI Mode ──────────────────────────────────────────────────────────────────

type UIMode =
  | { type: "idle" }
  | { type: "card_selected"; cardId: string }
  | { type: "special_selected"; cardId: string; cardType: "skip" | "reset_hand" }
  | { type: "steal_mode" }
  | { type: "trade_mode"; selectedIds: string[] }
  | { type: "wild_pending"; cardId: string; slotIndex: number };

// ─── Visuals ──────────────────────────────────────────────────────────────────

const COLOR_BG: Record<CardColor, string> = {
  green: "bg-green-500", yellow: "bg-yellow-400", pink: "bg-pink-500", blue: "bg-blue-500",
};
const COLOR_TEXT: Record<CardColor, string> = {
  green: "text-white", yellow: "text-gray-900", pink: "text-white", blue: "text-white",
};
const COLOR_LABEL: Record<CardColor, string> = {
  green: "Green", yellow: "Yellow", pink: "Pink", blue: "Blue",
};
const SHAPE_EMOJI: Record<CardShape, string> = {
  flower: "🌸", lightning: "⚡", star: "⭐", drop: "💧",
};
const SHAPE_LABEL: Record<CardShape, string> = {
  flower: "Flower", lightning: "Lightning", star: "Star", drop: "Drop",
};
const COLORS: CardColor[] = ["green", "yellow", "pink", "blue"];
const SHAPES: CardShape[] = ["flower", "lightning", "star", "drop"];

const SPECIAL_FILENAMES: Record<string, string> = {
  wild: "wild", skip: "skip", reverse: "reverse", reset_hand: "resethand",
};

function cardImageSrc(card: Stack5Card): string {
  if (card.type === "standard") return `/cards/${card.color}_${card.shape}.png`;
  return `/cards/${SPECIAL_FILENAMES[card.type] ?? card.type}.png`;
}

function cardAlt(card: Stack5Card): string {
  if (card.type === "standard") return `${card.color} ${card.shape}`;
  return card.type.replace(/_/g, " ");
}

function effectiveColor(card: Stack5Card): CardColor | null {
  if (card.type === "standard") return card.color;
  if (card.type === "wild") return card.assignedColor ?? null;
  return null;
}
function effectiveShape(card: Stack5Card): CardShape | null {
  if (card.type === "standard") return card.shape;
  if (card.type === "wild") return card.assignedShape ?? null;
  return null;
}

function isValidForStack(stack: Stack5Stack, card: Stack5Card): boolean {
  if (stack.cards.length === 0) return true;
  if (stack.completed) return false;
  if (card.type === "wild") return true;
  if (card.type !== "standard") return false;
  if (stack.matchType === "color") return card.color === stack.matchValue;
  if (stack.matchType === "shape") return card.shape === stack.matchValue;
  const ref = stack.cards.find((c) => effectiveColor(c) !== null || effectiveShape(c) !== null);
  if (!ref) return true;
  const rc = effectiveColor(ref);
  const rs = effectiveShape(ref);
  return (rc !== null && card.color === rc) || (rs !== null && card.shape === rs);
}

function isValidTradeSet(hand: Stack5Card[], ids: string[]): boolean {
  if (ids.length !== 4) return false;
  const cards = ids.map((id) => hand.find((c) => c.id === id)).filter(Boolean) as Stack5Card[];
  if (cards.some((c) => c.type !== "standard")) return false;
  return new Set(cards.map((c) => c.color)).size === 4 || new Set(cards.map((c) => c.shape)).size === 4;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Stack5Page() {
  const { roomCode: rawCode } = useParams<{ roomCode: string }>();
  const roomCode = rawCode.toUpperCase();
  const router = useRouter();

  const [state, setState] = useState<Stack5State | null>(null);
  const [socketId, setSocketId] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<UIMode>({ type: "idle" });
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const stateRef = useRef<Stack5State | null>(null);

  // Setup config
  const [targetScore, setTargetScore] = useState(3);
  const [startingMC, setStartingMC] = useState(2);
  const [turnTimer, setTurnTimer] = useState(30);
  const [numDecks, setNumDecks] = useState(1);
  const [myName, setMyName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<{ id: string; name: string }[]>([]);

  const errorTimer = useRef<ReturnType<typeof setTimeout>>();

  function showError(msg: string) {
    setError(msg);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(""), 3500);
  }

  function emit(event: string, payload?: Record<string, unknown>) {
    getSocket().emit(event, { roomCode, ...payload });
  }

  function handleNameChange(name: string) {
    setMyName(name);
    getSocket().emit("room:setDisplayName", { roomCode, name });
  }

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");
    if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);

    function onConnect() {
      setSocketId(socket.id ?? "");
      if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);
      socket.emit("stack5:getState", { roomCode });
    }
    function onState(s: Stack5State) {
      stateRef.current = s;
      setState(s);
      setMode({ type: "idle" });
    }
    function onError(d: { message: string }) { showError(d.message); }
    function onReconnected() { socket.emit("stack5:getState", { roomCode }); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onRoomUpdated(room: any) {
      if (!room) return;
      setIsHost(room.host === socket.id);
      const players = Object.entries(room.players as Record<string, { displayName?: string }>)
        .map(([id, p]) => ({ id, name: p.displayName ?? id.slice(0, 6) }));
      setLobbyPlayers(players);
    }

    socket.on("connect", onConnect);
    socket.on("stack5:stateUpdated", onState);
    socket.on("stack5:error", onError);
    socket.on("game:reconnected", onReconnected);
    socket.on("roomUpdated", onRoomUpdated);
    socket.emit("stack5:getState", { roomCode });
    socket.emit("getRoom", { roomCode });

    return () => {
      socket.off("connect", onConnect);
      socket.off("stack5:stateUpdated", onState);
      socket.off("stack5:error", onError);
      socket.off("game:reconnected", onReconnected);
      socket.off("roomUpdated", onRoomUpdated);
    };
  }, [roomCode]);

  // Countdown timer
  useEffect(() => {
    if (!state || state.turnTimerSeconds <= 0) { setTimeLeft(null); return; }
    function tick() {
      const s = stateRef.current;
      if (!s || s.turnTimerSeconds <= 0) return;
      setTimeLeft(Math.max(0, s.turnTimerSeconds - Math.floor((Date.now() - s.turnStartedAt) / 1000)));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state?.turnTimerSeconds, state?.turnStartedAt]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const me = state ? state.players[socketId] : null;
  const isMyTurn = !!(state && state.turnOrder[state.currentTurnIndex] === socketId && !state.gameOver);
  const canAct = isMyTurn && (state?.actionsRemaining ?? 0) > 0;
  const opponents = state
    ? state.turnOrder.filter((id) => id !== socketId).map((id) => state.players[id]).filter(Boolean)
    : [];
  const topDiscard = state?.discardPile[state.discardPile.length - 1] ?? null;

  // ─── Actions ───────────────────────────────────────────────────────────────

  function handleCardClick(cardId: string) {
    if (!canAct || !me) return;
    if (mode.type === "trade_mode") {
      const already = mode.selectedIds.includes(cardId);
      setMode({
        type: "trade_mode",
        selectedIds: already ? mode.selectedIds.filter((id) => id !== cardId) : [...mode.selectedIds, cardId],
      });
      return;
    }
    const card = me.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (mode.type === "card_selected" && mode.cardId === cardId) { setMode({ type: "idle" }); return; }
    if (card.type === "reverse") { emit("stack5:playCard", { cardId }); setMode({ type: "idle" }); return; }
    if (card.type === "skip" || card.type === "reset_hand") {
      setMode({ type: "special_selected", cardId, cardType: card.type });
      return;
    }
    setMode({ type: "card_selected", cardId });
  }

  function handleSlotClick(slotIndex: number) {
    if (!canAct || !me || mode.type !== "card_selected") return;
    const card = me.hand.find((c) => c.id === mode.cardId);
    if (!card) return;
    if (!isValidForStack(me.stacks[slotIndex], card)) { showError("Card doesn't match this stack's pattern"); return; }
    if (card.type === "wild") { setMode({ type: "wild_pending", cardId: mode.cardId, slotIndex }); }
    else { emit("stack5:playCard", { cardId: mode.cardId, slotIndex }); setMode({ type: "idle" }); }
  }

  function handleSlotDrop(cardId: string, slotIndex: number) {
    if (!canAct || !me) return;
    const card = me.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (!isValidForStack(me.stacks[slotIndex], card)) { showError("Card doesn't match this stack's pattern"); return; }
    if (card.type === "reverse") { emit("stack5:playCard", { cardId }); return; }
    if (card.type === "skip" || card.type === "reset_hand") {
      setMode({ type: "special_selected", cardId, cardType: card.type });
      return;
    }
    if (card.type === "wild") { setMode({ type: "wild_pending", cardId, slotIndex }); }
    else { emit("stack5:playCard", { cardId, slotIndex }); setMode({ type: "idle" }); }
  }

  function handleWildChoice(color: CardColor, shape: CardShape) {
    if (mode.type !== "wild_pending") return;
    emit("stack5:playCard", { cardId: mode.cardId, slotIndex: mode.slotIndex, chosenColor: color, chosenShape: shape });
    setMode({ type: "idle" });
  }

  function handleSpecialTarget(targetPlayerId: string) {
    if (mode.type !== "special_selected") return;
    emit("stack5:playCard", { cardId: mode.cardId, targetPlayerId });
    setMode({ type: "idle" });
  }

  function handleSecure(slotIndex: number) { if (canAct) emit("stack5:secure", { slotIndex }); }
  function handleDraw() { if (canAct) { emit("stack5:drawCard"); setMode({ type: "idle" }); } }
  function handleEndTurn() { if (isMyTurn) { emit("stack5:endTurn"); setMode({ type: "idle" }); } }

  function handleStealTarget(targetPlayerId: string, targetSlotIndex: number) {
    if (mode.type !== "steal_mode") return;
    emit("stack5:steal", { targetPlayerId, targetSlotIndex });
    setMode({ type: "idle" });
  }

  function handleTradeConfirm() {
    if (mode.type !== "trade_mode") return;
    emit("stack5:tradeForMaster", { cardIds: mode.selectedIds });
    setMode({ type: "idle" });
  }

  function handleConfigure() {
    emit("stack5:configure", { targetScore, startingMasterCards: startingMC, turnTimerSeconds: turnTimer, numDecks });
  }

  // ─── Setup / Waiting screen ────────────────────────────────────────────────

  if (!state) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-br from-slate-950 via-gray-950 to-indigo-950 px-4 text-white">
        <div className="text-center fade-up">
          <span className="text-5xl">🧱</span>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-indigo-400">Stack5</h1>
          <p className="mt-1 text-xs text-gray-500 font-mono tracking-widest">{roomCode}</p>
        </div>

        <div className="w-full max-w-sm fade-up" style={{ animationDelay: "60ms" }}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-gray-500">Your Name</p>
          <input
            type="text" maxLength={20} value={myName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter your name…"
            className="w-full rounded-2xl bg-gray-800/80 border border-gray-700 px-4 py-3 text-sm font-bold placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
          />
        </div>

        {isHost ? (
          <div className="w-full max-w-sm rounded-3xl border border-gray-700/60 bg-gray-900/80 p-5 shadow-2xl shadow-black/60 backdrop-blur fade-up" style={{ animationDelay: "120ms" }}>
            <h2 className="mb-5 text-center text-xl font-black tracking-tight">Create Game</h2>

            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Points to Win</p>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setTargetScore(n)}
                    className={`rounded-2xl py-3 font-black transition-all duration-150 ${targetScore === n ? "bg-indigo-600 text-white scale-105 shadow-lg shadow-indigo-900/50" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:-translate-y-0.5"}`}>
                    {n} pts
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Starting Master Cards</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setStartingMC(n)}
                    className={`rounded-2xl py-3 font-black transition-all duration-150 ${startingMC === n ? "bg-amber-500 text-gray-950 scale-105 shadow-lg shadow-amber-900/40" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:-translate-y-0.5"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Turn Timer</p>
              <div className="grid grid-cols-4 gap-2">
                {[0, 15, 30, 60].map((n) => (
                  <button key={n} onClick={() => setTurnTimer(n)}
                    className={`rounded-2xl py-3 text-sm font-black transition-all duration-150 ${turnTimer === n ? "bg-cyan-600 text-white scale-105 shadow-lg shadow-cyan-900/40" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:-translate-y-0.5"}`}>
                    {n === 0 ? "Off" : `${n}s`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Number of Decks</p>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((n) => (
                  <button key={n} onClick={() => setNumDecks(n)}
                    className={`rounded-2xl py-3 font-black transition-all duration-150 ${numDecks === n ? "bg-purple-600 text-white scale-105 shadow-lg shadow-purple-900/40" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:-translate-y-0.5"}`}>
                    {n} Deck{n > 1 ? "s" : ""} ({n * 100} cards)
                  </button>
                ))}
              </div>
            </div>

            {lobbyPlayers.length > 0 && (
              <div className="mb-4 rounded-xl bg-gray-800/60 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-2">In Lobby</p>
                <div className="flex flex-wrap gap-1.5">
                  {lobbyPlayers.map((p) => (
                    <span key={p.id} className="rounded-full bg-gray-700 px-2.5 py-0.5 text-xs font-bold">{p.name}</span>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleConfigure}
              className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-black hover:bg-indigo-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-900/50 active:scale-95 transition-all duration-150">
              Start Game →
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-3xl border border-gray-700/60 bg-gray-900/80 p-6 text-center shadow-2xl backdrop-blur fade-up" style={{ animationDelay: "120ms" }}>
            <div className="mb-3 text-3xl animate-pulse">⏳</div>
            <p className="font-black text-lg mb-1">Waiting for host to start…</p>
            <p className="text-xs text-gray-500 mb-4">Your name is set — the host will start the game.</p>
            {lobbyPlayers.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {lobbyPlayers.map((p) => (
                  <span key={p.id} className="rounded-full bg-gray-800 px-3 py-1 text-xs font-bold">{p.name}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
          className="text-sm text-gray-600 hover:text-gray-400 transition-colors">Leave room</button>
      </main>
    );
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────

  if (state.gameOver) {
    const winner = state.winnerId ? state.players[state.winnerId] : null;
    const sorted = state.turnOrder.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.points - a.points);
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-950 via-gray-950 to-indigo-950 px-4 text-white">
        <span className="text-7xl fade-up">🏆</span>
        <div className="text-center fade-up" style={{ animationDelay: "80ms" }}>
          <h1 className="text-4xl font-black tracking-tight">{winner?.name ?? "Someone"} wins!</h1>
          <p className="mt-1 text-gray-400">{winner?.points} point{winner?.points !== 1 ? "s" : ""} scored</p>
        </div>
        <div className="w-full max-w-xs rounded-2xl border border-gray-700/60 bg-gray-900/80 p-4 shadow-2xl fade-up" style={{ animationDelay: "160ms" }}>
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-gray-800 last:border-0">
              <span className="w-5 text-center font-black text-gray-600">{i + 1}</span>
              <div className="h-3.5 w-3.5 rounded-full shrink-0 shadow-md" style={{ backgroundColor: p.color }} />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="font-black text-amber-400">{p.points} pts</span>
            </div>
          ))}
        </div>
        <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
          className="rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-black hover:bg-indigo-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-900/50 active:scale-95 transition-all duration-150 fade-up" style={{ animationDelay: "240ms" }}>
          Back to Lobby
        </button>
      </main>
    );
  }

  // ─── Active game ───────────────────────────────────────────────────────────

  const currentTurnPlayer = state.players[state.turnOrder[state.currentTurnIndex]];

  return (
    <main className="flex h-screen flex-col bg-gradient-to-br from-slate-950 via-gray-950 to-slate-900 text-white overflow-hidden">

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 bg-black/30 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="font-black text-lg text-indigo-400 tracking-tight">Stack5</span>
          <span className="rounded-full bg-white/8 px-2.5 py-0.5 font-mono text-xs text-gray-400">{roomCode}</span>
        </div>
        <div className="flex flex-col items-center">
          {isMyTurn ? (
            <span className="turn-glow rounded-full bg-green-900/40 border border-green-500/50 px-4 py-1 text-xs font-black text-green-400 tracking-wide">
              YOUR TURN · {state.actionsRemaining} action{state.actionsRemaining !== 1 ? "s" : ""} left
            </span>
          ) : (
            <span className="text-xs text-gray-500 italic">
              {currentTurnPlayer?.name}&apos;s turn
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLog((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-all duration-150 ${showLog ? "bg-indigo-700 text-white shadow-md shadow-indigo-900/50" : "bg-white/6 text-gray-400 hover:bg-white/10 hover:text-gray-200"}`}>
            📋 Log
          </button>
          {socketId === state.hostId && (
            <>
              <button onClick={() => emit("stack5:operator:shuffleDeck")}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/6 text-gray-300 hover:bg-white/12 hover:-translate-y-0.5 transition-all duration-150">
                Shuffle Deck
              </button>
              <button onClick={() => emit("stack5:operator:transferDiscard")}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/6 text-gray-300 hover:bg-white/12 hover:-translate-y-0.5 transition-all duration-150">
                Transfer Discard
              </button>
              <button onClick={() => router.push(`/game/stack5/${roomCode}/operator`)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">⚙️</button>
            </>
          )}
          <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Leave</button>
        </div>
      </header>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed top-14 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-900/95 border border-red-700/60 px-5 py-2.5 text-sm font-bold text-red-200 shadow-2xl backdrop-blur-md card-in">
          {error}
        </div>
      )}

      {/* ── Modals ── */}
      {mode.type === "wild_pending" && (
        <WildPicker onPick={handleWildChoice} onCancel={() => setMode({ type: "idle" })} />
      )}
      {mode.type === "special_selected" && (
        <TargetOverlay
          label={mode.cardType === "skip" ? "Skip — choose a player" : "Reset Hand — choose a player"}
          players={opponents}
          onSelect={handleSpecialTarget}
          onCancel={() => setMode({ type: "idle" })}
        />
      )}

      {/* ── Steal hint banner ── */}
      {mode.type === "steal_mode" && (
        <div className="fixed top-12 inset-x-0 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto mt-2 flex items-center gap-3 rounded-2xl border border-red-600/60 bg-red-950/95 px-5 py-2.5 shadow-2xl backdrop-blur-md card-in">
            <span className="text-sm font-black text-red-300">Select an opponent&apos;s stack — costs 1 Master Card</span>
            <button onClick={() => setMode({ type: "idle" })} className="text-xs text-red-600 hover:text-red-400 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Main flex area: log + game ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Log sidebar */}
        {showLog && (
          <div className="w-52 shrink-0 border-r border-white/5 bg-black/20 flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/5">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Game Log</p>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col-reverse px-2 py-1 gap-0.5">
              {[...state.log].reverse().map((entry, i) => (
                <p key={i} className={`text-[10px] py-1 border-b border-white/4 last:border-0 ${
                  entry.startsWith("🏅") || entry.startsWith("⭐") ? "text-amber-400" :
                  entry.startsWith("🗡️") ? "text-red-400" :
                  entry.startsWith("♻️") ? "text-cyan-400" :
                  entry.startsWith("⏰") ? "text-orange-400" :
                  entry.startsWith("🏆") ? "text-yellow-300 font-black" :
                  "text-gray-500"
                }`}>{entry}</p>
              ))}
            </div>
          </div>
        )}

        {/* Game area */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">

          {/* ── Opponents ── */}
          {opponents.length > 0 && (
            <div className={`grid gap-3 ${
              opponents.length === 1 ? "grid-cols-1 max-w-xl mx-auto w-full" :
              opponents.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
              "grid-cols-1 sm:grid-cols-3"
            }`}>
              {opponents.map((opp) => (
                <OpponentPanel
                  key={opp.id}
                  player={opp}
                  isCurrentTurn={state.turnOrder[state.currentTurnIndex] === opp.id}
                  stealMode={mode.type === "steal_mode"}
                  myMasterCards={me?.masterCards ?? 0}
                  onSteal={(si) => handleStealTarget(opp.id, si)}
                />
              ))}
            </div>
          )}

          {/* ── Center: deck / timer / discard ── */}
          <div className="flex items-center justify-center gap-8 py-1 shrink-0">
            <DeckPile count={state.drawDeck.length} />
            <div className="flex flex-col items-center gap-1.5">
              <TurnTimer timeLeft={timeLeft} total={state.turnTimerSeconds} />
              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                <span className="text-gray-500">{state.direction === 1 ? "↻" : "↺"}</span>
                <span>First to {state.targetScore} pts</span>
              </div>
            </div>
            <DiscardPile topCard={topDiscard} count={state.discardPile.length} />
          </div>

          {/* ── My Board ── */}
          {me && (
            <div className="rounded-3xl border border-white/8 bg-gray-900/60 p-4 flex flex-col gap-3 backdrop-blur-sm shadow-2xl shadow-black/40">

              {/* My stats */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-5">
                  <div className="text-center">
                    <p className="text-2xl font-black text-amber-400 tracking-tight">
                      {me.points}<span className="text-sm font-semibold text-gray-600">/{state.targetScore}</span>
                    </p>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Points Scored</p>
                  </div>
                  <div className="h-8 w-px bg-white/8" />
                  <div className="text-center">
                    <p className="text-2xl font-black text-indigo-300 tracking-tight">{me.masterCards}</p>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Master Cards</p>
                  </div>
                  <div className="h-8 w-px bg-white/8" />
                  <div className="text-center">
                    <p className="text-2xl font-black tracking-tight">{me.hand.length}</p>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">In Hand</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isMyTurn && <ActionsBar remaining={state.actionsRemaining} />}
                  {(mode.type === "card_selected" || mode.type === "trade_mode") && (
                    <button onClick={() => setMode({ type: "idle" })} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/6">Cancel</button>
                  )}
                </div>
              </div>

              {/* My stacks */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {me.stacks.map((stack) => {
                  const sel = mode.type === "card_selected" ? me.hand.find((c) => c.id === mode.cardId) : null;
                  const dragCard = draggingCardId ? me.hand.find((c) => c.id === draggingCardId) : null;
                  const canDrop = (!!sel && isValidForStack(stack, sel)) ||
                    (!!dragCard && isValidForStack(stack, dragCard));
                  return (
                    <MyStackSlot
                      key={stack.slotIndex}
                      stack={stack}
                      canDrop={canDrop}
                      isSelectMode={mode.type === "card_selected" || draggingCardId !== null}
                      canSecure={canAct && stack.completed && me.masterCards > 0}
                      onClick={() => handleSlotClick(stack.slotIndex)}
                      onSecure={() => handleSecure(stack.slotIndex)}
                      onDragOver={(e) => { if (draggingCardId) e.preventDefault(); }}
                      onDrop={() => { if (draggingCardId) handleSlotDrop(draggingCardId, stack.slotIndex); }}
                    />
                  );
                })}
              </div>

              {/* Hand */}
              <div>
                <p className="mb-2 px-1 text-[9px] font-bold uppercase tracking-widest text-gray-600">
                  Hand · {me.hand.length} {me.hand.length === 1 ? "card" : "cards"}
                  {mode.type === "trade_mode" && (
                    <span className="ml-2 text-indigo-400">— pick 4 unique colors or shapes</span>
                  )}
                </p>
                <div className="flex overflow-x-auto pb-2 min-h-[8rem] items-end" style={{ gap: 0 }}>
                  {me.hand.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-xs text-gray-700 italic">Empty hand</div>
                  ) : (
                    me.hand.map((card, idx) => {
                      const isSelected = (mode.type === "card_selected" && mode.cardId === card.id) ||
                        (mode.type === "trade_mode" && mode.selectedIds.includes(card.id));
                      const isDimmed = mode.type === "trade_mode" && card.type !== "standard";
                      const isDragging = draggingCardId === card.id;
                      return (
                        <CardView
                          key={card.id}
                          card={card}
                          selected={isSelected}
                          dimmed={isDimmed}
                          isDragging={isDragging}
                          onClick={() => handleCardClick(card.id)}
                          clickable={canAct}
                          style={{ marginLeft: idx === 0 ? 0 : -20 }}
                          onDragStart={() => {
                            if (!canAct) return;
                            setDraggingCardId(card.id);
                            setMode({ type: "idle" });
                          }}
                          onDragEnd={() => setDraggingCardId(null)}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {isMyTurn && (
                <div className="flex flex-wrap gap-2 border-t border-white/6 pt-3">
                  <ActionBtn onClick={handleDraw} disabled={!canAct}>Draw Card</ActionBtn>
                  {mode.type === "trade_mode" ? (
                    <>
                      <ActionBtn onClick={handleTradeConfirm}
                        disabled={!isValidTradeSet(me.hand, mode.selectedIds)} variant="green">
                        Confirm Trade ({mode.selectedIds.length}/4)
                      </ActionBtn>
                      <ActionBtn onClick={() => setMode({ type: "idle" })} variant="ghost">Cancel</ActionBtn>
                    </>
                  ) : (
                    <ActionBtn onClick={() => canAct && setMode({ type: "trade_mode", selectedIds: [] })} disabled={!canAct}>
                      Trade 4 → Master Card
                    </ActionBtn>
                  )}
                  {me.masterCards > 0 && mode.type !== "steal_mode" && (
                    <ActionBtn onClick={() => canAct && setMode({ type: "steal_mode" })} disabled={!canAct} variant="red">
                      🗡️ Steal (costs 1 Master Card)
                    </ActionBtn>
                  )}
                  <ActionBtn onClick={handleEndTurn} variant="ghost">End Turn</ActionBtn>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── ActionsBar ───────────────────────────────────────────────────────────────

function ActionsBar({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mr-0.5">Actions</span>
      {[0, 1].map((i) => (
        <div key={i}
          className={`h-3 w-3 rounded-full transition-all duration-300 ${
            i < remaining ? "bg-green-400 shadow-md shadow-green-400/50 scale-110" : "bg-gray-800"
          }`}
        />
      ))}
    </div>
  );
}

// ─── TurnTimer ────────────────────────────────────────────────────────────────

function TurnTimer({ timeLeft, total }: { timeLeft: number | null; total: number }) {
  if (timeLeft === null || total <= 0) return null;
  const fraction = timeLeft / total;
  const r = 18;
  const circ = 2 * Math.PI * r;
  const color = timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f59e0b" : "#22c55e";
  return (
    <div className="relative flex items-center justify-center w-14 h-14">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#1f2937" strokeWidth="3" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - fraction)}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.25s ease-out, stroke 0.3s" }} />
      </svg>
      <span className="absolute text-sm font-black" style={{ color }}>{timeLeft}</span>
    </div>
  );
}

// ─── DeckPile ─────────────────────────────────────────────────────────────────

function DeckPile({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-20 w-14 deck-float cursor-default">
        {count > 3 && (
          <div className="absolute" style={{ top: 6, left: 6, width: "100%", height: "100%" }}>
            <div className="h-full w-full rounded-xl bg-indigo-950 border border-indigo-900/40" />
          </div>
        )}
        {count > 1 && (
          <div className="absolute" style={{ top: 3, left: 3, width: "100%", height: "100%" }}>
            <div className="h-full w-full rounded-xl bg-indigo-900 border border-indigo-700/40" />
          </div>
        )}
        <div className="relative h-full w-full rounded-xl bg-gradient-to-br from-indigo-700 to-indigo-900 border-2 border-indigo-500/60 flex items-center justify-center shadow-xl shadow-indigo-900/60">
          <div className="text-center">
            <span className="text-lg font-black text-indigo-200">{count}</span>
          </div>
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Deck</span>
    </div>
  );
}

// ─── DiscardPile ──────────────────────────────────────────────────────────────

function DiscardPile({ topCard, count }: { topCard: Stack5Card | null; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-20 w-14">
        {count > 1 && (
          <div className="absolute" style={{ top: 3, left: 3, width: "100%", height: "100%" }}>
            <div className="h-full w-full rounded-xl bg-gray-800 border border-gray-700" />
          </div>
        )}
        <div className="relative h-full w-full rounded-xl border-2 border-gray-600/60 bg-gray-800 overflow-hidden shadow-lg">
          {topCard
            ? <img src={cardImageSrc(topCard)} alt={cardAlt(topCard)} key={topCard.id}
                className="h-full w-full object-cover card-in" draggable={false} />
            : <div className="flex h-full items-center justify-center text-gray-700 text-lg">—</div>}
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Discard {count}</span>
    </div>
  );
}

// ─── StackCard ────────────────────────────────────────────────────────────────

function StackCard({ card, mini }: { card: Stack5Card; mini?: boolean }) {
  return (
    <div className={`relative ${mini ? "h-9 w-6" : "h-14 w-10"} rounded-md overflow-hidden border border-black/25 shrink-0 card-in`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

// ─── MyStackSlot ──────────────────────────────────────────────────────────────

function MyStackSlot({ stack, canDrop, isSelectMode, canSecure, onClick, onSecure, onDragOver, onDrop }: {
  stack: Stack5Stack; canDrop: boolean; isSelectMode: boolean;
  canSecure: boolean; onClick: () => void; onSecure: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  const dots = Array.from({ length: 5 }, (_, i) => i < stack.cards.length);

  return (
    <div
      onClick={isSelectMode ? onClick : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative flex flex-col rounded-2xl border p-3 transition-all duration-200 ${
        stack.completed
          ? "border-amber-500/80 bg-amber-950/30 complete-pulse"
          : canDrop
          ? "cursor-pointer border-green-500 bg-green-950/25 drop-glow"
          : isSelectMode
          ? "cursor-pointer border-gray-700/60 bg-gray-900/40 opacity-50"
          : "border-white/6 bg-gray-900/40"
      }`}
      style={{ minHeight: "9rem" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Slot {stack.slotIndex + 1}</span>
        {/* Progress dots */}
        <div className="flex gap-1">
          {dots.map((filled, i) => (
            <div key={i} className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${filled ? "bg-indigo-400 scale-110" : "bg-gray-700"}`} />
          ))}
        </div>
      </div>

      {stack.cards.length === 0 ? (
        <div className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-3 transition-all duration-200 ${
          canDrop ? "border-green-500/60 bg-green-950/20" : "border-gray-700/40"
        }`}>
          {canDrop
            ? <><span className="text-lg">⬇</span><span className="text-[10px] font-bold text-green-400">Drop here</span></>
            : <span className="text-[10px] text-gray-700">Empty</span>}
        </div>
      ) : (
        <div className="flex flex-row flex-wrap gap-1 justify-center py-1 flex-1">
          {stack.cards.map((card, i) => (
            <StackCard key={`${card.id}-${i}`} card={card} />
          ))}
        </div>
      )}

      {stack.matchType && (
        <p className="mt-1.5 text-center text-[8px] font-bold uppercase tracking-wider text-gray-500">
          {stack.matchType} · {stack.matchValue}
        </p>
      )}

      {stack.completed && (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <span className="rounded-full bg-amber-500/20 border border-amber-500/50 px-2.5 py-0.5 text-[9px] font-black text-amber-400 tracking-wide">★ READY</span>
          {canSecure && (
            <button onClick={(e) => { e.stopPropagation(); onSecure(); }}
              className="rounded-xl bg-amber-500 px-3 py-1 text-[9px] font-black text-gray-950 hover:bg-amber-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-900/40 active:scale-95 transition-all duration-150">
              Secure (costs 1 Master Card)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OpponentPanel ────────────────────────────────────────────────────────────

function OpponentPanel({ player, isCurrentTurn, stealMode, myMasterCards, onSteal }: {
  player: Stack5Player; isCurrentTurn: boolean; stealMode: boolean;
  myMasterCards: number; onSteal: (si: number) => void;
}) {
  return (
    <div className={`rounded-2xl border p-3.5 transition-all duration-300 ${
      isCurrentTurn
        ? "border-indigo-500/50 bg-indigo-950/25 shadow-lg shadow-indigo-900/30"
        : "border-white/6 bg-gray-900/50"
    }`}>
      {/* Avatar + name + turn badge */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="relative shrink-0">
          <div className="h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-black"
            style={{ backgroundColor: player.color + "30", borderColor: player.color }}>
            {player.name.charAt(0).toUpperCase()}
          </div>
          {isCurrentTurn && (
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-gray-950" />
          )}
        </div>
        <span className="flex-1 truncate text-sm font-black">{player.name}</span>
        {isCurrentTurn && (
          <span className="rounded-full bg-indigo-600/80 border border-indigo-500/50 px-2 py-0.5 text-[8px] font-black tracking-wide">TURN</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="rounded-xl bg-white/4 py-2 text-center">
          <p className="text-sm font-black text-amber-400">{player.points}</p>
          <p className="text-[8px] text-gray-600">Points</p>
        </div>
        <div className="rounded-xl bg-white/4 py-2 text-center">
          <p className="text-sm font-black text-indigo-300">{player.masterCards}</p>
          <p className="text-[8px] text-gray-600">Master Cards</p>
        </div>
        <div className="rounded-xl bg-white/4 py-2 text-center">
          <p className="text-sm font-black">{player.hand.length}</p>
          <p className="text-[8px] text-gray-600">In Hand</p>
        </div>
      </div>

      {/* Stacks */}
      <div className="flex flex-col gap-1.5">
        {player.stacks.map((stack) => {
          const canSteal = stealMode && stack.cards.length > 0 && myMasterCards > 0;
          const dots = Array.from({ length: 5 }, (_, i) => i < stack.cards.length);
          return (
            <div key={stack.slotIndex}
              onClick={canSteal ? () => onSteal(stack.slotIndex) : undefined}
              className={`flex flex-row items-center gap-2 rounded-xl border px-2.5 py-2 transition-all duration-200 ${
                canSteal
                  ? "cursor-pointer border-red-500/60 bg-red-950/30 hover:bg-red-950/50 hover:border-red-500 active:scale-[0.98]"
                  : stack.completed ? "border-amber-500/50 bg-amber-950/20"
                  : "border-white/5 bg-white/3"
              }`}
            >
              <span className="text-[8px] font-bold text-gray-600 w-3 shrink-0">{stack.slotIndex + 1}</span>
              <div className="flex flex-row gap-0.5 flex-1 min-w-0">
                {stack.cards.length === 0
                  ? <span className="text-[8px] text-gray-700 italic">empty</span>
                  : stack.cards.map((card, i) => <StackCard key={`${card.id}-${i}`} card={card} mini />)
                }
              </div>
              <div className="flex flex-col items-end shrink-0 gap-1">
                <div className="flex gap-0.5">
                  {dots.map((filled, i) => (
                    <div key={i} className={`h-1 w-1 rounded-full ${filled ? "bg-indigo-400" : "bg-gray-700"}`} />
                  ))}
                </div>
                {stack.completed && <span className="text-[8px] text-amber-400 font-black">★</span>}
                {stack.matchType && <span className="text-[6px] text-gray-600 capitalize">{stack.matchValue}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CardView ─────────────────────────────────────────────────────────────────

function CardView({ card, selected, dimmed, isDragging, onClick, clickable, style, onDragStart, onDragEnd }: {
  card: Stack5Card; selected?: boolean; dimmed?: boolean; isDragging?: boolean;
  onClick?: () => void; clickable?: boolean;
  style?: React.CSSProperties;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <button
      draggable={clickable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={style}
      className={`shrink-0 h-28 w-20 rounded-2xl overflow-hidden border-2 transition-all duration-200 ease-out relative z-0
        ${clickable ? "cursor-pointer" : "cursor-default pointer-events-none"}
        ${selected
          ? "-translate-y-5 scale-[1.08] border-white ring-2 ring-white/60 shadow-2xl shadow-white/20 z-20"
          : clickable
          ? "border-transparent hover:-translate-y-3 hover:scale-[1.08] hover:shadow-2xl hover:shadow-black/60 hover:z-10 hover:border-white/20"
          : "border-transparent"}
        ${dimmed ? "opacity-25 scale-95" : ""}
        ${isDragging ? "opacity-40 scale-95 rotate-3" : ""}
      `}
    >
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
    </button>
  );
}

// ─── MiniCard (unused externally but kept) ────────────────────────────────────

function MiniCard({ card }: { card: Stack5Card }) {
  return (
    <div className="h-5 w-3.5 rounded overflow-hidden">
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

// ─── WildPicker ───────────────────────────────────────────────────────────────

function WildPicker({ onPick, onCancel }: { onPick: (c: CardColor, s: CardShape) => void; onCancel: () => void }) {
  const [color, setColor] = useState<CardColor>("green");
  const [shape, setShape] = useState<CardShape>("star");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-gray-900/95 p-5 shadow-2xl card-in">
        <h2 className="mb-5 text-center text-xl font-black tracking-tight">Wild Card Identity</h2>
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Color</p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`rounded-xl py-3 text-xs font-black transition-all duration-150 ${COLOR_BG[c]} ${COLOR_TEXT[c]} ${color === c ? "ring-2 ring-white scale-105 shadow-lg" : "opacity-50 hover:opacity-80 hover:scale-[1.03]"}`}>
                {COLOR_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Shape</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SHAPES.map((s) => (
              <button key={s} onClick={() => setShape(s)}
                className={`rounded-xl py-3 text-xl bg-gray-800 transition-all duration-150 ${shape === s ? "ring-2 ring-indigo-500 scale-105 bg-gray-700" : "opacity-50 hover:opacity-80 hover:scale-[1.03]"}`}>
                {SHAPE_EMOJI[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-5 flex justify-center">
          <div className="h-28 w-20 rounded-2xl overflow-hidden border-2 border-indigo-400/60 shadow-xl shadow-indigo-900/50 card-in">
            <img src={cardImageSrc({ id: "", type: "standard", color, shape })} alt={`${color} ${shape}`}
              className="h-full w-full object-cover" draggable={false} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-gray-800 py-3 font-bold hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-150">Cancel</button>
          <button onClick={() => onPick(color, shape)} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-900/50 transition-all duration-150">Play Wild</button>
        </div>
      </div>
    </div>
  );
}

// ─── TargetOverlay ────────────────────────────────────────────────────────────

function TargetOverlay({ label, players, onSelect, onCancel }: {
  label: string; players: Stack5Player[]; onSelect: (id: string) => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-gray-900/95 p-5 shadow-2xl card-in">
        <h2 className="mb-5 text-center text-lg font-black tracking-tight">{label}</h2>
        <div className="flex flex-col gap-2 mb-4">
          {players.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className="flex items-center gap-3 rounded-2xl bg-gray-800 px-4 py-3.5 hover:bg-gray-700 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-150">
              <div className="h-5 w-5 rounded-full border-2 flex items-center justify-center text-[9px] font-black"
                style={{ backgroundColor: p.color + "30", borderColor: p.color }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="text-xs text-gray-500">🤚 {p.hand.length}</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="w-full rounded-xl bg-gray-800 py-3 font-bold hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-150">Cancel</button>
      </div>
    </div>
  );
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────

function ActionBtn({ children, onClick, disabled, variant = "default" }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  variant?: "default" | "green" | "red" | "ghost";
}) {
  const styles = {
    default: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/40 hover:shadow-lg hover:shadow-indigo-900/60",
    green:   "bg-green-700 hover:bg-green-600 text-white shadow-md shadow-green-900/40 hover:shadow-lg hover:shadow-green-900/60",
    red:     "bg-red-800 hover:bg-red-700 text-white shadow-md shadow-red-900/40 hover:shadow-lg hover:shadow-red-900/60",
    ghost:   "bg-white/6 hover:bg-white/10 text-gray-300 border border-white/8",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-150 hover:-translate-y-0.5 active:scale-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:shadow-none ${styles}`}>
      {children}
    </button>
  );
}
