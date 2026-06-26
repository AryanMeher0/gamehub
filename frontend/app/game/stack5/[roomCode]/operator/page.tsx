"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Stack5State, Stack5Player } from "@/types/stack5";

function cardImageSrc(card: { type: string; color?: string | null; shape?: string | null }): string {
  if (card.type === "standard") return `/cards/${card.color}_${card.shape}.png`;
  return `/cards/${card.type}.png`;
}

export default function Stack5OperatorPage() {
  const { roomCode: rawCode } = useParams<{ roomCode: string }>();
  const roomCode = rawCode.toUpperCase();
  const router = useRouter();

  const [state, setState] = useState<Stack5State | null>(null);
  const [socketId, setSocketId] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }

  function emit(event: string, payload?: Record<string, unknown>) {
    getSocket().emit(event, { roomCode, ...payload });
  }

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");

    function onState(s: Stack5State) { setState(s); }
    function onError(d: { message: string }) { showToast("❌ " + d.message); }

    socket.on("stack5:stateUpdated", onState);
    socket.on("stack5:error", onError);
    socket.emit("stack5:getState", { roomCode });

    return () => {
      socket.off("stack5:stateUpdated", onState);
      socket.off("stack5:error", onError);
    };
  }, [roomCode]);

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-gray-500">Loading…</p>
          <p className="mt-1 text-xs text-gray-700">If you see this for more than a few seconds, the game may not have started yet.</p>
        </div>
      </main>
    );
  }

  const isHost = socketId === state.hostId;
  const players = state.turnOrder.map((id) => state.players[id]).filter(Boolean);
  const currentPlayer = state.players[state.turnOrder[state.currentTurnIndex]];

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-indigo-400">Stack5 Operator</h1>
          <p className="text-xs text-gray-600 font-mono">{roomCode}</p>
        </div>
        <button onClick={() => router.push(`/game/stack5/${roomCode}`)}
          className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-bold hover:bg-gray-700">
          ← Back to Game
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-bold ${toast.startsWith("❌") ? "bg-red-900/80 text-red-200" : "bg-green-900/80 text-green-200"}`}>
          {toast}
        </div>
      )}

      {!isHost && (
        <div className="mb-6 rounded-2xl border border-red-700/60 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          ⚠️ You are not the host. Operator actions will be rejected by the server.
        </div>
      )}

      {/* Game status */}
      <Panel title="Game Status">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Phase" value={state.phase} />
          <Stat label="Current Turn" value={currentPlayer?.name ?? "—"} />
          <Stat label="Actions Remaining" value={String(state.actionsRemaining)} />
          <Stat label="Direction" value={state.direction === 1 ? "→ Clockwise" : "← Counter"} />
          <Stat label="Target Score" value={`${state.targetScore} pts`} />
          <Stat label="Deck Size" value={`${state.drawDeck.length} cards`} />
          <Stat label="Discard Size" value={`${state.discardPile.length} cards`} />
          <Stat label="Timer" value={state.turnTimerSeconds > 0 ? `${state.turnTimerSeconds}s` : "Off"} />
        </div>
      </Panel>

      {/* Turn controls */}
      <Panel title="Turn Controls">
        <div className="flex flex-wrap gap-2">
          <OpBtn onClick={() => { emit("stack5:operator:undo"); showToast("↩️ Undo requested"); }} disabled={!isHost}>
            ↩️ Undo Last Action
          </OpBtn>
          <OpBtn onClick={() => { emit("stack5:operator:forceNextTurn"); showToast("⏭️ Forced next turn"); }} disabled={!isHost} variant="amber">
            ⏭️ Force Next Turn
          </OpBtn>
        </div>
        <p className="mt-2 text-xs text-gray-600">Undo can be used up to 20 times (one step per click).</p>
      </Panel>

      {/* Players */}
      <Panel title="Players">
        <div className="flex flex-col gap-4">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isCurrentTurn={state.turnOrder[state.currentTurnIndex] === player.id}
              isHost={isHost}
              onGiveMC={(amount) => { emit("stack5:operator:giveMC", { targetPlayerId: player.id, amount }); showToast(`🃏 MC adjusted for ${player.name}`); }}
              onClearStack={(si) => { emit("stack5:operator:clearStack", { targetPlayerId: player.id, slotIndex: si }); showToast(`🗑️ Cleared ${player.name}'s slot ${si + 1}`); }}
            />
          ))}
        </div>
      </Panel>

      {/* Force end game */}
      {!state.gameOver && (
        <Panel title="End Game">
          <p className="mb-3 text-sm text-gray-400">Declare a winner and end the game immediately.</p>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <button key={p.id} disabled={!isHost}
                onClick={() => {
                  if (confirm(`Declare ${p.name} the winner and end the game?`)) {
                    emit("stack5:operator:endGame", { winnerId: p.id });
                    showToast(`🏆 ${p.name} declared winner`);
                  }
                }}
                className="rounded-xl bg-red-900/60 border border-red-700/60 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                🏆 {p.name}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Game log */}
      <Panel title={`Game Log (${state.log.length} entries)`}>
        <div className="max-h-64 overflow-y-auto flex flex-col-reverse gap-0.5">
          {[...state.log].reverse().map((entry, i) => (
            <p key={i} className="text-xs text-gray-400 py-0.5 border-b border-gray-800/40 last:border-0">{entry}</p>
          ))}
        </div>
      </Panel>

    </main>
  );
}

