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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-4 text-white">
        <div className="text-center">
          <span className="text-5xl">🧱</span>
          <h1 className="mt-1 text-3xl font-black text-indigo-400">Stack5</h1>
          <p className="text-xs text-gray-600 font-mono">{roomCode}</p>
        </div>

        {/* Name input — all players */}
        <div className="w-full max-w-sm">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-gray-500">Your Name</p>
          <input
            type="text" maxLength={20} value={myName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter your name…"
            className="w-full rounded-2xl bg-gray-800 border border-gray-700 px-4 py-3 text-sm font-bold placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {isHost ? (
          /* ── Host: config form ── */
          <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-900 p-5 shadow-2xl">
            <h2 className="mb-4 text-center text-lg font-black">Create Game</h2>

            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Points to Win</p>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setTargetScore(n)}
                    className={`rounded-2xl py-2.5 font-black transition-all ${targetScore === n ? "bg-indigo-600 text-white scale-105" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
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
                    className={`rounded-2xl py-2.5 font-black transition-all ${startingMC === n ? "bg-amber-500 text-gray-950 scale-105" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
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
                    className={`rounded-2xl py-2.5 text-sm font-black transition-all ${turnTimer === n ? "bg-cyan-600 text-white scale-105" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
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
                    className={`rounded-2xl py-2.5 font-black transition-all ${numDecks === n ? "bg-purple-600 text-white scale-105" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                    {n} Deck{n > 1 ? "s" : ""} ({n * 100} cards)
                  </button>
                ))}
              </div>
            </div>

            {lobbyPlayers.length > 0 && (
              <div className="mb-4 rounded-xl bg-gray-800/60 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">In Lobby</p>
                <div className="flex flex-wrap gap-1.5">
                  {lobbyPlayers.map((p) => (
                    <span key={p.id} className="rounded-full bg-gray-700 px-2 py-0.5 text-xs">{p.name}</span>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleConfigure}
              className="w-full rounded-2xl bg-indigo-600 py-3.5 text-lg font-black hover:bg-indigo-500 active:scale-95 transition-all">
              Start Game →
            </button>
          </div>
        ) : (
          /* ── Non-host: waiting ── */
          <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-900 p-6 text-center">
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
          className="text-sm text-gray-600 hover:text-gray-400">Leave room</button>
      </main>
    );
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────

  if (state.gameOver) {
    const winner = state.winnerId ? state.players[state.winnerId] : null;
    const sorted = state.turnOrder.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.points - a.points);
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 px-4 text-white">
        <span className="text-7xl">🏆</span>
        <div className="text-center">
          <h1 className="text-4xl font-black">{winner?.name ?? "Someone"} wins!</h1>
          <p className="mt-1 text-gray-400">{winner?.points} point(s) scored</p>
        </div>
        <div className="w-full max-w-xs rounded-2xl border border-gray-800 bg-gray-900 p-4">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-gray-800 last:border-0">
              <span className="w-5 text-center font-black text-gray-600">{i + 1}</span>
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="font-black text-amber-400">{p.points} pts</span>
            </div>
          ))}
        </div>
        <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
          className="rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-black hover:bg-indigo-500 active:scale-95 transition-all">
          Back to Lobby
        </button>
      </main>
    );
  }

  // ─── Active game ───────────────────────────────────────────────────────────

  const currentTurnPlayer = state.players[state.turnOrder[state.currentTurnIndex]];

  return (
    <main className="flex h-screen flex-col bg-gray-950 text-white overflow-hidden">

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-800/60 bg-gray-900/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-black text-indigo-400">Stack5</span>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-500">{roomCode}</span>
        </div>
        <div className="flex flex-col items-center">
          {isMyTurn ? (
            <span className="rounded-full bg-green-600/20 border border-green-500/40 px-3 py-0.5 text-xs font-black text-green-400">
              YOUR TURN · {state.actionsRemaining} left
            </span>
          ) : (
            <span className="text-xs text-gray-500">
              {currentTurnPlayer?.name}&apos;s turn
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLog((v) => !v)}
            className={`text-xs px-2 py-1 rounded-lg transition-all ${showLog ? "bg-indigo-700 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            📋 Log
          </button>
          {socketId === state.hostId && (
            <button onClick={() => router.push(`/game/stack5/${roomCode}/operator`)}
              className="text-xs text-indigo-400 hover:text-indigo-300">⚙️</button>
          )}
          <button onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
            className="text-xs text-gray-600 hover:text-gray-400">Leave</button>
        </div>
      </header>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed top-14 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-900/90 px-4 py-2 text-sm font-bold text-red-200 shadow-xl">
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
          <div className="pointer-events-auto mt-2 flex items-center gap-3 rounded-2xl border border-red-600/60 bg-red-950/90 px-5 py-2 shadow-2xl">
            <span className="text-sm font-black text-red-300">Click an opponent&apos;s stack to steal</span>
            <button onClick={() => setMode({ type: "idle" })} className="text-xs text-red-600 hover:text-red-400">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Main flex area: log + game ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Log sidebar */}
        {showLog && (
          <div className="w-52 shrink-0 border-r border-gray-800/60 bg-gray-900/60 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800/60">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Game Log</p>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col-reverse px-2 py-1 gap-0.5">
              {[...state.log].reverse().map((entry, i) => (
                <p key={i} className={`text-[10px] py-1 border-b border-gray-800/40 last:border-0 ${
                  entry.startsWith("🏅") || entry.startsWith("⭐") ? "text-amber-400" :
                  entry.startsWith("🗡️") ? "text-red-400" :
                  entry.startsWith("♻️") ? "text-cyan-400" :
                  entry.startsWith("⏰") ? "text-orange-400" :
                  entry.startsWith("🏆") ? "text-yellow-300 font-black" :
                  "text-gray-400"
                }`}>{entry}</p>
              ))}
            </div>
          </div>
        )}

        {/* Game area */}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">

          {/* ── Opponents ── */}
          {opponents.length > 0 && (
            <div className={`grid gap-2 ${
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
          <div className="flex items-center justify-center gap-6 py-1 shrink-0">
            <DeckPile count={state.drawDeck.length} />
            <div className="flex flex-col items-center gap-1">
              <TurnTimer timeLeft={timeLeft} total={state.turnTimerSeconds} />
              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                <span>{state.direction === 1 ? "↻" : "↺"}</span>
                <span>First to {state.targetScore} pts</span>
              </div>
            </div>
            <DiscardPile topCard={topDiscard} count={state.discardPile.length} />
          </div>

          {/* ── My Board ── */}
          {me && (
            <div className="rounded-3xl border border-gray-700/60 bg-gray-900/60 p-3 flex flex-col gap-2">

              {/* My stats */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-xl font-black text-amber-400">{me.points}<span className="text-sm text-gray-600">/{state.targetScore}</span></p>
                    <p className="text-[8px] text-gray-600">POINTS</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-indigo-300">{me.masterCards}</p>
                    <p className="text-[8px] text-gray-600">MC</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black">{me.hand.length}</p>
                    <p className="text-[8px] text-gray-600">CARDS</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isMyTurn && <ActionsBar remaining={state.actionsRemaining} />}
                  {(mode.type === "card_selected" || mode.type === "trade_mode") && (
                    <button onClick={() => setMode({ type: "idle" })} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                  )}
                </div>
              </div>

              {/* My stacks */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {me.stacks.map((stack) => {
                  const sel = mode.type === "card_selected" ? me.hand.find((c) => c.id === mode.cardId) : null;
                  const canDrop = !!sel && isValidForStack(stack, sel);
                  return (
                    <MyStackSlot
                      key={stack.slotIndex}
                      stack={stack}
                      canDrop={canDrop}
                      isSelectMode={mode.type === "card_selected"}
                      canSecure={canAct && stack.completed && me.masterCards > 0}
                      onClick={() => handleSlotClick(stack.slotIndex)}
                      onSecure={() => handleSecure(stack.slotIndex)}
                    />
                  );
                })}
              </div>

              {/* Hand */}
              <div>
                <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-gray-600">
                  Hand · {me.hand.length} cards
                  {mode.type === "trade_mode" && (
                    <span className="ml-2 text-indigo-400">— pick 4 unique colors or shapes</span>
                  )}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 min-h-[7rem]">
                  {me.hand.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-xs text-gray-700 italic">Empty hand</div>
                  ) : (
                    me.hand.map((card) => {
                      const isSelected = (mode.type === "card_selected" && mode.cardId === card.id) ||
                        (mode.type === "trade_mode" && mode.selectedIds.includes(card.id));
                      const isDimmed = mode.type === "trade_mode" && card.type !== "standard";
                      return (
                        <CardView key={card.id} card={card} selected={isSelected} dimmed={isDimmed}
                          onClick={() => handleCardClick(card.id)} clickable={canAct} />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {isMyTurn && (
                <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-2">
                  <ActionBtn onClick={handleDraw} disabled={!canAct}>Draw</ActionBtn>
                  {mode.type === "trade_mode" ? (
                    <>
                      <ActionBtn onClick={handleTradeConfirm}
                        disabled={!isValidTradeSet(me.hand, mode.selectedIds)} variant="green">
                        Trade ({mode.selectedIds.length}/4)
                      </ActionBtn>
                      <ActionBtn onClick={() => setMode({ type: "idle" })} variant="ghost">Cancel</ActionBtn>
                    </>
                  ) : (
                    <ActionBtn onClick={() => canAct && setMode({ type: "trade_mode", selectedIds: [] })} disabled={!canAct}>
                      Trade 4 → MC
                    </ActionBtn>
                  )}
                  {me.masterCards > 0 && mode.type !== "steal_mode" && (
                    <ActionBtn onClick={() => canAct && setMode({ type: "steal_mode" })} disabled={!canAct} variant="red">
                      🗡️ Steal
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
      {[0, 1].map((i) => (
        <div key={i} className={`h-2.5 w-2.5 rounded-full transition-all ${i < remaining ? "bg-green-400" : "bg-gray-700"}`} />
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
    <div className="relative flex items-center justify-center w-12 h-12">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#374151" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - fraction)} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-black" style={{ color }}>{timeLeft}</span>
    </div>
  );
}

// ─── DeckPile ─────────────────────────────────────────────────────────────────

function DeckPile({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-14">
        {count > 2 && <div className="absolute top-1.5 left-1.5 h-full w-full rounded-xl bg-indigo-950 border border-indigo-900/50" />}
        {count > 1 && <div className="absolute top-0.5 left-0.5 h-full w-full rounded-xl bg-indigo-900 border border-indigo-700/50" />}
        <div className="relative h-full w-full rounded-xl bg-indigo-800 border-2 border-indigo-600 flex items-center justify-center">
          <span className="text-xs font-black text-indigo-300">{count}</span>
        </div>
      </div>
      <span className="text-[9px] text-gray-600">DECK</span>
    </div>
  );
}

// ─── DiscardPile ──────────────────────────────────────────────────────────────

function DiscardPile({ topCard, count }: { topCard: Stack5Card | null; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-20 w-14 rounded-xl border-2 border-gray-700 bg-gray-800 overflow-hidden flex items-center justify-center">
        {topCard
          ? <img src={cardImageSrc(topCard)} alt={cardAlt(topCard)} className="h-full w-full object-cover" draggable={false} />
          : <span className="text-[10px] text-gray-600">—</span>}
      </div>
      <span className="text-[9px] text-gray-600">DISCARD {count}</span>
    </div>
  );
}

// ─── StackCard ────────────────────────────────────────────────────────────────

function StackCard({ card }: { card: Stack5Card }) {
  const overlay =
    card.type === "standard"
      ? SHAPE_EMOJI[card.shape!]
      : card.type === "wild" ? "✨"
      : card.type === "skip" ? "⊘"
      : card.type === "reverse" ? "↕"
      : "🗑";
  return (
    <div className="relative h-12 w-8 rounded-lg overflow-hidden shadow-md border border-black/20">
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-0.5">
        <span className="text-[9px] leading-none">{overlay}</span>
      </div>
    </div>
  );
}

// ─── MyStackSlot ──────────────────────────────────────────────────────────────

function MyStackSlot({ stack, canDrop, isSelectMode, canSecure, onClick, onSecure }: {
  stack: Stack5Stack; canDrop: boolean; isSelectMode: boolean;
  canSecure: boolean; onClick: () => void; onSecure: () => void;
}) {
  return (
    <div
      onClick={isSelectMode ? onClick : undefined}
      className={`relative flex flex-col rounded-2xl border p-2 transition-all duration-150 ${
        stack.completed
          ? "border-amber-500 bg-amber-950/30 shadow-lg shadow-amber-900/20"
          : canDrop
          ? "cursor-pointer border-green-500 bg-green-950/30 ring-2 ring-green-400/50 shadow-lg shadow-green-900/30"
          : isSelectMode
          ? "cursor-pointer border-gray-800 bg-gray-900/50 opacity-40"
          : "border-gray-800 bg-gray-900/40"
      }`}
      style={{ minHeight: "9rem" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] text-gray-600">Slot {stack.slotIndex + 1}</span>
        <span className="text-[9px] text-gray-600">{stack.cards.length}/5</span>
      </div>

      {stack.cards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          {canDrop
            ? <span className="text-[10px] font-bold text-green-400">+ Play here</span>
            : <span className="text-[10px] text-gray-700">Empty</span>}
        </div>
      ) : (
        /* Overlapping pile — proper card ratio, centered */
        <div className="relative flex-1 flex justify-center" style={{ minHeight: `${stack.cards.length * 16 + 40}px` }}>
          {stack.cards.map((card, i) => (
            <div key={i} className="absolute" style={{ top: `${i * 16}px`, zIndex: i }}>
              <StackCard card={card} />
            </div>
          ))}
        </div>
      )}

      {stack.matchType && (
        <p className="mt-1 text-center text-[8px] font-bold uppercase tracking-wide text-gray-600">
          {stack.matchType} · {stack.matchValue}
        </p>
      )}

      {stack.completed && (
        <div className="mt-1.5 flex flex-col items-center gap-1">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-black text-gray-950">READY</span>
          {canSecure && (
            <button onClick={(e) => { e.stopPropagation(); onSecure(); }}
              className="rounded-lg bg-amber-500 px-2 py-0.5 text-[8px] font-black text-gray-950 hover:bg-amber-400 active:scale-95 transition-all">
              Secure (1 MC)
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
    <div className={`rounded-2xl border p-3 transition-all ${
      isCurrentTurn ? "border-indigo-500/60 bg-indigo-950/20 shadow-md shadow-indigo-900/20" : "border-gray-800 bg-gray-900/50"
    }`}>
      {/* Name + turn badge */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: player.color }} />
        <span className="flex-1 truncate text-sm font-black">{player.name}</span>
        {isCurrentTurn && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[8px] font-black">TURN</span>}
      </div>

      {/* Stats — large and clear */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="rounded-xl bg-gray-800/60 py-1.5 text-center">
          <p className="text-base font-black text-amber-400">{player.points}</p>
          <p className="text-[8px] text-gray-500">PTS</p>
        </div>
        <div className="rounded-xl bg-gray-800/60 py-1.5 text-center">
          <p className="text-base font-black text-indigo-300">{player.masterCards}</p>
          <p className="text-[8px] text-gray-500">MC</p>
        </div>
        <div className="rounded-xl bg-gray-800/60 py-1.5 text-center">
          <p className="text-base font-black">{player.hand.length}</p>
          <p className="text-[8px] text-gray-500">CARDS</p>
        </div>
      </div>

      {/* Stacks — overlapping card piles */}
      <div className="grid grid-cols-4 gap-1.5">
        {player.stacks.map((stack) => {
          const canSteal = stealMode && stack.cards.length > 0 && myMasterCards > 0;
          const pileH = Math.max(40, stack.cards.length * 12 + 20);
          return (
            <div key={stack.slotIndex}
              onClick={canSteal ? () => onSteal(stack.slotIndex) : undefined}
              className={`rounded-xl border p-1 transition-all ${
                canSteal
                  ? "cursor-pointer border-red-500/60 bg-red-950/30 ring-1 ring-red-500/40 hover:bg-red-950/50"
                  : stack.completed ? "border-amber-600/60 bg-amber-950/20"
                  : "border-gray-800 bg-gray-950/50"
              }`}
              style={{ minHeight: `${pileH + 20}px` }}
            >
              <p className="text-[7px] text-gray-600 text-center mb-0.5">{stack.cards.length}/5</p>
              <div className="relative flex justify-center" style={{ height: `${pileH}px` }}>
                {stack.cards.map((card, i) => (
                  <div key={i} className="absolute" style={{ top: `${i * 12}px`, zIndex: i }}>
                    <StackCard card={card} />
                  </div>
                ))}
              </div>
              {stack.completed && (
                <p className="text-center text-[8px] font-black text-amber-400 mt-1">★</p>
              )}
              {stack.matchType && (
                <p className="text-center text-[6px] text-gray-600 capitalize mt-0.5">{stack.matchValue}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CardView ─────────────────────────────────────────────────────────────────

function CardView({ card, selected, dimmed, onClick, clickable }: {
  card: Stack5Card; selected?: boolean; dimmed?: boolean; onClick?: () => void; clickable?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-28 w-20 rounded-2xl overflow-hidden border-2 transition-all duration-100
        ${clickable ? "cursor-pointer hover:brightness-110 active:scale-[0.96]" : "cursor-default pointer-events-none"}
        ${selected ? "scale-110 border-white ring-2 ring-white shadow-2xl z-10" : "border-transparent"}
        ${dimmed ? "opacity-25" : ""}
      `}
    >
      <img src={cardImageSrc(card)} alt={cardAlt(card)} className="h-full w-full object-cover" draggable={false} />
    </button>
  );
}

// ─── MiniCard ─────────────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-xs rounded-3xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <h2 className="mb-4 text-center text-lg font-black">Wild Card Identity</h2>
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Color</p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`rounded-xl py-2.5 text-xs font-black transition-all ${COLOR_BG[c]} ${COLOR_TEXT[c]} ${color === c ? "ring-2 ring-white scale-105" : "opacity-60 hover:opacity-90"}`}>
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
                className={`rounded-xl py-2.5 text-xl bg-gray-800 transition-all ${shape === s ? "ring-2 ring-indigo-500 scale-105" : "opacity-50 hover:opacity-90"}`}>
                {SHAPE_EMOJI[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex justify-center">
          <div className="h-28 w-20 rounded-2xl overflow-hidden border-2 border-indigo-400 shadow-lg">
            <img src={cardImageSrc({ id: "", type: "standard", color, shape })} alt={`${color} ${shape}`}
              className="h-full w-full object-cover" draggable={false} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-gray-800 py-3 font-bold hover:bg-gray-700">Cancel</button>
          <button onClick={() => onPick(color, shape)} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-500">Play Wild</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-xs rounded-3xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <h2 className="mb-4 text-center text-lg font-black">{label}</h2>
        <div className="flex flex-col gap-2 mb-4">
          {players.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className="flex items-center gap-3 rounded-2xl bg-gray-800 px-4 py-3 hover:bg-gray-700 active:scale-95 transition-all">
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="text-xs text-gray-500">🤚 {p.hand.length}</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="w-full rounded-xl bg-gray-800 py-3 font-bold hover:bg-gray-700">Cancel</button>
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
    default: "bg-indigo-600 hover:bg-indigo-500 text-white",
    green:   "bg-green-600 hover:bg-green-500 text-white",
    red:     "bg-red-700 hover:bg-red-600 text-white",
    ghost:   "bg-gray-800 hover:bg-gray-700 text-gray-300",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-xl px-3 py-2 text-sm font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
      {children}
    </button>
  );
}

