"use client";

import { GameState, TradeOffer } from "@/types/game";
import { PROPERTY_COLORS } from "@/lib/board";

interface Props {
  trade: TradeOffer;
  state: GameState;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingTradeModal({ trade, state, onAccept, onReject }: Props) {
  const from = state.players[trade.fromId];
  const to   = state.players[trade.toId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
        <div className="border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-black text-white">Incoming Trade Offer</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            <span className="font-semibold text-white">{from?.name}</span> wants to trade with you
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {/* They offer */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">They Offer</p>
            {trade.offeredCash > 0 && (
              <p className="mb-1 text-sm font-bold text-green-400">${trade.offeredCash}</p>
            )}
            {trade.offeredPropertyIndices.map((idx) => {
              const prop = state.properties[idx];
              if (!prop) return null;
              const colorHex = prop.color ? PROPERTY_COLORS[prop.color] : "#374151";
              return (
                <div key={idx} className="flex items-center gap-1.5 py-0.5">
                  <div className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: colorHex }} />
                  <span className="text-xs text-gray-200 truncate">{prop.name}</span>
                  {prop.hasHotel && <span className="text-[9px]">🏨</span>}
                  {!prop.hasHotel && prop.houseCount > 0 && (
                    <span className="text-[9px] text-green-400">{prop.houseCount}⌂</span>
                  )}
                </div>
              );
            })}
            {trade.offeredCash === 0 && trade.offeredPropertyIndices.length === 0 && (
              <p className="text-xs italic text-gray-600">Nothing</p>
            )}
          </div>

          {/* They want */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">They Want</p>
            {trade.requestedCash > 0 && (
              <p className="mb-1 text-sm font-bold text-red-400">${trade.requestedCash}</p>
            )}
            {trade.requestedPropertyIndices.map((idx) => {
              const prop = state.properties[idx];
              if (!prop) return null;
              const colorHex = prop.color ? PROPERTY_COLORS[prop.color] : "#374151";
              return (
                <div key={idx} className="flex items-center gap-1.5 py-0.5">
                  <div className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: colorHex }} />
                  <span className="text-xs text-gray-200 truncate">{prop.name}</span>
                  {prop.hasHotel && <span className="text-[9px]">🏨</span>}
                  {!prop.hasHotel && prop.houseCount > 0 && (
                    <span className="text-[9px] text-green-400">{prop.houseCount}⌂</span>
                  )}
                </div>
              );
            })}
            {trade.requestedCash === 0 && trade.requestedPropertyIndices.length === 0 && (
              <p className="text-xs italic text-gray-600">Nothing</p>
            )}
          </div>
        </div>

        {/* Your balances for reference */}
        <div className="mx-6 mb-4 rounded-xl bg-gray-800 px-4 py-2 text-xs text-gray-400 flex justify-between">
          <span>{from?.name}: <span className="font-bold text-white">${from?.cash}</span></span>
          <span>{to?.name}: <span className="font-bold text-white">${to?.cash}</span></span>
        </div>

        <div className="flex gap-3 border-t border-gray-800 px-6 py-4">
          <button
            onClick={onReject}
            className="flex-1 rounded-xl bg-red-900 py-3 text-sm font-bold text-red-300 hover:bg-red-800 active:scale-95 transition-all"
          >
            ✕ Reject
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-xl bg-green-700 py-3 text-sm font-bold hover:bg-green-600 active:scale-95 transition-all"
          >
            ✓ Accept
          </button>
        </div>
      </div>
    </div>
  );
}
