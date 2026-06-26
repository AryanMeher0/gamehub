"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { playSound } from "@/lib/sounds";
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
  const prevTurnRef = useRef<string>("");

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
    playSound("error");
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
      const prev = stateRef.current;
      stateRef.current = s;
      setState(s);
      setMode({ type: "idle" });

      // Detect turn change
      const newTurnId = s.turnOrder[s.currentTurnIndex];
      if (prev && newTurnId !== prevTurnRef.current) {
        playSound("turn");
        prevTurnRef.current = newTurnId;
      }
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
      setMode({ type: "trade_mode", selectedIds: already ? mode.selectedIds.filter((id) => id !== cardId) : [...mode.selectedIds, cardId] });
      return;
    }
    const card = me.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (mode.type === "card_selected" && mode.cardId === cardId) { setMode({ type: "idle" }); return; }
    if (card.type === "reverse") { emit("stack5:playCard", { cardId }); playSound("play"); setMode({ type: "idle" }); return; }
    if (card.type === "skip" || card.type === "reset_hand") { setMode({ type: "special_selected", cardId, cardType: card.type }); return; }
    setMode({ type: "card_selected", cardId });
  }

  function handleSlotClick(slotIndex: number) {
    if (!canAct || !me || mode.type !== "card_selected") return;
    const card = me.hand.find((c) => c.id === mode.cardId);
    if (!card) return;
    if (!isValidForStack(me.stacks[slotIndex], card)) { showError("Card doesn't match this stack's pattern"); return; }
    if (card.type === "wild") { playSound("wild"); setMode({ type: "wild_pending", cardId: mode.cardId, slotIndex }); }
    else { emit("stack5:playCard", { cardId: mode.cardId, slotIndex }); playSound("play"); setMode({ type: "idle" }); }
  }

  function handleSlotDrop(cardId: string, slotIndex: number) {
    if (!canAct || !me) return;
    const card = me.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (!isValidForStack(me.stacks[slotIndex], card)) { showError("Card doesn't match this stack's pattern"); return; }
    if (card.type === "reverse") { emit("stack5:playCard", { cardId }); playSound("play"); return; }
    if (card.type === "skip" || card.type === "reset_hand") { setMode({ type: "special_selected", cardId, cardType: card.type }); return; }
    if (card.type === "wild") { playSound("wild"); setMode({ type: "wild_pending", cardId, slotIndex }); }
    else { emit("stack5:playCard", { cardId, slotIndex }); playSound("play"); setMode({ type: "idle" }); }
  }

  function handleWildChoice(color: CardColor, shape: CardShape) {
    if (mode.type !== "wild_pending") return;
    emit("stack5:playCard", { cardId: mode.cardId, slotIndex: mode.slotIndex, chosenColor: color, chosenShape: shape });
    playSound("play");
    setMode({ type: "idle" });
  }

  function handleSpecialTarget(targetPlayerId: string) {
    if (mode.type !== "special_selected") return;
    emit("stack5:playCard", { cardId: mode.cardId, targetPlayerId });
    playSound("play");
    setMode({ type: "idle" });
  }

  function handleSecure(slotIndex: number) {
    if (canAct) { emit("stack5:secure", { slotIndex }); playSound("secure"); }
  }
  function handleDraw() {
    if (canAct) { emit("stack5:drawCard"); playSound("draw"); setMode({ type: "idle" }); }
  }
  function handleEndTurn() {
    if (isMyTurn) { emit("stack5:endTurn"); setMode({ type: "idle" }); }
  }

  function handleStealTarget(targetPlayerId: string, targetSlotIndex: number) {
    if (mode.type !== "steal_mode") return;
    emit("stack5:steal", { targetPlayerId, targetSlotIndex });
    playSound("steal");
    setMode({ type: "idle" });
  }

  function handleTradeConfirm() {
    if (mode.type !== "trade_mode") return;
    emit("stack5:tradeForMaster", { cardIds: mode.selectedIds });
    playSound("secure");
    setMode({ type: "idle" });
  }

  function handleConfigure() {
    emit("stack5:configure", { targetScore, startingMasterCards: startingMC, turnTimerSeconds: turnTimer, numDecks });
  }

  // ─── Setup / Waiting screen ────────────────────────────────────────────────

  if (!state) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-white"
        style={{ background: "radial-gradient(ellipse at 50% 60%, #1a4d30 0%, #0a2518 60%, #060f0a 100%)" }}>
        <div className="text-center fade-up">
          <span className="text-5xl">🧱</span>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-green-300">Stack5</h1>
          <p className="mt-1 text-xs text-green-900 font-mono tracking-widest">{roomCode}</p>
        </div>

        <div className="w-full max-w-sm fade-up" style={{ animationDelay: "60ms" }}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-green-700">Your Name</p>
          <input type="text" maxLength={20} value={myName} onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter your name…"
            className="w-full rounded-2xl bg-black/30 border border-green-900 px-4 py-3 text-sm font-bold placeholder-green-900 text-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all" />
        </div>

        {isHost ? (
          <div className="w-full max-w-sm rounded-3xl border border-green-900/60 bg-black/40 p-5 shadow-2xl backdrop-blur fade-up" style={{ animationDelay: "120ms" }}>
            <h2 className="mb-5 text-center text-xl font-black tracking-tight text-green-300">Create Game</h2>
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-green-800">Points to Win</p>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setTargetScore(n)}
                    className={`rounded-xl py-3 font-black transition-all duration-150 ${targetScore === n ? "bg-green-600 text-white scale-105 shadow-lg shadow-green-900/60" : "bg-black/30 border border-green-900 text-green-600 hover:bg-green-900/30 hover:-translate-y-0.5"}`}>
                    {n} pts
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-green-800">Starting Master Cards</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setStartingMC(n)}
                    className={`rounded-xl py-3 font-black transition-all duration-150 ${startingMC === n ? "bg-amber-500 text-gray-950 scale-105 shadow-lg" : "bg-black/30 border border-green-900 text-green-600 hover:bg-green-900/30 hover:-translate-y-0.5"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-green-800">Turn Timer</p>
              <div className="grid grid-cols-4 gap-2">
                {[0, 15, 30, 60].map((n) => (
                  <button key={n} onClick={() => setTurnTimer(n)}
                    className={`rounded-xl py-3 text-sm font-black transition-all duration-150 ${turnTimer === n ? "bg-cyan-600 text-white scale-105 shadow-lg" : "bg-black/30 border border-green-900 text-green-600 hover:bg-green-900/30 hover:-translate-y-0.5"}`}>
                    {n === 0 ? "Off" : `${n}s`}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-green-800">Number of Decks</p>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((n) => (
                  <button key={n} onClick={() => setNumDecks(n)}
                    className={`rounded-xl py-3 font-black transition-all duration-150 ${numDecks === n ? "bg-purple-600 text-white scale-105 shadow-lg" : "bg-black/30 border border-green-900 text-green-600 hover:bg-green-900/30 hover:-translate-y-0.5"}`}>
                    {n} Deck{n > 1 ? "s" : ""} ({n * 100} cards)
                  </button>
                ))}
              </div>
            </div>
            {lobbyPlayers.length > 0 && (
              <div className="mb-4 rounded-xl bg-black/20 border border-green-900/40 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-green-800 mb-2">In Lobby</p>
                <div className="flex flex-wrap gap-1.5">
                  {lobbyPlayers.map((p) => (
                    <span key={p.id} className="rounded-full bg-green-900/40 border border-green-800/50 px-2.5 py-0.5 text-xs font-bold text-green-400">{p.name}</span>
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleConfigure}
              className="w-full rounded-xl bg-green-600 py-4 text-lg font-black hover:bg-green-500 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-150 text-white shadow-lg shadow-green-900/60">
              Start Game →
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-3xl border border-green-900/40 bg-black/40 p-6 text-center shadow-2xl backdrop-blur fade-up" style={{ animationDelay: "120ms" }}>
            <div className="mb-3 text-3xl animate-pulse">⏳</div>
            <p className="font-black text-lg mb-1 text-green-300">Waiting for host to start…</p>
            <p className="text-xs text-green-800 mb-4">Your name is set — the host will start the game.</p>
            {lobbyPlayers.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {lobbyPlayers.map((p) => (
                  <span key={p.id} className="rounded-full bg-green-900/40 border border-green-800/50 px-3 py-1 text-xs font-bold text-green-400">{p.name}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
          className="text-sm text-green-900 hover:text-green-600 transition-colors">Leave room</button>
      </main>
    );
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────

  if (state.gameOver) {
    const winner = state.winnerId ? state.players[state.winnerId] : null;
    const sorted = state.turnOrder.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.points - a.points);
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-white"
        style={{ background: "radial-gradient(ellipse at 50% 60%, #1a4d30 0%, #0a2518 60%, #060f0a 100%)" }}>
        <span className="text-7xl fade-up">🏆</span>
        <div className="text-center fade-up" style={{ animationDelay: "80ms" }}>
          <h1 className="text-4xl font-black tracking-tight text-green-300">{winner?.name ?? "Someone"} wins!</h1>
          <p className="mt-1 text-green-700">{winner?.points} point{winner?.points !== 1 ? "s" : ""} scored</p>
        </div>
        <div className="w-full max-w-xs rounded-2xl border border-green-900/50 bg-black/40 p-4 shadow-2xl fade-up" style={{ animationDelay: "160ms" }}>
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-green-900/30 last:border-0">
              <span className="w-5 text-center font-black text-green-900">{i + 1}</span>
              <div className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="flex-1 font-bold text-green-200">{p.name}</span>
              <span className="font-black text-amber-400">{p.points} pts</span>
            </div>
          ))}
        </div>
        <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
          className="rounded-2xl bg-green-600 px-8 py-4 text-lg font-black hover:bg-green-500 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-150 fade-up text-white shadow-lg shadow-green-900/60" style={{ animationDelay: "240ms" }}>
          Back to Lobby
        </button>
      </main>
    );
  }

  // ─── Active game ───────────────────────────────────────────────────────────

  const currentTurnPlayer = state.players[state.turnOrder[state.currentTurnIndex]];

  return (
    <main className="flex h-screen flex-col text-white overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #1e5c38 0%, #0d3320 55%, #061309 100%)" }}>

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between px-4 py-2"
        style={{ background: "rgba(0,0,0,0.55)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-2.5">
          <span className="font-black text-base text-green-300 tracking-tight">Stack5</span>
          <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-xs text-green-800">{roomCode}</span>
        </div>

        {/* Turn banner — centre */}
        <div className="flex-1 flex justify-center mx-3">
          {isMyTurn ? (
            <span className="turn-glow rounded-full border border-green-500/50 bg-green-950/60 px-4 py-1 text-xs font-black text-green-300 tracking-wide">
              YOUR TURN · {state.actionsRemaining} action{state.actionsRemaining !== 1 ? "s" : ""} left
            </span>
          ) : (
            <span className="text-xs text-green-800 italic">
              {currentTurnPlayer?.name}&apos;s turn
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowLog((v) => !v)}
            className={`text-xs px-2 py-1 rounded-lg transition-all duration-150 ${showLog ? "bg-green-800 text-green-200" : "text-green-800 hover:text-green-400"}`}>
            📋
          </button>
          {socketId === state.hostId && (
            <>
              <button onClick={() => { emit("stack5:operator:shuffleDeck"); playSound("shuffle"); }}
                className="text-xs px-2 py-1 rounded-lg bg-black/30 border border-green-900/40 text-green-700 hover:text-green-400 hover:border-green-700 transition-all duration-150">
                Shuffle
              </button>
              <button onClick={() => emit("stack5:operator:transferDiscard")}
                className="text-xs px-2 py-1 rounded-lg bg-black/30 border border-green-900/40 text-green-700 hover:text-green-400 hover:border-green-700 transition-all duration-150">
                Transfer
              </button>
              <button onClick={() => router.push(`/game/stack5/${roomCode}/operator`)}
                className="text-xs text-green-800 hover:text-green-400 transition-colors">⚙️</button>
            </>
          )}
          <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
            className="text-xs text-green-900 hover:text-green-600 transition-colors">Leave</button>
        </div>
      </header>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed top-12 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-700/60 bg-red-950/95 px-5 py-2.5 text-sm font-bold text-red-200 shadow-2xl backdrop-blur-md card-in">
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
          <div className="pointer-events-auto mt-2 flex items-center gap-3 rounded-2xl border border-red-800/60 bg-red-950/95 px-5 py-2.5 shadow-2xl backdrop-blur-md card-in">
            <span className="text-sm font-black text-red-300">Select an opponent&apos;s stack — costs 1 Master Card</span>
            <button onClick={() => setMode({ type: "idle" })} className="text-xs text-red-700 hover:text-red-400 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Main flex area: log + game ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Log sidebar */}
        {showLog && (
          <div className="w-48 shrink-0 flex flex-col overflow-hidden" style={{ background: "rgba(0,0,0,0.50)", borderRight: "1px solid rgba(255,255,255,0.03)" }}>
            <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <p className="text-[9px] font-black uppercase tracking-widest text-green-900">Game Log</p>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col-reverse px-2 py-1 gap-0.5">
              {[...state.log].reverse().map((entry, i) => (
                <p key={i} className={`text-[9px] py-0.5 leading-relaxed ${
                  entry.startsWith("🏅") || entry.startsWith("⭐") ? "text-amber-500" :
                  entry.startsWith("🗡️") ? "text-red-500" :
                  entry.startsWith("♻️") ? "text-cyan-500" :
                  entry.startsWith("⏰") ? "text-orange-500" :
                  entry.startsWith("🏆") ? "text-yellow-300 font-black" :
                  "text-green-900"
                }`}>{entry}</p>
              ))}
            </div>
          </div>
        )}

        {/* Game table */}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">

          {/* ── Opponents ── */}
          {opponents.length > 0 && (
            <div className={`grid gap-2 ${
              opponents.length === 1 ? "grid-cols-1 max-w-lg mx-auto w-full" :
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
              <div className="flex items-center gap-1.5 text-[10px] text-green-900">
                <span>{state.direction === 1 ? "↻" : "↺"}</span>
                <span>First to {state.targetScore} pts</span>
              </div>
            </div>
            <DiscardPile topCard={topDiscard} count={state.discardPile.length} />
          </div>

          {/* ── My Board ── */}
          {me && (
            <div className="rounded-2xl p-3 flex flex-col gap-2.5"
              style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.05)" }}>

              {/* Stats row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Player avatar */}
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full border-2 border-green-700 flex items-center justify-center text-xs font-black text-green-300"
                      style={{ background: "rgba(0,0,0,0.4)" }}>
                      {me.name?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                    <span className="text-xs font-bold text-green-300 truncate max-w-[80px]">{me.name}</span>
                  </div>

                  <div className="h-6 w-px" style={{ background: "rgba(255,255,255,0.07)" }} />

                  <div className="text-center">
                    <p className="text-xl font-black text-amber-400 tracking-tight leading-none">
                      {me.points}<span className="text-xs font-semibold text-green-900">/{state.targetScore}</span>
                    </p>
                    <p className="text-[8px] text-green-900 uppercase tracking-widest">Points</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-indigo-300 tracking-tight leading-none">{me.masterCards}</p>
                    <p className="text-[8px] text-green-900 uppercase tracking-widest">Master Cards</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black tracking-tight leading-none">{me.hand.length}</p>
                    <p className="text-[8px] text-green-900 uppercase tracking-widest">In Hand</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isMyTurn && <ActionsBar remaining={state.actionsRemaining} />}
                  {(mode.type === "card_selected" || mode.type === "trade_mode") && (
                    <button onClick={() => setMode({ type: "idle" })} className="text-xs text-green-800 hover:text-green-500 transition-colors px-2 py-1">Cancel</button>
                  )}
                </div>
              </div>

              {/* My stacks */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {me.stacks.map((stack) => {
                  const sel = mode.type === "card_selected" ? me.hand.find((c) => c.id === mode.cardId) : null;
                  const dragCard = draggingCardId ? me.hand.find((c) => c.id === draggingCardId) : null;
                  const canDrop = (!!sel && isValidForStack(stack, sel)) || (!!dragCard && isValidForStack(stack, dragCard));
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
              <HandArea
                hand={me.hand}
                mode={mode}
                canAct={canAct}
                draggingCardId={draggingCardId}
                onCardClick={handleCardClick}
                onDragStart={(id) => { if (!canAct) return; setDraggingCardId(id); setMode({ type: "idle" }); }}
                onDragEnd={() => setDraggingCardId(null)}
              />

              {/* Action buttons */}
              {isMyTurn && (
                <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <ActionBtn onClick={handleDraw} disabled={!canAct} variant="default">Draw Card</ActionBtn>
                  {mode.type === "trade_mode" ? (
                    <>
                      <ActionBtn onClick={handleTradeConfirm} disabled={!isValidTradeSet(me.hand, mode.selectedIds)} variant="green">
                        Confirm Trade ({mode.selectedIds.length}/4)
                      </ActionBtn>
                      <ActionBtn onClick={() => setMode({ type: "idle" })} variant="ghost">Cancel</ActionBtn>
                    </>
                  ) : (
                    <ActionBtn onClick={() => canAct && setMode({ type: "trade_mode", selectedIds: [] })} disabled={!canAct} variant="default">
                      Trade 4 → Master Card
                    </ActionBtn>
                  )}
                  {me.masterCards > 0 && mode.type !== "steal_mode" && (
                    <ActionBtn onClick={() => canAct && setMode({ type: "steal_mode" })} disabled={!canAct} variant="red">
                      🗡️ Steal (costs 1 MC)
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

// ─── HandArea ─────────────────────────────────────────────────────────────────

function HandArea({ hand, mode, canAct, draggingCardId, onCardClick, onDragStart, onDragEnd }: {
  hand: Stack5Card[];
  mode: UIMode;
  canAct: boolean;
  draggingCardId: string | null;
  onCardClick: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const n = hand.length;
  const fanAngle = n <= 1 ? 0 : Math.min(5, 28 / n);
  const fanRise = n <= 1 ? 0 : 3;

  if (mode.type === "trade_mode") {
    const label = <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-widest text-green-800">
      Hand · {n} {n === 1 ? "card" : "cards"} <span className="text-indigo-400 ml-1">— pick 4 unique colors or shapes</span>
    </p>;
    return (
      <div>
        {label}
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ minHeight: "8rem" }}>
          {hand.map((card) => {
            const isSelected = mode.selectedIds.includes(card.id);
            const isDimmed = card.type !== "standard";
            return (
              <CardView key={card.id} card={card} selected={isSelected} dimmed={isDimmed}
                isDragging={false} clickable={canAct} onClick={() => onCardClick(card.id)} />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-widest text-green-800">
        Hand · {n} {n === 1 ? "card" : "cards"}
      </p>
      {n === 0 ? (
        <div className="flex h-28 items-center justify-center text-xs text-green-900 italic">Empty hand</div>
      ) : (
        <div className="relative flex items-end justify-center overflow-visible" style={{ height: "8.5rem", paddingBottom: "0.25rem" }}>
          {hand.map((card, idx) => {
            const angle = (idx - (n - 1) / 2) * fanAngle;
            const rise = Math.abs(idx - (n - 1) / 2) * fanRise;
            const isSelected = mode.type === "card_selected" && mode.cardId === card.id;
            const isDragging = draggingCardId === card.id;
            const offsetX = (idx - (n - 1) / 2) * (n > 8 ? 22 : 28);
            return (
              <FanCard
                key={card.id}
                card={card}
                angle={angle}
                rise={rise}
                offsetX={offsetX}
                selected={isSelected}
                isDragging={isDragging}
                clickable={canAct}
                onClick={() => onCardClick(card.id)}
                onDragStart={() => onDragStart(card.id)}
                onDragEnd={onDragEnd}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── FanCard ──────────────────────────────────────────────────────────────────

function FanCard({ card, angle, rise, offsetX, selected, isDragging, clickable, onClick, onDragStart, onDragEnd }: {
  card: Stack5Card; angle: number; rise: number; offsetX: number;
  selected?: boolean; isDragging?: boolean; clickable?: boolean;
  onClick?: () => void; onDragStart?: () => void; onDragEnd?: () => void;
}) {
  const baseTransform = `translateX(${offsetX}px) rotate(${angle}deg) translateY(${rise}px)`;
  const selectedTransform = `translateX(${offsetX}px) rotate(0deg) translateY(-28px)`;

  return (
    <button
      draggable={clickable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.transform = `translateX(${offsetX}px) rotate(0deg) translateY(-18px)`;
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.transform = selected ? selectedTransform : baseTransform;
      }}
      className={`absolute shrink-0 h-28 w-20 rounded-2xl overflow-hidden border-2 transition-shadow duration-200
        ${clickable ? "cursor-pointer" : "cursor-default pointer-events-none"}
        ${selected ? "border-white shadow-2xl shadow-white/30 z-30" : "border-black/30 hover:border-white/40 hover:shadow-xl hover:z-20 z-10"}
        ${isDragging ? "opacity-40" : "opacity-100"}
      `}
      style={{
        transform: selected ? selectedTransform : baseTransform,
        transformOrigin: "bottom center",
        transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.15s ease-out, border-color 0.15s",
        bottom: 0,
        left: "50%",
        marginLeft: "-40px",
        position: "absolute",
      }}
    >
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
      {selected && (
        <div className="absolute inset-0 rounded-2xl ring-2 ring-white/60" />
      )}
    </button>
  );
}

// ─── ActionsBar ───────────────────────────────────────────────────────────────

function ActionsBar({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-green-900 mr-0.5">Actions</span>
      {[0, 1].map((i) => (
        <div key={i} className={`h-3 w-3 rounded-full transition-all duration-300 ${i < remaining ? "bg-green-400 shadow-md shadow-green-500/60 scale-110" : "bg-black/30 border border-green-900"}`} />
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
  const color = timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f59e0b" : "#4ade80";
  return (
    <div className="relative flex items-center justify-center w-14 h-14">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
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
        {count > 3 && <div className="absolute rounded-xl" style={{ top: 6, left: 6, right: -6, bottom: -6, background: "#0d2d5c", border: "1px solid rgba(99,132,200,0.3)" }} />}
        {count > 1 && <div className="absolute rounded-xl" style={{ top: 3, left: 3, right: -3, bottom: -3, background: "#163a7a", border: "1px solid rgba(99,132,200,0.4)" }} />}
        <div className="relative h-full w-full rounded-xl flex items-center justify-center shadow-xl"
          style={{ background: "linear-gradient(135deg, #1e4db7 0%, #1a3d8f 100%)", border: "2px solid rgba(99,132,200,0.6)", boxShadow: "0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
          <div className="text-center">
            <p className="text-lg font-black text-blue-200 leading-none">{count}</p>
          </div>
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-green-900">Deck</span>
    </div>
  );
}

// ─── DiscardPile ──────────────────────────────────────────────────────────────

function DiscardPile({ topCard, count }: { topCard: Stack5Card | null; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-20 w-14">
        {count > 1 && <div className="absolute rounded-xl" style={{ top: 3, left: 3, right: -3, bottom: -3, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }} />}
        <div className="relative h-full w-full rounded-xl overflow-hidden shadow-lg"
          style={{ border: "2px solid rgba(255,255,255,0.12)", background: "#111" }}>
          {topCard
            ? <img src={cardImageSrc(topCard)} alt={cardAlt(topCard)} key={topCard.id}
                className="h-full w-full object-cover card-in" draggable={false} />
            : <div className="flex h-full items-center justify-center text-green-900 text-xl">—</div>}
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-green-900">Discard {count}</span>
    </div>
  );
}

// ─── StackCard ────────────────────────────────────────────────────────────────

function StackCard({ card, mini }: { card: Stack5Card; mini?: boolean }) {
  return (
    <div className={`relative ${mini ? "h-9 w-6" : "h-14 w-10"} rounded-md overflow-hidden shrink-0 card-in`}
      style={{ border: "1px solid rgba(0,0,0,0.3)", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
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
      className={`relative flex flex-col rounded-xl p-2.5 transition-all duration-200 ${
        stack.completed ? "complete-pulse" : canDrop ? "drop-glow cursor-pointer" : isSelectMode ? "cursor-pointer opacity-50" : ""
      }`}
      style={{
        minHeight: "9rem",
        background: stack.completed
          ? "rgba(120,60,0,0.30)"
          : canDrop
          ? "rgba(20,80,30,0.50)"
          : "rgba(0,0,0,0.30)",
        border: stack.completed
          ? "1px solid rgba(251,191,36,0.50)"
          : canDrop
          ? "1px solid rgba(74,222,128,0.60)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[8px] font-bold uppercase tracking-widest text-green-900">Slot {stack.slotIndex + 1}</span>
        <div className="flex gap-1">
          {dots.map((filled, i) => (
            <div key={i} className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${filled ? "bg-green-400 scale-110" : "bg-black/40 border border-green-900/30"}`} />
          ))}
        </div>
      </div>

      {stack.cards.length === 0 ? (
        <div className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-3 transition-all duration-200 ${canDrop ? "border border-dashed border-green-500/50" : "border border-dashed border-white/5"}`}>
          {canDrop
            ? <><span className="text-lg">⬇</span><span className="text-[9px] font-bold text-green-400">Drop here</span></>
            : <span className="text-[9px] text-green-900/60">Empty</span>}
        </div>
      ) : (
        <div className="flex flex-row flex-wrap gap-1 justify-center py-1 flex-1">
          {stack.cards.map((card, i) => <StackCard key={`${card.id}-${i}`} card={card} />)}
        </div>
      )}

      {stack.matchType && (
        <p className="mt-1.5 text-center text-[8px] font-bold uppercase tracking-wider text-green-800">
          {stack.matchType} · {stack.matchValue}
        </p>
      )}

      {stack.completed && (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black text-amber-300 tracking-wide"
            style={{ background: "rgba(120,60,0,0.4)", border: "1px solid rgba(251,191,36,0.4)" }}>★ READY</span>
          {canSecure && (
            <button onClick={(e) => { e.stopPropagation(); onSecure(); }}
              className="rounded-lg px-3 py-1 text-[9px] font-black text-amber-900 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all duration-150"
              style={{ background: "#f59e0b" }}>
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
    <div className="rounded-xl p-3 transition-all duration-300"
      style={{
        background: isCurrentTurn ? "rgba(20,60,100,0.40)" : "rgba(0,0,0,0.35)",
        border: isCurrentTurn ? "1px solid rgba(99,132,200,0.40)" : "1px solid rgba(255,255,255,0.05)",
        boxShadow: isCurrentTurn ? "0 0 16px rgba(99,132,200,0.15)" : "none",
      }}>

      {/* Avatar + name + turn */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="relative shrink-0">
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black"
            style={{ backgroundColor: player.color + "28", border: `2px solid ${player.color}`, color: player.color }}>
            {player.name.charAt(0).toUpperCase()}
          </div>
          {isCurrentTurn && <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-black" />}
        </div>
        <span className="flex-1 truncate text-sm font-black text-white/80">{player.name}</span>
        {isCurrentTurn && (
          <span className="rounded-full px-2 py-0.5 text-[8px] font-black tracking-wide text-blue-300"
            style={{ background: "rgba(30,60,140,0.60)", border: "1px solid rgba(99,132,200,0.40)" }}>TURN</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1.5 mb-2.5">
        {[
          { val: player.points, label: "Points", color: "text-amber-400" },
          { val: player.masterCards, label: "MC", color: "text-indigo-300" },
          { val: player.hand.length, label: "In Hand", color: "text-white" },
        ].map(({ val, label, color }) => (
          <div key={label} className="rounded-lg py-1.5 text-center" style={{ background: "rgba(0,0,0,0.25)" }}>
            <p className={`text-sm font-black ${color}`}>{val}</p>
            <p className="text-[7px] text-green-900">{label}</p>
          </div>
        ))}
      </div>

      {/* Stacks */}
      <div className="flex flex-col gap-1">
        {player.stacks.map((stack) => {
          const canSteal = stealMode && stack.cards.length > 0 && myMasterCards > 0;
          const dots = Array.from({ length: 5 }, (_, i) => i < stack.cards.length);
          return (
            <div key={stack.slotIndex}
              onClick={canSteal ? () => onSteal(stack.slotIndex) : undefined}
              className={`flex flex-row items-center gap-2 rounded-lg px-2 py-1.5 transition-all duration-200 ${canSteal ? "cursor-pointer hover:scale-[1.01] active:scale-[0.99]" : ""}`}
              style={{
                background: canSteal ? "rgba(120,0,0,0.30)" : stack.completed ? "rgba(120,60,0,0.20)" : "rgba(0,0,0,0.20)",
                border: canSteal ? "1px solid rgba(220,0,0,0.40)" : stack.completed ? "1px solid rgba(251,191,36,0.30)" : "1px solid rgba(255,255,255,0.04)",
              }}>
              <span className="text-[8px] font-bold text-green-900 w-3 shrink-0">{stack.slotIndex + 1}</span>
              <div className="flex flex-row gap-0.5 flex-1 min-w-0">
                {stack.cards.length === 0
                  ? <span className="text-[8px] text-green-900/50 italic">empty</span>
                  : stack.cards.map((card, i) => <StackCard key={`${card.id}-${i}`} card={card} mini />)}
              </div>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <div className="flex gap-0.5">
                  {dots.map((filled, i) => (
                    <div key={i} className={`h-1 w-1 rounded-full ${filled ? "bg-green-400" : "bg-black/40 border border-green-900/30"}`} />
                  ))}
                </div>
                {stack.completed && <span className="text-[8px] text-amber-400 font-black">★</span>}
                {stack.matchType && <span className="text-[6px] text-green-900 capitalize">{stack.matchValue}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CardView (used in trade mode and WildPicker preview) ─────────────────────

function CardView({ card, selected, dimmed, isDragging, onClick, clickable }: {
  card: Stack5Card; selected?: boolean; dimmed?: boolean; isDragging?: boolean;
  onClick?: () => void; clickable?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-28 w-20 rounded-2xl overflow-hidden border-2 transition-all duration-200 ease-out
        ${clickable ? "cursor-pointer hover:-translate-y-3 hover:scale-[1.08] hover:shadow-2xl hover:shadow-black/70 hover:z-10" : "cursor-default pointer-events-none"}
        ${selected ? "-translate-y-5 scale-[1.08] border-white ring-2 ring-white/60 shadow-2xl shadow-white/20 z-20" : "border-transparent"}
        ${dimmed ? "opacity-25 scale-95" : ""}
        ${isDragging ? "opacity-40 scale-95" : ""}
      `}
    >
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
    </button>
  );
}

// ─── WildPicker ───────────────────────────────────────────────────────────────

function WildPicker({ onPick, onCancel }: { onPick: (c: CardColor, s: CardShape) => void; onCancel: () => void }) {
  const [color, setColor] = useState<CardColor>("green");
  const [shape, setShape] = useState<CardShape>("star");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl p-5 shadow-2xl card-in"
        style={{ background: "rgba(5,20,10,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 className="mb-5 text-center text-xl font-black tracking-tight text-green-200">Wild Card Identity</h2>
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-green-800">Color</p>
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
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-green-800">Shape</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SHAPES.map((s) => (
              <button key={s} onClick={() => setShape(s)}
                className={`rounded-xl py-3 text-xl transition-all duration-150 ${shape === s ? "ring-2 ring-green-500 scale-105 bg-green-900/50" : "bg-black/30 border border-green-900 opacity-60 hover:opacity-90 hover:scale-[1.03]"}`}>
                {SHAPE_EMOJI[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-5 flex justify-center">
          <div className="h-28 w-20 rounded-2xl overflow-hidden border-2 border-green-600/50 shadow-xl card-in">
            <img src={cardImageSrc({ id: "", type: "standard", color, shape })} alt={`${color} ${shape}`}
              className="h-full w-full object-cover" draggable={false} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl py-3 font-bold hover:-translate-y-0.5 transition-all duration-150 text-green-300"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>Cancel</button>
          <button onClick={() => onPick(color, shape)} className="flex-1 rounded-xl py-3 font-bold text-white hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all duration-150"
            style={{ background: "#16a34a" }}>Play Wild</button>
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
      <div className="w-full max-w-xs rounded-3xl p-5 shadow-2xl card-in"
        style={{ background: "rgba(5,20,10,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h2 className="mb-5 text-center text-lg font-black tracking-tight text-green-200">{label}</h2>
        <div className="flex flex-col gap-2 mb-4">
          {players.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-150"
              style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black"
                style={{ backgroundColor: p.color + "30", border: `2px solid ${p.color}`, color: p.color }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 font-bold text-white/80">{p.name}</span>
              <span className="text-xs text-green-800">🤚 {p.hand.length}</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="w-full rounded-xl py-3 font-bold hover:-translate-y-0.5 transition-all duration-150 text-green-400"
          style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.06)" }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────

function ActionBtn({ children, onClick, disabled, variant = "default" }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  variant?: "default" | "green" | "red" | "ghost";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: "#1e4db7", border: "1px solid rgba(99,132,200,0.4)", color: "white" },
    green:   { background: "#16a34a", border: "1px solid rgba(74,222,128,0.4)", color: "white" },
    red:     { background: "#7f1d1d", border: "1px solid rgba(220,0,0,0.4)", color: "#fca5a5" },
    ghost:   { background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={styles[variant]}
      className="rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg active:scale-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:brightness-100">
      {children}
    </button>
  );
}

// ─── Unused exports kept for type safety ─────────────────────────────────────

function MiniCard({ card }: { card: Stack5Card }) {
  return (
    <div className="h-5 w-3.5 rounded overflow-hidden">
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

void MiniCard; // referenced above in StackCard — prevent unused warning
void SHAPE_LABEL; // referenced in SHAPE_LABEL usage elsewhere
