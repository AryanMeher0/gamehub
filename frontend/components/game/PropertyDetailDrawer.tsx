"use client";

import { GameState, PropertyOwnership } from "@/types/game";
import {
  BOARD, PROPERTY_COLORS, COLOR_LABELS, COLOR_GROUPS,
  RENT_TABLE, RAILROAD_INDICES, UTILITY_INDICES, FULL_NAMES,
} from "@/lib/board";

interface Props {
  spaceIndex: number;
  state: GameState;
  onClose: () => void;
}

function buildingDisplay(ownership: PropertyOwnership): string {
  if (ownership.hasHotel) return "🏨 Hotel";
  if (ownership.houseCount > 0) return `${"🏠".repeat(ownership.houseCount)} (${ownership.houseCount}/4)`;
  return "No buildings";
}

export default function PropertyDetailDrawer({ spaceIndex, state, onClose }: Props) {
  const space = BOARD[spaceIndex];
  if (!space) return null;

  const ownership: PropertyOwnership | undefined = state.properties[spaceIndex];
  const colorHex = space.color ? PROPERTY_COLORS[space.color] : null;
  const colorLabel = space.color ? COLOR_LABELS[space.color] : null;
  const fullName = FULL_NAMES[spaceIndex] ?? space.name;

  const owner = ownership ? state.players[ownership.ownerId] : null;

  // Group ownership progress
  let groupIndices: number[] = [];
  if (space.color) {
    groupIndices = COLOR_GROUPS[space.color] ?? [];
  }
  const isMonopoly = groupIndices.length > 0 &&
    groupIndices.every((i) => state.properties[i]?.ownerId === ownership?.ownerId);

  // Rent table for color properties
  const rentRow = RENT_TABLE[spaceIndex];

  // Railroad rent scale
  const isRailroad = space.type === "railroad";
  const isUtility = space.type === "utility";

  // How many railroads / utilities does the owner have?
  let ownerRailroadCount = 0;
  let ownerUtilityCount = 0;
  if (ownership) {
    ownerRailroadCount = RAILROAD_INDICES.filter(i => state.properties[i]?.ownerId === ownership.ownerId).length;
    ownerUtilityCount = UTILITY_INDICES.filter(i => state.properties[i]?.ownerId === ownership.ownerId).length;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 px-2 pb-2 sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color header */}
        {colorHex ? (
          <div className="relative h-16 flex items-end px-5 pb-3" style={{ backgroundColor: colorHex }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6))" }} />
            <div className="relative z-10 flex items-center justify-between w-full">
              <span className="text-xs font-bold uppercase tracking-wider text-white/80">{colorLabel}</span>
              {isMonopoly && ownership && (
                <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-yellow-950">MONOPOLY</span>
              )}
            </div>
          </div>
        ) : (
          <div className={`h-10 flex items-center px-5 ${
            isRailroad ? "bg-gray-800" : isUtility ? "bg-slate-700" :
            space.type === "tax" ? "bg-gray-700" : "bg-green-900"
          }`}>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {isRailroad ? "Railway" : isUtility ? "Utility" : space.type.replace(/_/g, " ")}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-4 p-5">
          {/* Name + close */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-black leading-tight text-white">{fullName}</h2>
            <button
              onClick={onClose}
              className="mt-0.5 shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Owner */}
          {ownership ? (
            <div className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3">
              {owner && (
                <div className="h-3 w-3 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: owner.color }} />
              )}
              <span className="text-sm text-gray-300">
                Owned by <span className="font-bold text-white">{owner?.name ?? "Unknown"}</span>
              </span>
              {ownership.mortgaged && (
                <span className="ml-auto rounded-full bg-orange-900 px-2 py-0.5 text-[10px] font-bold text-orange-300">MORTGAGED</span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-gray-900 px-4 py-3">
              <span className="text-sm text-gray-400">Unowned</span>
              {space.price && <span className="text-sm font-bold text-green-400">Buy for ${space.price}</span>}
            </div>
          )}

          {/* Price + mortgage */}
          {space.price && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-900 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Price</p>
                <p className="text-lg font-black text-white">${space.price}</p>
              </div>
              <div className="rounded-xl bg-gray-900 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Mortgage Value</p>
                <p className="text-lg font-black text-orange-400">${Math.floor(space.price / 2)}</p>
              </div>
            </div>
          )}

          {/* Color property rent table */}
          {rentRow && space.type === "property" && (
            <div className="rounded-xl bg-gray-900 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Rent Schedule</p>
              </div>
              {ownership && (
                <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                  <span className="text-xs text-gray-400">Buildings:</span>
                  <span className="text-xs font-semibold text-white">{buildingDisplay(ownership)}</span>
                </div>
              )}
              <div className="divide-y divide-gray-800/60">
                {[
                  { label: "Base rent",   value: rentRow[0],  highlight: !ownership || (!ownership.hasHotel && ownership.houseCount === 0) },
                  { label: "1 house",     value: rentRow[1],  highlight: ownership?.houseCount === 1 && !ownership.hasHotel },
                  { label: "2 houses",    value: rentRow[2],  highlight: ownership?.houseCount === 2 && !ownership.hasHotel },
                  { label: "3 houses",    value: rentRow[3],  highlight: ownership?.houseCount === 3 && !ownership.hasHotel },
                  { label: "4 houses",    value: rentRow[4],  highlight: ownership?.houseCount === 4 && !ownership.hasHotel },
                  { label: "Hotel",       value: rentRow[5],  highlight: ownership?.hasHotel === true },
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between px-4 py-2 ${highlight ? "bg-indigo-900/40" : ""}`}
                  >
                    <span className={`text-xs ${highlight ? "font-bold text-white" : "text-gray-400"}`}>{label}</span>
                    <span className={`text-xs font-bold ${highlight ? "text-yellow-300" : "text-gray-300"}`}>${value}</span>
                  </div>
                ))}
              </div>
              {isMonopoly && ownership && !ownership.hasHotel && ownership.houseCount === 0 && (
                <div className="px-4 py-2 border-t border-gray-800 bg-yellow-900/20">
                  <p className="text-[10px] text-yellow-400">Monopoly — base rent doubled to ${rentRow[0] * 2}</p>
                </div>
              )}
            </div>
          )}

          {/* Railroad rent */}
          {isRailroad && (
            <div className="rounded-xl bg-gray-900 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Railway Fare</p>
              </div>
              <div className="divide-y divide-gray-800/60">
                {[
                  { label: "1 Railway owned", value: 25,  active: ownerRailroadCount === 1 },
                  { label: "2 Railways owned", value: 50,  active: ownerRailroadCount === 2 },
                  { label: "3 Railways owned", value: 100, active: ownerRailroadCount === 3 },
                  { label: "4 Railways owned", value: 200, active: ownerRailroadCount === 4 },
                ].map(({ label, value, active }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between px-4 py-2 ${active ? "bg-indigo-900/40" : ""}`}
                  >
                    <span className={`text-xs ${active ? "font-bold text-white" : "text-gray-400"}`}>{label}</span>
                    <span className={`text-xs font-bold ${active ? "text-yellow-300" : "text-gray-300"}`}>${value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Utility rent */}
          {isUtility && (
            <div className="rounded-xl bg-gray-900 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Utility Rate</p>
              </div>
              <div className="divide-y divide-gray-800/60">
                {[
                  { label: "1 Utility owned", mult: 4,  active: ownerUtilityCount === 1 },
                  { label: "2 Utilities owned", mult: 10, active: ownerUtilityCount === 2 },
                ].map(({ label, mult, active }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between px-4 py-2 ${active ? "bg-indigo-900/40" : ""}`}
                  >
                    <span className={`text-xs ${active ? "font-bold text-white" : "text-gray-400"}`}>{label}</span>
                    <span className={`text-xs font-bold ${active ? "text-yellow-300" : "text-gray-300"}`}>{mult}× dice</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Color group progress */}
          {groupIndices.length > 0 && (
            <div className="rounded-xl bg-gray-900 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {colorLabel} Group
                </p>
                {ownership && (
                  <span className="text-[10px] text-gray-500">
                    {groupIndices.filter(i => state.properties[i]?.ownerId === ownership.ownerId).length}/{groupIndices.length} owned
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-800/60">
                {groupIndices.map((idx) => {
                  const prop = state.properties[idx];
                  const propOwner = prop ? state.players[prop.ownerId] : null;
                  const propName = FULL_NAMES[idx] ?? BOARD[idx]?.name ?? `Space ${idx}`;
                  const isThis = idx === spaceIndex;
                  const owned = !!prop;
                  return (
                    <div key={idx} className={`flex items-center gap-2 px-4 py-2.5 ${isThis ? "bg-gray-800/60" : ""}`}>
                      <span className={`text-sm ${owned ? "text-green-400" : "text-gray-600"}`}>
                        {owned ? "✓" : "✗"}
                      </span>
                      <span className={`flex-1 text-xs ${isThis ? "font-bold text-white" : owned ? "text-gray-200" : "text-gray-500"}`}>
                        {propName}
                        {isThis && <span className="ml-1 text-gray-500">(this)</span>}
                      </span>
                      {propOwner && (
                        <div
                          className="h-2.5 w-2.5 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: propOwner.color }}
                          title={propOwner.name}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
