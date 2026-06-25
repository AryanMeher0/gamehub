"use client";

import { GameState, GamePlayer, PropertyOwnership } from "@/types/game";
import { PROPERTY_COLORS } from "@/lib/board";

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

function houseCostFor(color: string): number {
  const costs: Record<string, number> = {
    brown: 50, lightblue: 50, pink: 100, orange: 100,
    red: 150, yellow: 150, green: 200, darkblue: 200,
  };
  return costs[color] ?? 100;
}

interface Props {
  state: GameState;
  socketId: string;
  onRoll: () => void;
  onEndTurn: () => void;
  onBuyBuilding: (spaceIndex: number) => void;
  onSellBuilding: (spaceIndex: number) => void;
  onMortgage: (spaceIndex: number) => void;
  onUnmortgage: (spaceIndex: number) => void;
  onPayJailFine: () => void;
  onUseGojf: () => void;
  onOpenTrade: () => void;
}

export default function PlayerPanel({
  state,
  socketId,
  onRoll,
  onEndTurn,
  onBuyBuilding,
  onSellBuilding,
  onMortgage,
  onUnmortgage,
  onPayJailFine,
  onUseGojf,
  onOpenTrade,
}: Props) {
  const currentPlayerId = state.turnOrder[state.currentTurnIndex];
  const isMyTurn = currentPlayerId === socketId;
  const players = Object.values(state.players);

  const myPlayer = state.players[socketId];
  const canTrade = !myPlayer?.bankrupt && !state.gameOver &&
    Object.values(state.players).some((p) => p.id !== socketId && !p.bankrupt);

  const isRollingPhase = isMyTurn && state.phase === "rolling";
  const isEndedPhase = isMyTurn && state.phase === "ended";
  const inJail = myPlayer?.inJail ?? false;

  // Buildable properties (even-building rule shown via visual check)
  const buildable = isEndedPhase
    ? Object.values(state.properties).filter(
        (p) =>
          p.ownerId === socketId &&
          p.type === "property" &&
          p.color &&
          !p.hasHotel &&
          !p.mortgaged &&
          ownsFullGroup(p.color, socketId, state.properties)
      )
    : [];

  // Sellable buildings (any time for cash)
  const sellable = Object.values(state.properties).filter(
    (p) =>
      p.ownerId === socketId &&
      p.type === "property" &&
      (p.hasHotel || p.houseCount > 0)
  );

  // Mortgageable properties (no buildings, not mortgaged)
  const mortgageable = Object.values(state.properties).filter(
    (p) =>
      p.ownerId === socketId &&
      !p.mortgaged &&
      !p.hasHotel &&
      p.houseCount === 0
  );

  // Unmortgageable properties
  const unmortgageable = Object.values(state.properties).filter(
    (p) => p.ownerId === socketId && p.mortgaged
  );

  const hasAnyPropertyActions = sellable.length > 0 || mortgageable.length > 0 || unmortgageable.length > 0;

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
                {p.getOutOfJailFreeCards > 0 && !p.bankrupt && (
                  <span className="rounded-full bg-green-900 px-1.5 py-0.5 text-[10px] text-green-400">
                    🃏×{p.getOutOfJailFreeCards}
                  </span>
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

      {/* Supply tracker */}
      <div className="flex gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-400">
        <span>🏠 {state.housesRemaining} left</span>
        <span className="mx-1 text-gray-700">|</span>
        <span>🏨 {state.hotelsRemaining} left</span>
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

      {/* Jail controls */}
      {isRollingPhase && inJail && myPlayer && (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-400">In Jail</p>
          <div className="flex flex-col gap-1.5">
            {myPlayer.getOutOfJailFreeCards > 0 && (
              <button
                onClick={onUseGojf}
                className="w-full rounded-xl bg-green-700 py-2 text-xs font-bold hover:bg-green-600 active:scale-95 transition-all"
              >
                Use Get Out of Jail Free Card
              </button>
            )}
            {myPlayer.cash >= 50 && (
              <button
                onClick={onPayJailFine}
                className="w-full rounded-xl bg-yellow-700 py-2 text-xs font-bold hover:bg-yellow-600 active:scale-95 transition-all"
              >
                Pay $50 Fine
              </button>
            )}
            <p className="text-center text-xs text-gray-500">
              Or roll doubles to escape (turn {myPlayer.jailTurns}/3)
            </p>
          </div>
        </div>
      )}

      {/* Build section */}
      {buildable.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Build</p>
          <div className="flex flex-col gap-1.5">
            {buildable.map((p: PropertyOwnership) => {
              const colorHex = p.color ? PROPERTY_COLORS[p.color] : "#374151";
              const cost = houseCostFor(p.color!);
              const label = p.houseCount < 4 ? `House ($${cost})` : `Hotel ($${cost})`;
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

      {/* Property management (sell / mortgage / unmortgage) */}
      {hasAnyPropertyActions && myPlayer && !myPlayer.bankrupt && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Properties</p>
          <div className="flex flex-col gap-1.5">
            {sellable.map((p: PropertyOwnership) => {
              const colorHex = p.color ? PROPERTY_COLORS[p.color] : "#374151";
              const cost = houseCostFor(p.color!);
              const sellValue = Math.floor(cost / 2);
              return (
                <div key={`sell-${p.spaceIndex}`} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorHex }} />
                    <span className="text-xs text-gray-300 truncate">{p.name}</span>
                    <span className="text-[10px] text-gray-500">
                      {p.hasHotel ? "🏨" : `${p.houseCount}⌂`}
                    </span>
                  </div>
                  <button
                    onClick={() => onSellBuilding(p.spaceIndex)}
                    className="shrink-0 rounded-lg bg-red-800 px-2 py-1 text-[10px] font-bold hover:bg-red-700 active:scale-95 transition-all"
                  >
                    Sell +${sellValue}
                  </button>
                </div>
              );
            })}
            {mortgageable.map((p: PropertyOwnership) => {
              const mortgageValue = Math.floor(p.price / 2);
              return (
                <div key={`mtg-${p.spaceIndex}`} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-300 truncate">{p.name}</span>
                  </div>
                  <button
                    onClick={() => onMortgage(p.spaceIndex)}
                    className="shrink-0 rounded-lg bg-orange-800 px-2 py-1 text-[10px] font-bold hover:bg-orange-700 active:scale-95 transition-all"
                  >
                    Mortgage +${mortgageValue}
                  </button>
                </div>
              );
            })}
            {unmortgageable.map((p: PropertyOwnership) => {
              const cost = Math.ceil(p.price / 2 * 1.1);
              const canAfford = (myPlayer?.cash ?? 0) >= cost;
              return (
                <div key={`unmtg-${p.spaceIndex}`} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 truncate line-through">{p.name}</span>
                    <span className="text-[10px] text-orange-500">mortgaged</span>
                  </div>
                  <button
                    onClick={() => onUnmortgage(p.spaceIndex)}
                    disabled={!canAfford}
                    className="shrink-0 rounded-lg bg-blue-800 px-2 py-1 text-[10px] font-bold hover:bg-blue-700 disabled:opacity-40 active:scale-95 transition-all"
                  >
                    Lift -${cost}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main actions */}
      {isMyTurn && state.phase !== "gameover" && state.phase !== "auction" && (
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

      {/* Trade button */}
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
