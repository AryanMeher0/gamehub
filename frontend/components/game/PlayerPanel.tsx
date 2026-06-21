"use client";

import { GameState, GamePlayer } from "@/types/game";

interface Props {
  state: GameState;
  socketId: string;
  onRoll: () => void;
  onEndTurn: () => void;
}

export default function PlayerPanel({ state, socketId, onRoll, onEndTurn }: Props) {
  const currentPlayerId = state.turnOrder[state.currentTurnIndex];
  const isMyTurn = currentPlayerId === socketId;
  const players = Object.values(state.players);

  return (
    <div className="flex flex-col gap-3">
      {/* Dice result */}
      {state.lastRoll && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-3 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-500">Last Roll</p>
          <div className="mt-1 flex items-center justify-center gap-3">
            <Die value={state.lastRoll.die1} />
            <Die value={state.lastRoll.die2} />
          </div>
          <p className="mt-1 text-sm font-bold text-white">
            = {state.lastRoll.total}
            {state.lastRoll.isDoubles && (
              <span className="ml-2 text-yellow-400">Doubles!</span>
            )}
          </p>
        </div>
      )}

      {/* Players */}
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Players</p>
        <div className="flex flex-col gap-2">
          {players.map((p: GamePlayer) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                p.id === currentPlayerId ? "bg-gray-800 ring-1 ring-indigo-500" : "bg-gray-800/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: p.color }} />
                <span className="text-sm font-semibold text-white">{p.name}</span>
                {p.id === socketId && (
                  <span className="rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">You</span>
                )}
                {p.inJail && (
                  <span className="rounded-full bg-red-900 px-1.5 py-0.5 text-[10px] text-red-400">Jail</span>
                )}
              </div>
              <span className="text-sm font-bold text-green-400">${p.cash}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Turn indicator */}
      <div className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-center">
        {isMyTurn ? (
          <p className="text-sm font-bold text-indigo-400">Your turn</p>
        ) : (
          <p className="text-sm text-gray-400">
            Waiting for <span className="font-bold text-white">{state.players[currentPlayerId]?.name}</span>...
          </p>
        )}
      </div>

      {/* Actions */}
      {isMyTurn && (
        <div className="flex flex-col gap-2">
          <button
            onClick={onRoll}
            disabled={state.phase !== "rolling"}
            className="w-full rounded-xl bg-indigo-600 py-3 text-base font-bold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-95"
          >
            🎲 Roll Dice
          </button>
          <button
            onClick={onEndTurn}
            disabled={state.phase !== "ended"}
            className="w-full rounded-xl bg-gray-700 py-3 text-base font-bold hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-95"
          >
            End Turn →
          </button>
        </div>
      )}
    </div>
  );
}

function Die({ value }: { value: number }) {
  const dots: Record<number, number[][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
  };
  return (
    <div className="relative h-10 w-10 rounded-lg bg-white shadow">
      {(dots[value] ?? []).map(([x, y], i) => (
        <div
          key={i}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      ))}
    </div>
  );
}
