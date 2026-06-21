"use client";

import { GameState, GamePlayer } from "@/types/game";
import { BOARD, PROPERTY_COLORS } from "@/lib/board";

interface Props {
  state: GameState;
  socketId: string;
  onBuy: () => void;
  onSkip: () => void;
}

export default function PropertyModal({ state, socketId, onBuy, onSkip }: Props) {
  const currentId = state.turnOrder[state.currentTurnIndex];
  const isMyTurn = currentId === socketId;
  const player: GamePlayer = state.players[currentId];
  if (!player) return null;

  const space = BOARD[player.position];
  if (!space || !space.price) return null;

  const colorHex = space.color ? PROPERTY_COLORS[space.color] : null;
  const canAfford = player.cash >= space.price;
  const waitingPlayer = state.players[currentId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
        {/* Color bar */}
        {colorHex && (
          <div className="h-3 w-full" style={{ backgroundColor: colorHex }} />
        )}

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              {isMyTurn ? "Property Available" : `${waitingPlayer?.name} is deciding...`}
            </p>
            <h2 className="text-2xl font-black text-white">{space.name}</h2>
            {space.color && (
              <span
                className="mt-1 rounded-full px-3 py-0.5 text-xs font-semibold capitalize text-white"
                style={{ backgroundColor: colorHex ?? "#374151" }}
              >
                {space.color}
              </span>
            )}
            {(space.type === "railroad") && (
              <span className="mt-1 rounded-full bg-gray-700 px-3 py-0.5 text-xs text-gray-300">Railroad</span>
            )}
            {(space.type === "utility") && (
              <span className="mt-1 rounded-full bg-gray-700 px-3 py-0.5 text-xs text-gray-300">Utility</span>
            )}
          </div>

          {/* Property stats */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-800 p-4">
            <div className="text-center">
              <p className="text-xs text-gray-500">Price</p>
              <p className="text-lg font-bold text-white">${space.price}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Rent</p>
              <p className="text-lg font-bold text-yellow-400">${space.rent}</p>
            </div>
          </div>

          {/* Player's cash */}
          <div className="flex items-center justify-between rounded-xl bg-gray-800 px-4 py-3">
            <span className="text-sm text-gray-400">
              {isMyTurn ? "Your cash" : `${waitingPlayer?.name}'s cash`}
            </span>
            <span className={`text-sm font-bold ${canAfford || !isMyTurn ? "text-green-400" : "text-red-400"}`}>
              ${player.cash}
            </span>
          </div>

          {!canAfford && isMyTurn && (
            <p className="text-center text-xs text-red-400">Not enough cash to purchase.</p>
          )}

          {/* Buttons — only shown to the active player */}
          {isMyTurn ? (
            <div className="flex gap-3">
              <button
                onClick={onBuy}
                disabled={!canAfford}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition-all"
              >
                Buy
              </button>
              <button
                onClick={onSkip}
                className="flex-1 rounded-xl bg-gray-700 py-3 font-bold hover:bg-gray-600 active:scale-95 transition-all"
              >
                Skip
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500 animate-pulse">Waiting for decision...</p>
          )}
        </div>
      </div>
    </div>
  );
}
