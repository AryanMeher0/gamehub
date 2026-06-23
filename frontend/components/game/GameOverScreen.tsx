"use client";

import { GameState, PlayerRanking } from "@/types/game";

interface Props {
  state: GameState;
  socketId: string;
  roomCode: string;
  onLeave: () => void;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default function GameOverScreen({ state, socketId, onLeave }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 border-b border-gray-800 bg-gray-950 px-6 py-6">
          <span className="text-5xl">🏆</span>
          <h1 className="text-2xl font-black text-white">Game Over</h1>
          {state.winnerName && (
            <p className="text-indigo-400 font-semibold">
              {state.winnerId === socketId ? "You win!" : `${state.winnerName} wins!`}
            </p>
          )}
        </div>

        {/* Rankings */}
        <div className="flex flex-col gap-2 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
            Final Rankings
          </p>
          {state.rankings.map((r: PlayerRanking) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                r.id === socketId ? "bg-indigo-950 ring-1 ring-indigo-500" : "bg-gray-800"
              }`}
            >
              <span className="text-xl w-7 text-center">
                {MEDAL[r.rank - 1] ?? `#${r.rank}`}
              </span>
              <div className="h-3 w-3 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: r.color }} />
              <span className="flex-1 text-sm font-semibold text-white">
                {r.name}
                {r.id === socketId && (
                  <span className="ml-2 rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">You</span>
                )}
              </span>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-bold text-green-400">${r.cash}</span>
                <span className="text-[10px] text-gray-500">{r.propertyCount} propert{r.propertyCount === 1 ? "y" : "ies"}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Return button */}
        <div className="px-6 pb-6">
          <button
            onClick={onLeave}
            className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold hover:bg-indigo-500 active:scale-95 transition-all"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
