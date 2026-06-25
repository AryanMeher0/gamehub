"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import {
  Stack5State, Stack5Card, Stack5Stack, Stack5Player,
  CardColor, CardShape,
} from "@/types/stack5";

// ─── UI Mode ──────────────────────────────────────────────────────────────────

type UIMode =
  | { type: "idle" }
  | { type: "card_selected"; cardId: string }
  | { type: "special_selected"; cardId: string; cardType: "skip" | "reset_hand" }
  | { type: "steal_mode" }
  | { type: "trade_mode"; selectedIds: string[] }
  | { type: "wild_pending"; cardId: string; slotIndex: number };

// ─── Visual helpers ───────────────────────────────────────────────────────────

const COLOR_BG: Record<CardColor, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  pink: "bg-pink-500",
  blue: "bg-blue-500",
};
const COLOR_TEXT: Record<CardColor, string> = {
  green: "text-white",
  yellow: "text-gray-900",
  pink: "text-white",
  blue: "text-white",
};
const COLOR_BORDER: Record<CardColor, string> = {
  green: "border-green-300",
  yellow: "border-yellow-200",
  pink: "border-pink-300",
  blue: "border-blue-300",
};
const COLOR_LABEL: Record<CardColor, string> = {
  green: "Green",
  yellow: "Yellow",
  pink: "Pink",
  blue: "Blue",
};
const SHAPE_EMOJI: Record<CardShape, string> = {
  flower: "🌸",
  lightning: "⚡",
  star: "⭐",
  drop: "💧",
};
const SHAPE_LABEL: Record<CardShape, string> = {
  flower: "Flower",
  lightning: "Lightning",
  star: "Star",
  drop: "Drop",
};
const COLORS: CardColor[] = ["green", "yellow", "pink", "blue"];
const SHAPES: CardShape[] = ["flower", "lightning", "star", "drop"];

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
  if (card.type !== "standard" && card.type !== "wild") return false;
  if (card.type === "wild") {
    // Wild always fits from the UI perspective; server validates the chosen identity
    return true;
  }
  if (stack.matchType === "color") return card.color === stack.matchValue;
  if (stack.matchType === "shape") return card.shape === stack.matchValue;
  const ref = stack.cards.find((c) => effectiveColor(c) !== null || effectiveShape(c) !== null);
  if (!ref) return true;
  const rc = effectiveColor(ref);
  const rs = effectiveShape(ref);
  return (rc !== null && card.color === rc) || (rs !== null && card.shape === rs);
}

