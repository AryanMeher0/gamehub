"use client";

import { useState } from "react";
import { GameState, GamePlayer, PropertyOwnership } from "@/types/game";
import { PROPERTY_COLORS } from "@/lib/board";

interface Props {
  state: GameState;
  socketId: string;
  onSend: (payload: {
    toId: string;
    offeredCash: number;
    requestedCash: number;
    offeredPropertyIndices: number[];
    requestedPropertyIndices: number[];
  }) => void;
  onClose: () => void;
}

export default function TradeModal({ state, socketId, onSend, onClose }: Props) {
  const myPlayer = state.players[socketId];
  const activePlayers = Object.values(state.players).filter(
    (p) => p.id !== socketId && !p.bankrupt
  );

  const [toId, setToId] = useState<string>(activePlayers[0]?.id ?? "");
  const [offeredCash, setOfferedCash] = useState(0);
  const [requestedCash, setRequestedCash] = useState(0);
  const [offeredProps, setOfferedProps] = useState<number[]>([]);
  const [requestedProps, setRequestedProps] = useState<number[]>([]);

  const myProperties = Object.values(state.properties).filter((p) => p.ownerId === socketId);
  const theirProperties = Object.values(state.properties).filter((p) => p.ownerId === toId);

  function toggleProp(idx: number, mine: boolean) {
    if (mine) {
      setOfferedProps((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      );
    } else {
      setRequestedProps((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      );
    }
  }

  function handleTargetChange(id: string) {
    setToId(id);
    setRequestedProps([]);
  }

  function handleSend() {
    if (!toId) return;
    onSend({ toId, offeredCash, requestedCash, offeredPropertyIndices: offeredProps, requestedPropertyIndices: requestedProps });
  }

  const targetPlayer = state.players[toId];
  const hasSomething = offeredCash > 0 || requestedCash > 0 || offeredProps.length > 0 || requestedProps.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-black text-white">Propose Trade</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto max-h-[70vh] px-6 py-5">
          {/* Target player */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Trade With</p>
            <div className="flex flex-col gap-1.5">
              {activePlayers.map((p: GamePlayer) => (
                <button
                  key={p.id}
                  onClick={() => handleTargetChange(p.id)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-left transition-all ${
                    toId === p.id
                      ? "border-indigo-500 bg-indigo-950 ring-1 ring-indigo-500"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  <span className="ml-auto text-xs text-green-400">${p.cash}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Your offer */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">You Offer</p>
              <div className="mb-2">
                <label className="text-xs text-gray-400">Cash</label>
                <input
                  type="number"
                  min={0}
                  max={myPlayer?.cash ?? 0}
                  value={offeredCash}
                  onChange={(e) => setOfferedCash(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {myProperties.length > 0 && (
                <div className="flex flex-col gap-1">
                  {myProperties.map((p: PropertyOwnership) => (
                    <PropertyChip
                      key={p.spaceIndex}
                      prop={p}
                      selected={offeredProps.includes(p.spaceIndex)}
                      onToggle={() => toggleProp(p.spaceIndex, true)}
                    />
                  ))}
                </div>
              )}
              {myProperties.length === 0 && (
                <p className="text-xs text-gray-600 italic">No properties</p>
              )}
            </div>

            {/* You request */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                You Request
              </p>
              <div className="mb-2">
                <label className="text-xs text-gray-400">Cash</label>
                <input
                  type="number"
                  min={0}
                  max={targetPlayer?.cash ?? 0}
                  value={requestedCash}
                  onChange={(e) => setRequestedCash(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {theirProperties.length > 0 && (
                <div className="flex flex-col gap-1">
                  {theirProperties.map((p: PropertyOwnership) => (
                    <PropertyChip
                      key={p.spaceIndex}
                      prop={p}
                      selected={requestedProps.includes(p.spaceIndex)}
                      onToggle={() => toggleProp(p.spaceIndex, false)}
                    />
                  ))}
                </div>
              )}
              {theirProperties.length === 0 && (
                <p className="text-xs text-gray-600 italic">No properties</p>
              )}
            </div>
          </div>

          {/* Summary */}
          {hasSomething && targetPlayer && (
            <div className="rounded-xl bg-gray-800 px-4 py-3 text-xs text-gray-300 leading-relaxed">
              <span className="font-bold text-white">Summary: </span>
              You give {offeredProps.map((i) => state.properties[i]?.name).join(", ") || (offeredCash > 0 ? "" : "nothing")}
              {offeredCash > 0 && (offeredProps.length > 0 ? ` + $${offeredCash}` : `$${offeredCash}`)}
              {" → "}
              {requestedProps.map((i) => state.properties[i]?.name).join(", ") || (requestedCash > 0 ? "" : "nothing")}
              {requestedCash > 0 && (requestedProps.length > 0 ? ` + $${requestedCash}` : `$${requestedCash}`)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-800 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-gray-700 py-3 text-sm font-bold hover:bg-gray-600 active:scale-95 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!toId || !hasSomething}
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition-all"
          >
            Send Offer
          </button>
        </div>
      </div>
    </div>
  );
}

function PropertyChip({
  prop,
  selected,
  onToggle,
}: {
  prop: PropertyOwnership;
  selected: boolean;
  onToggle: () => void;
}) {
  const colorHex = prop.color ? PROPERTY_COLORS[prop.color] : "#374151";
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all ${
        selected
          ? "border-indigo-500 bg-indigo-950 ring-1 ring-indigo-500"
          : "border-gray-700 bg-gray-800 hover:border-gray-600"
      }`}
    >
      <div className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: colorHex }} />
      <span className="truncate text-gray-200">{prop.name}</span>
      {prop.hasHotel && <span className="text-[9px]">🏨</span>}
      {!prop.hasHotel && prop.houseCount > 0 && (
        <span className="text-[9px] text-green-400">{prop.houseCount}⌂</span>
      )}
      {selected && <span className="ml-auto text-indigo-400">✓</span>}
    </button>
  );
}