// ─── PlayerCard ───────────────────────────────────────────────────────────────

function PlayerCard({ player, isCurrentTurn, isHost, onGiveMC, onClearStack }: {
  player: Stack5Player;
  isCurrentTurn: boolean;
  isHost: boolean;
  onGiveMC: (amount: number) => void;
  onClearStack: (slotIndex: number) => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${isCurrentTurn ? "border-indigo-500/60 bg-indigo-950/20" : "border-gray-800 bg-gray-900/50"}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: player.color }} />
        <span className="font-black text-base flex-1">{player.name}</span>
        {isCurrentTurn && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-black">CURRENT</span>}
        {player.isBot && <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[9px] text-gray-400">BOT</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        <div className="rounded-xl bg-gray-800 px-3 py-2 text-center">
          <p className="text-xs text-gray-500">Points</p>
          <p className="font-black text-amber-400">{player.points}</p>
        </div>
        <div className="rounded-xl bg-gray-800 px-3 py-2 text-center">
          <p className="text-xs text-gray-500">Master Cards</p>
          <p className="font-black text-indigo-300">{player.masterCards}</p>
        </div>
        <div className="rounded-xl bg-gray-800 px-3 py-2 text-center">
          <p className="text-xs text-gray-500">Hand</p>
          <p className="font-black">{player.hand.length} cards</p>
        </div>
      </div>

      {/* Hand preview */}
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Hand</p>
        <div className="flex flex-wrap gap-1">
          {player.hand.length === 0
            ? <span className="text-xs text-gray-700 italic">Empty</span>
            : player.hand.map((card, i) => (
              <div key={i} className="h-10 w-7 rounded-lg overflow-hidden border border-gray-700">
                <img src={cardImageSrc(card)} alt={card.type}
                  className="h-full w-full object-cover" draggable={false} />
              </div>
            ))
          }
        </div>
      </div>

      {/* Stacks */}
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Stacks</p>
        <div className="grid grid-cols-4 gap-1.5">
          {player.stacks.map((stack) => (
            <div key={stack.slotIndex}
              className={`rounded-xl border p-1.5 ${stack.completed ? "border-amber-600/60 bg-amber-950/30" : "border-gray-800 bg-gray-950/60"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-gray-600">S{stack.slotIndex + 1}</span>
                <span className="text-[8px] text-gray-600">{stack.cards.length}/5</span>
              </div>
              {stack.matchType && (
                <p className="text-[7px] text-gray-600 capitalize">{stack.matchType}: {stack.matchValue}</p>
              )}
              {stack.completed && <p className="text-[8px] font-black text-amber-400">★READY</p>}
              {isHost && stack.cards.length > 0 && (
                <button onClick={() => onClearStack(stack.slotIndex)}
                  className="mt-1 w-full rounded-lg bg-red-900/60 text-[7px] font-bold text-red-400 py-0.5 hover:bg-red-900 transition-all">
                  Clear
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* MC controls */}
      {isHost && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Master Cards:</span>
          <button onClick={() => onGiveMC(-1)} className="rounded-lg bg-gray-800 px-3 py-1 text-sm font-black hover:bg-gray-700">−</button>
          <span className="font-black w-6 text-center">{player.masterCards}</span>
          <button onClick={() => onGiveMC(1)} className="rounded-lg bg-gray-800 px-3 py-1 text-sm font-black hover:bg-gray-700">+</button>
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-800/60 px-3 py-2">
      <p className="text-[10px] text-gray-600">{label}</p>
      <p className="font-bold text-sm">{value}</p>
    </div>
  );
}

function OpBtn({ children, onClick, disabled, variant = "indigo" }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  variant?: "indigo" | "amber" | "red";
}) {
  const styles = {
    indigo: "bg-indigo-700 hover:bg-indigo-600 text-white",
    amber:  "bg-amber-700 hover:bg-amber-600 text-white",
    red:    "bg-red-800 hover:bg-red-700 text-white",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${styles}`}>
      {children}
    </button>
  );
}
