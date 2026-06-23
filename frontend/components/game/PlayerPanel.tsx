"use client";

import { GameState, GamePlayer, PropertyOwnership } from "@/types/game";
import { PROPERTY_COLORS } from "@/lib/board";

// Color groups mirrored from backend — used only for eligibility check
const COLOR_GROUPS: Record<string, number[]> = {
  brown:    [1, 3],
  lightblue:[6, 8, 9],
  pink:     [11, 13, 14],
  orange:   [16, 18, 19],
  red:      [21, 23, 24],
  yellow:   [26, 27, 29],
  green:    [31, 32, 34],
  darkblue: [37, 39],
};

function ownsFullGroup(color: string, ownerId: string, properties: Record<number, PropertyOwnership>): boolean {
  return (COLOR_GROUPS[color] ?? []).every((i) => properties[i]?.ownerId === ownerId);
}

interface Props {
  state: GameState;
  socketId: string;
  onRoll: () => void;
  onEndTurn: () => void;
  onBuyBuilding: (spaceIndex: number) => void;
  onOpenTrade: () => void;
}

export default function PlayerPanel({ state, socketId, onRoll, onEndTurn, onBuyBuilding, onOpenTrade }: Props) {
  const currentPlayerId = state.turnOrder[state.currentTurnIndex];
  const isMyTurn = currentPlayerId === socketId;
  const players = Object.values(state.players);

  const myPlayer = state.players[socketId];
  const canTrade = !myPlayer?.bankrupt && !state.gameOver &&
    Object.values(state.players).some((p) => p.id !== socketId && !p.bankrupt);

  // Properties this player owns that are eligible to build on
  const buildable = isMyTurn && state.phase === "ended"
    ? Object.values(state.properties).filter(
        (p) =>
          p.ownerId === socketId &&
          p.type === "property" &&
          p.color &&
          !p.hasHotel &&
          ownsFullGroup(p.color, socketId, state.properties)
      )
    : [];

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
                <span className={`text-sm font-semibold ${p.bankrupt ? "text-gray-600 line-through" : "text-white"}`}>{p.name}</span>
                {p.id === socketId && (
                  <span className="rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">You</span>
                )}
                {p.inJail && !p.bankrupt && (
                  <span className="rounded-full bg-red-900 px-1.5 py-0.5 text-[10px] text-red-400">Jail</span>
                )}
                {p.bankrupt && (
                  <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">Bankrupt</span>
                )}
              </div>
              <span className={`text-sm font-bold ${p.bankrupt ? "text-gray-600" : "text-green-400"}`}>${p.cash}</span>
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

      {/* Build section — only shown to active player after rolling */}
      {buildable.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Build</p>
          <div className="flex flex-col gap-1.5">
            {buildable.map((p: PropertyOwnership) => {
              const colorHex = p.color ? PROPERTY_COLORS[p.color] : "#374151";
              const label = p.houseCount < 4 ? `House ($${houseCostFor(p.color!)})` : `Hotel ($${houseCostFor(p.color!)})`;
              return (
                <div key={p.spaceIndex} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorHex }} />
                    <span className="text-xs text-gray-300 truncate">{p.name}</span>
                    <span className="text-[10px] text-gray-500">
                      {p.houseCount > 0 ? `${p.houseCount}⌂` : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => onBuyBuilding(p.spaceIndex)}
                    className="shrink-0 rounded-lg bg-green-700 px-2 py-1 text-[10px] font-bold hover:bg-green-600 active:scale-95 transition-all"
                  >
                    {label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {isMyTurn && state.phase !== "gameover" && (
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

      {/* Trade button — available to any non-bankrupt player whenever there's someone to trade with */}
      {canTrade && state.phase !== "gameover" && (
        <button
          onClick={onOpenTrade}
          className="w-full rounded-xl border border-yellow-600 bg-yellow-950 py-2.5 text-sm font-bold text-yellow-400 hover:bg-yellow-900 transition-all active:scale-95"
        >
          🤝 Propose Trade
        </button>
      )}
    </div>
  );
}

function houseCostFor(color: string): number {
  const costs: Record<string, number> = {
    brown: 50, lightblue: 50, pink: 100, orange: 100,
    red: 150, yellow: 150, green: 200, darkblue: 200,
  };
  return costs[color] ?? 100;
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