function isValidTradeSet(hand: Stack5Card[], selectedIds: string[]): boolean {
  if (selectedIds.length !== 4) return false;
  const cards = selectedIds.map((id) => hand.find((c) => c.id === id)).filter(Boolean) as Stack5Card[];
  if (cards.some((c) => c.type !== "standard")) return false;
  const colors = new Set(cards.map((c) => c.color));
  const shapes = new Set(cards.map((c) => c.shape));
  return colors.size === 4 || shapes.size === 4;
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

  // Setup screen config (host only)
  const [targetScore, setTargetScore] = useState(3);
  const [startingMC, setStartingMC] = useState(2);

  const errorTimer = useRef<ReturnType<typeof setTimeout>>();

  function showError(msg: string) {
    setError(msg);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(""), 3000);
  }

  function emit(event: string, payload?: Record<string, unknown>) {
    getSocket().emit(event, { roomCode, ...payload });
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
      setState(s);
      setMode({ type: "idle" });
    }

    function onError(d: { message: string }) {
      showError(d.message);
    }

    function onReconnected() {
      socket.emit("stack5:getState", { roomCode });
    }

    socket.on("connect", onConnect);
    socket.on("stack5:stateUpdated", onState);
    socket.on("stack5:error", onError);
    socket.on("game:reconnected", onReconnected);

    socket.emit("stack5:getState", { roomCode });

    return () => {
      socket.off("connect", onConnect);
      socket.off("stack5:stateUpdated", onState);
      socket.off("stack5:error", onError);
      socket.off("game:reconnected", onReconnected);
    };
  }, [roomCode]);

  // ─── Current player ────────────────────────────────────────────────────────

  const me = state ? state.players[socketId] : null;
  const isMyTurn = !!(state && state.turnOrder[state.currentTurnIndex] === socketId);
  const canAct = isMyTurn && state!.actionsRemaining > 0 && !state!.gameOver;

  // ─── Action handlers ───────────────────────────────────────────────────────

  function handleCardClick(cardId: string) {
    if (!canAct) return;
    if (mode.type === "trade_mode") {
      const already = mode.selectedIds.includes(cardId);
      const newIds = already
        ? mode.selectedIds.filter((id) => id !== cardId)
        : [...mode.selectedIds, cardId];
      setMode({ type: "trade_mode", selectedIds: newIds });
      return;
    }
    const card = me!.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (mode.type === "card_selected" && mode.cardId === cardId) {
      setMode({ type: "idle" });
      return;
    }
    if (card.type === "reverse") {
      emit("stack5:playCard", { cardId });
      setMode({ type: "idle" });
      return;
    }
    if (card.type === "skip" || card.type === "reset_hand") {
      setMode({ type: "special_selected", cardId, cardType: card.type });
      return;
    }
    setMode({ type: "card_selected", cardId });
  }

  function handleSlotClick(slotIndex: number) {
    if (!canAct || mode.type !== "card_selected") return;
    const card = me!.hand.find((c) => c.id === mode.cardId);
    if (!card) return;
    if (!isValidForStack(me!.stacks[slotIndex], card)) {
      showError("Card doesn't match this stack's pattern");
      return;
    }
    if (card.type === "wild") {
      setMode({ type: "wild_pending", cardId: mode.cardId, slotIndex });
    } else {
      emit("stack5:playCard", { cardId: mode.cardId, slotIndex });
      setMode({ type: "idle" });
    }
  }

  function handleWildChoice(color: CardColor, shape: CardShape) {
    if (mode.type !== "wild_pending") return;
    emit("stack5:playCard", {
      cardId: mode.cardId,
      slotIndex: mode.slotIndex,
      chosenColor: color,
      chosenShape: shape,
    });
    setMode({ type: "idle" });
  }

  function handleSpecialTarget(targetPlayerId: string) {
    if (mode.type !== "special_selected") return;
    emit("stack5:playCard", { cardId: mode.cardId, targetPlayerId });
    setMode({ type: "idle" });
  }

  function handleSecure(slotIndex: number) {
    if (!canAct) return;
    emit("stack5:secure", { slotIndex });
  }

  function handleStealClick() {
    if (!canAct || !me || me.masterCards <= 0) return;
    setMode({ type: "steal_mode" });
  }

  function handleStealTarget(targetPlayerId: string, targetSlotIndex: number) {
    if (mode.type !== "steal_mode") return;
    emit("stack5:steal", { targetPlayerId, targetSlotIndex });
    setMode({ type: "idle" });
  }

  function handleDraw() {
    if (!canAct) return;
    emit("stack5:drawCard");
    setMode({ type: "idle" });
  }

  function handleEndTurn() {
    if (!isMyTurn) return;
    emit("stack5:endTurn");
    setMode({ type: "idle" });
  }

  function handleTradeToggle() {
    if (!canAct) return;
    setMode(mode.type === "trade_mode" ? { type: "idle" } : { type: "trade_mode", selectedIds: [] });
  }

  function handleTradeConfirm() {
    if (mode.type !== "trade_mode") return;
    emit("stack5:tradeForMaster", { cardIds: mode.selectedIds });
    setMode({ type: "idle" });
  }

  function handleLeave() {
    getSocket().emit("leaveRoom", { roomCode });
    router.push("/");
  }

  function handleConfigure() {
    emit("stack5:configure", { targetScore, startingMasterCards: startingMC });
  }

  // ─── Setup screen ──────────────────────────────────────────────────────────

  const isHost = state === null && socketId !== "";
  // Determine host from session storage (room host check happens server-side)
  // We show config controls if no state yet; server will reject if not host.

  if (!state) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 px-4 text-white">
        <div className="text-center">
          <span className="text-6xl">🧱</span>
          <h1 className="mt-3 text-3xl font-black text-indigo-400">Stack5</h1>
          <p className="mt-1 text-sm text-gray-500">Room: {roomCode}</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 text-center text-lg font-black">Game Setup</h2>
          <p className="mb-5 text-center text-xs text-gray-500">
            Only the host can start — other players wait here.
          </p>

          <div className="mb-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Target Score</p>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setTargetScore(n)}
                  className={`rounded-xl py-3 text-lg font-black transition-all ${
                    targetScore === n
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {n} pts
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Starting Master Cards</p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setStartingMC(n)}
                  className={`rounded-xl py-3 text-lg font-black transition-all ${
                    startingMC === n
                      ? "bg-amber-500 text-gray-950"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleConfigure}
            className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-black hover:bg-indigo-500 active:scale-95 transition-all"
          >
            Start Game →
          </button>
        </div>

        <button onClick={handleLeave} className="text-sm text-gray-600 hover:text-gray-400">
          Leave room
        </button>
      </main>
    );
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────

  if (state.gameOver) {
    const winner = state.winnerId ? state.players[state.winnerId] : null;
    const sorted = state.turnOrder
      .map((id) => state.players[id])
      .filter(Boolean)
      .sort((a, b) => b.points - a.points);

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 px-4 text-white">
        <div className="text-center">
          <span className="text-6xl">🏆</span>
          <h1 className="mt-3 text-4xl font-black">{winner?.name ?? "Someone"} wins!</h1>
          <p className="mt-1 text-gray-400">{winner?.points} point(s)</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-5">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
              <span className="w-6 text-center font-black text-gray-500">{i + 1}</span>
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="font-black text-amber-400">{p.points} pts</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => { getSocket().emit("leaveRoom", { roomCode }); router.push("/"); }}
          className="rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-black hover:bg-indigo-500 active:scale-95 transition-all"
        >
          Back to Lobby
        </button>
      </main>
    );
  }

  // ─── Active game ───────────────────────────────────────────────────────────

  const currentTurnPlayer = state.players[state.turnOrder[state.currentTurnIndex]];
  const opponents = state.turnOrder.filter((id) => id !== socketId).map((id) => state.players[id]).filter(Boolean);

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white select-none">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-indigo-400">Stack5</span>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-400">{roomCode}</span>
        </div>

        <div className="flex flex-col items-center">
          <p className={`text-sm font-black ${isMyTurn ? "text-green-400" : "text-gray-400"}`}>
            {isMyTurn ? `Your turn — ${state.actionsRemaining} action(s) left` : `${currentTurnPlayer?.name}'s turn`}
          </p>
          <p className="text-[10px] text-gray-600">
            {state.direction === 1 ? "↻ Clockwise" : "↺ Counter-clockwise"} · First to {state.targetScore} pts
          </p>
        </div>

        <button onClick={handleLeave} className="text-xs text-gray-600 hover:text-gray-400">
          Leave
        </button>
      </header>

      {/* Error toast */}
      {error && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-900/90 px-4 py-2 text-sm font-bold text-red-200 shadow-lg">
          {error}
        </div>
      )}

      {/* Wild picker modal */}
      {mode.type === "wild_pending" && (
        <WildPicker onPick={handleWildChoice} onCancel={() => setMode({ type: "idle" })} />
      )}

      {/* Special card target overlay */}
      {mode.type === "special_selected" && (
        <TargetOverlay
          label={mode.cardType === "skip" ? "Skip — choose a player" : "Reset Hand — choose a player"}
          players={opponents}
          onSelect={handleSpecialTarget}
          onCancel={() => setMode({ type: "idle" })}
        />
      )}

      {/* Steal mode overlay */}
      {mode.type === "steal_mode" && (
        <div className="fixed inset-0 z-30 flex items-start justify-center pt-20 bg-black/40 pointer-events-none">
          <div className="pointer-events-auto rounded-2xl border border-amber-600 bg-amber-950/90 px-6 py-3 text-center shadow-2xl">
            <p className="font-black text-amber-400">Click an opponent&apos;s stack to steal it</p>
            <button onClick={() => setMode({ type: "idle" })} className="mt-2 text-xs text-amber-600 hover:text-amber-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3 pb-6 lg:flex-row lg:items-start">

        {/* ─── Opponents ─── */}
        {opponents.length > 0 && (
          <div className="flex flex-col gap-3 lg:w-64 lg:shrink-0">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Opponents</p>
            {opponents.map((opp) => (
              <OpponentPanel
                key={opp.id}
                player={opp}
                isCurrentTurn={state.turnOrder[state.currentTurnIndex] === opp.id}
                stealMode={mode.type === "steal_mode"}
                myMasterCards={me?.masterCards ?? 0}
                onSteal={(slotIndex) => handleStealTarget(opp.id, slotIndex)}
              />
            ))}
          </div>
        )}

        {/* ─── Main area ─── */}
        <div className="flex flex-1 flex-col gap-4 min-w-0">

          {/* My stacks */}
          {me && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Your Stacks</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>⭐ {me.points}/{state.targetScore} pts</span>
                  <span className="text-amber-400 font-bold">🃏 {me.masterCards} MC</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {me.stacks.map((stack) => {
                  const selectedCard = mode.type === "card_selected"
                    ? me.hand.find((c) => c.id === mode.cardId)
                    : null;
                  const canDrop = selectedCard ? isValidForStack(stack, selectedCard) : false;
                  const isClickable = mode.type === "card_selected" && !stack.completed;

                  return (
                    <MyStackSlot
                      key={stack.slotIndex}
                      stack={stack}
                      canDrop={canDrop}
                      isClickable={isClickable}
                      canSecure={canAct && stack.completed && me.masterCards > 0}
                      onClick={() => handleSlotClick(stack.slotIndex)}
                      onSecure={() => handleSecure(stack.slotIndex)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* My hand */}
          {me && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                  Your Hand ({me.hand.length} cards)
                </p>
                {mode.type === "card_selected" && (
                  <button
                    onClick={() => setMode({ type: "idle" })}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {me.hand.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">Hand is empty — draw cards on your turn</p>
                ) : (
                  me.hand.map((card) => {
                    const isSelected =
                      mode.type === "card_selected" && mode.cardId === card.id;
                    const isTradeSelected =
                      mode.type === "trade_mode" && mode.selectedIds.includes(card.id);
                    const isDisabledForTrade =
                      mode.type === "trade_mode" && card.type !== "standard";
                    return (
                      <CardView
                        key={card.id}
                        card={card}
                        selected={isSelected || isTradeSelected}
                        dimmed={isDisabledForTrade}
                        onClick={() => handleCardClick(card.id)}
                        clickable={canAct}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Action bar */}
          {isMyTurn && me && (
            <div className="flex flex-wrap gap-2">
              <ActionBtn onClick={handleDraw} disabled={!canAct}>
                Draw Card
              </ActionBtn>

              {me.masterCards > 0 && (
                <ActionBtn
                  onClick={handleStealClick}
                  disabled={!canAct}
                  variant="amber"
                >
                  🗡️ Steal Stack (1 MC)
                </ActionBtn>
              )}

              {mode.type === "trade_mode" ? (
                <>
                  <ActionBtn
                    onClick={handleTradeConfirm}
                    disabled={!isValidTradeSet(me.hand, mode.selectedIds)}
                    variant="green"
                  >
                    Confirm Trade ({mode.selectedIds.length}/4)
                  </ActionBtn>
                  <ActionBtn onClick={handleTradeToggle} variant="ghost">
                    Cancel Trade
                  </ActionBtn>
                </>
              ) : (
                <ActionBtn onClick={handleTradeToggle} disabled={!canAct}>
                  Trade 4 Cards → MC
                </ActionBtn>
              )}

              <ActionBtn onClick={handleEndTurn} variant="ghost">
                End Turn
              </ActionBtn>
            </div>
          )}

          {/* Game log */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-600">Log</p>
            <div className="flex max-h-32 flex-col-reverse gap-1 overflow-y-auto">
              {[...state.log].reverse().map((entry, i) => (
                <p key={i} className="text-xs text-gray-400">{entry}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── MyStackSlot ──────────────────────────────────────────────────────────────

function MyStackSlot({
  stack, canDrop, isClickable, canSecure, onClick, onSecure,
}: {
  stack: Stack5Stack;
  canDrop: boolean;
  isClickable: boolean;
  canSecure: boolean;
  onClick: () => void;
  onSecure: () => void;
}) {
  const isEmpty = stack.cards.length === 0;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`relative flex min-h-[140px] flex-col rounded-2xl border p-2 transition-all ${
        stack.completed
          ? "border-amber-500 bg-amber-950/30"
          : canDrop
          ? "cursor-pointer border-green-500 bg-green-950/20 ring-1 ring-green-500"
          : isClickable
          ? "border-gray-700 bg-gray-900 opacity-40"
          : "border-gray-800 bg-gray-900"
      }`}
    >
      {/* Stack header */}
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-bold text-gray-600">Slot {stack.slotIndex + 1}</span>
        <span className="text-[10px] text-gray-600">{stack.cards.length}/5</span>
      </div>

      {/* Cards */}
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[10px] text-gray-700">Empty</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 flex-1">
          {stack.cards.map((card, i) => (
            <MiniCard key={i} card={card} />
          ))}
        </div>
      )}

      {/* Match type badge */}
      {stack.matchType && (
        <div className="mt-1 text-center">
          <span className="text-[9px] font-bold uppercase text-gray-600">
            {stack.matchType}: {stack.matchValue}
          </span>
        </div>
      )}

      {/* Ready badge */}
      {stack.completed && (
        <div className="mt-1 flex flex-col items-center gap-1">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-gray-950">
            READY
          </span>
          {canSecure && (
            <button
              onClick={(e) => { e.stopPropagation(); onSecure(); }}
              className="rounded-lg bg-amber-500 px-2 py-0.5 text-[9px] font-black text-gray-950 hover:bg-amber-400 active:scale-95 transition-all"
            >
              Secure (1 MC)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OpponentPanel ────────────────────────────────────────────────────────────

function OpponentPanel({
  player, isCurrentTurn, stealMode, myMasterCards, onSteal,
}: {
  player: Stack5Player;
  isCurrentTurn: boolean;
  stealMode: boolean;
  myMasterCards: number;
  onSteal: (slotIndex: number) => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 transition-all ${
        isCurrentTurn ? "border-indigo-500 bg-indigo-950/20" : "border-gray-800 bg-gray-900"
      }`}
    >
      {/* Player header */}
      <div className="mb-2 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: player.color }} />
        <span className="flex-1 truncate font-bold text-sm">{player.name}</span>
        {isCurrentTurn && (
          <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-black">TURN</span>
        )}
      </div>

      {/* Stats */}
      <div className="mb-2 flex gap-3 text-xs text-gray-500">
        <span>⭐ {player.points} pts</span>
        <span className="text-amber-400">🃏 {player.masterCards} MC</span>
        <span>🤚 {player.hand.length}</span>
      </div>

      {/* Stacks */}
      <div className="grid grid-cols-4 gap-1">
        {player.stacks.map((stack) => (
          <div
            key={stack.slotIndex}
            onClick={stealMode && stack.cards.length > 0 && myMasterCards > 0
              ? () => onSteal(stack.slotIndex)
              : undefined}
            className={`relative rounded-xl border p-1 min-h-[80px] flex flex-col transition-all ${
              stealMode && stack.cards.length > 0 && myMasterCards > 0
                ? "cursor-pointer border-red-500 bg-red-950/30 ring-1 ring-red-500 hover:bg-red-950/50"
                : stack.completed
                ? "border-amber-600 bg-amber-950/20"
                : "border-gray-800 bg-gray-950"
            }`}
          >
            <span className="text-[8px] text-gray-600 text-center">{stack.cards.length}/5</span>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {stack.cards.slice(0, 4).map((card, i) => (
                <MiniCard key={i} card={card} tiny />
              ))}
              {stack.cards.length > 4 && (
                <p className="text-[7px] text-gray-600 text-center">+{stack.cards.length - 4}</p>
              )}
            </div>
            {stack.completed && (
              <span className="mt-auto block text-center text-[7px] font-black text-amber-400">READY</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CardView ─────────────────────────────────────────────────────────────────

function CardView({
  card, selected, dimmed, onClick, clickable,
}: {
  card: Stack5Card;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  clickable?: boolean;
}) {
  const baseClass = `shrink-0 h-28 w-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
    clickable ? "cursor-pointer active:scale-95" : "cursor-default"
  } ${selected ? "scale-110 ring-2 ring-white border-white shadow-xl" : ""} ${dimmed ? "opacity-30" : ""}`;

  if (card.type === "standard") {
    const bg = COLOR_BG[card.color!];
    const tc = COLOR_TEXT[card.color!];
    const bc = selected ? "border-white" : COLOR_BORDER[card.color!];
    return (
      <button onClick={onClick} className={`${baseClass} ${bg} ${tc} ${bc}`}>
        <span className="text-4xl">{SHAPE_EMOJI[card.shape!]}</span>
        <span className="text-[10px] font-bold capitalize">{card.color}</span>
      </button>
    );
  }
  if (card.type === "wild") {
    return (
      <button onClick={onClick} className={`${baseClass} bg-gradient-to-br from-purple-600 via-pink-500 to-yellow-400 text-white ${selected ? "border-white" : "border-transparent"}`}>
        <span className="text-4xl">✨</span>
        <span className="text-[10px] font-bold">WILD</span>
      </button>
    );
  }
  if (card.type === "skip") {
    return (
      <button onClick={onClick} className={`${baseClass} bg-orange-500 text-white ${selected ? "border-white" : "border-orange-300"}`}>
        <span className="text-4xl">⊘</span>
        <span className="text-[10px] font-bold">SKIP</span>
      </button>
    );
  }
  if (card.type === "reverse") {
    return (
      <button onClick={onClick} className={`${baseClass} bg-purple-600 text-white ${selected ? "border-white" : "border-purple-400"}`}>
        <span className="text-3xl">↕️</span>
        <span className="text-[10px] font-bold">REVERSE</span>
      </button>
    );
  }
  if (card.type === "reset_hand") {
    return (
      <button onClick={onClick} className={`${baseClass} bg-red-600 text-white ${selected ? "border-white" : "border-red-400"}`}>
        <span className="text-3xl">🗑️</span>
        <span className="text-[10px] font-bold">RESET</span>
      </button>
    );
  }
  return null;
}

// ─── MiniCard ─────────────────────────────────────────────────────────────────

function MiniCard({ card, tiny }: { card: Stack5Card; tiny?: boolean }) {
  const h = tiny ? "h-4" : "h-5";
  const text = tiny ? "text-[7px]" : "text-[8px]";

  if (card.type === "standard") {
    return (
      <div className={`${h} rounded ${COLOR_BG[card.color!]} flex items-center justify-center gap-0.5`}>
        <span className={text}>{SHAPE_EMOJI[card.shape!]}</span>
      </div>
    );
  }
  if (card.type === "wild") {
    const assignedBg = card.assignedColor ? COLOR_BG[card.assignedColor] : "bg-gradient-to-r from-purple-500 to-pink-500";
    return (
      <div className={`${h} rounded ${assignedBg} flex items-center justify-center`}>
        <span className={text}>✨</span>
      </div>
    );
  }
  if (card.type === "skip") return <div className={`${h} rounded bg-orange-500 flex items-center justify-center`}><span className={text}>⊘</span></div>;
  if (card.type === "reverse") return <div className={`${h} rounded bg-purple-600 flex items-center justify-center`}><span className={text}>↕</span></div>;
  if (card.type === "reset_hand") return <div className={`${h} rounded bg-red-600 flex items-center justify-center`}><span className={text}>🗑</span></div>;
  return null;
}

// ─── WildPicker ───────────────────────────────────────────────────────────────

function WildPicker({ onPick, onCancel }: {
  onPick: (color: CardColor, shape: CardShape) => void;
  onCancel: () => void;
}) {
  const [color, setColor] = useState<CardColor>("green");
  const [shape, setShape] = useState<CardShape>("star");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-center text-lg font-black">Choose Wild Identity</h2>

        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Color</p>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`rounded-xl py-3 text-sm font-black transition-all ${COLOR_BG[c]} ${COLOR_TEXT[c]} ${
                  color === c ? "ring-2 ring-white scale-105" : "opacity-70"
                }`}
              >
                {COLOR_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Shape</p>
          <div className="grid grid-cols-4 gap-2">
            {SHAPES.map((s) => (
              <button
                key={s}
                onClick={() => setShape(s)}
                className={`rounded-xl py-3 text-2xl transition-all bg-gray-800 ${
                  shape === s ? "ring-2 ring-indigo-500 scale-105" : "opacity-60"
                }`}
              >
                {SHAPE_EMOJI[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-xl bg-gray-800 p-3 text-center">
          <span className="text-3xl">{SHAPE_EMOJI[shape]}</span>
          <p className="text-sm font-bold mt-1">
            {COLOR_LABEL[color]} {SHAPE_LABEL[shape]}
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-gray-700 py-3 font-bold hover:bg-gray-600">
            Cancel
          </button>
          <button
            onClick={() => onPick(color, shape)}
            className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-500"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TargetOverlay ────────────────────────────────────────────────────────────

function TargetOverlay({ label, players, onSelect, onCancel }: {
  label: string;
  players: Stack5Player[];
  onSelect: (playerId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-center text-lg font-black">{label}</h2>
        <div className="flex flex-col gap-2 mb-4">
          {players.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex items-center gap-3 rounded-xl bg-gray-800 px-4 py-3 text-left hover:bg-gray-700 active:scale-95 transition-all"
            >
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="text-xs text-gray-500">🤚 {p.hand.length} cards</span>
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="w-full rounded-xl bg-gray-700 py-3 font-bold hover:bg-gray-600">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────

function ActionBtn({
  children, onClick, disabled, variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "amber" | "green" | "ghost";
}) {
  const styles = {
    default: "bg-indigo-600 hover:bg-indigo-500 text-white",
    amber: "bg-amber-500 hover:bg-amber-400 text-gray-950",
    green: "bg-green-600 hover:bg-green-500 text-white",
    ghost: "bg-gray-800 hover:bg-gray-700 text-gray-300",
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}
