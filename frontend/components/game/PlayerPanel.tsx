"use client";

import { useState, useEffect, useRef } from "react";
import { GameState, GamePlayer, PropertyOwnership } from "@/types/game";
import { PROPERTY_COLORS, COLOR_GROUPS, COLOR_LABELS, RAILROAD_INDICES, UTILITY_INDICES, FULL_NAMES, BOARD } from "@/lib/board";

const COLOR_ORDER = ["brown", "lightblue", "pink", "orange", "red", "yellow", "green", "darkblue"];

function netWorth(player: GamePlayer, properties: Record<number, PropertyOwnership>): number {
  let worth = player.cash;
  for (const prop of Object.values(properties)) {
    if (prop.ownerId !== player.id) continue;
    worth += prop.mortgaged ? Math.floor(prop.price / 2) : prop.price;
    if (prop.type === "property" && prop.color) {
      const hcost = { brown: 50, lightblue: 50, pink: 100, orange: 100, red: 150, yellow: 150, green: 200, darkblue: 200 }[prop.color] ?? 0;
      worth += prop.hasHotel ? hcost * 4 : prop.houseCount * hcost;
    }
  }
  return worth;
}

function ownsFullGroup(color: string, ownerId: string, properties: Record<number, PropertyOwnership>): boolean {
  return (COLOR_GROUPS[color] ?? []).every((i) => properties[i]?.ownerId === ownerId);
}

// ─── Property Carousel ────────────────────────────────────────────────────────

function PropertyCarousel({
  props: ownedProps,
  state,
  onSelect,
}: {
  props: PropertyOwnership[];
  state: GameState;
  onSelect: (idx: number) => void;
}) {
  const [cursor, setCursor] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const total = ownedProps.length;
  const current = ownedProps[cursor];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setCursor((c) => (c - 1 + total) % total);
      if (e.key === "ArrowRight") setCursor((c) => (c + 1) % total);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  if (!current) return null;

  const space = BOARD[current.spaceIndex];
  const colorHex = current.color ? PROPERTY_COLORS[current.color] : null;
  const fullName = FULL_NAMES[current.spaceIndex] ?? current.name;
  const isMonopoly = current.color ? ownsFullGroup(current.color, current.ownerId, state.properties) : false;

  return (
    <div className="rounded-xl overflow-hidden select-none" style={{ background: "rgba(0,0,0,0.40)", border: "1px solid rgba(255,255,255,0.05)" }}>
      {/* Color bar */}
      {colorHex && <div className="h-1.5 w-full" style={{ backgroundColor: colorHex }} />}

      <div
        className="p-3 cursor-pointer"
        onClick={() => onSelect(current.spaceIndex)}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const diff = touchStartX.current - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 40) {
            setCursor(diff > 0 ? (cursor + 1) % total : (cursor - 1 + total) % total);
          }
          touchStartX.current = null;
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-xs font-black text-white leading-snug">{fullName}</p>
            {current.color && (
              <span className="text-[10px] text-green-800 capitalize">{COLOR_LABELS[current.color]}</span>
            )}
            {space?.type === "railroad" && <span className="text-[10px] text-green-800">Railway</span>}
            {space?.type === "utility" && <span className="text-[10px] text-green-800">Utility</span>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {isMonopoly && (
              <span className="rounded-full bg-yellow-400/20 border border-yellow-400/40 px-1.5 py-0.5 text-[9px] font-bold text-yellow-300">MONOPOLY</span>
            )}
            {current.mortgaged && (
              <span className="rounded-full bg-orange-900/50 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">MORTGAGED</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-green-800">
          <span>Rent: <span className="font-bold text-yellow-400">${current.rent}</span></span>
          <span>
            {current.hasHotel ? "🏨" : current.houseCount > 0 ? `${"🏠".repeat(current.houseCount)}` : ""}
            {current.houseCount === 0 && !current.hasHotel && "No buildings"}
          </span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between px-2 py-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <button
          onClick={(e) => { e.stopPropagation(); setCursor((cursor - 1 + total) % total); }}
          className="rounded-lg px-2.5 py-1 text-xs font-bold text-green-800 hover:text-green-400 transition-all"
        >
          ‹ Prev
        </button>
        <span className="text-[10px] text-green-900">{cursor + 1} / {total}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setCursor((cursor + 1) % total); }}
          className="rounded-lg px-2.5 py-1 text-xs font-bold text-green-800 hover:text-green-400 transition-all"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

// ─── Player Portfolio Card ────────────────────────────────────────────────────

function PlayerPortfolio({
  player,
  state,
  isMe,
  isCurrentTurn,
  onPropertyClick,
}: {
  player: GamePlayer;
  state: GameState;
  isMe: boolean;
  isCurrentTurn: boolean;
  onPropertyClick: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(isMe);

  const myProps = Object.values(state.properties).filter((p) => p.ownerId === player.id);
  const colorProps = myProps.filter((p) => p.type === "property" && p.color);
  const railroads = myProps.filter((p) => p.type === "railroad");
  const utilities = myProps.filter((p) => p.type === "utility");
  const mortgagedCount = myProps.filter((p) => p.mortgaged).length;
  const worth = netWorth(player, state.properties);

  const monopolyColors = COLOR_ORDER.filter((c) => ownsFullGroup(c, player.id, state.properties));

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all`}
      style={{
        background: player.bankrupt ? "rgba(0,0,0,0.15)" : isCurrentTurn ? "rgba(20,60,100,0.35)" : "rgba(0,0,0,0.35)",
        border: isCurrentTurn ? "1px solid rgba(99,132,200,0.40)" : player.bankrupt ? "1px solid rgba(255,255,255,0.03)" : "1px solid rgba(255,255,255,0.05)",
        opacity: player.bankrupt ? 0.5 : 1,
      }}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div
          className="h-3.5 w-3.5 rounded-full border border-white/30 shrink-0"
          style={{ backgroundColor: player.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-bold truncate ${player.bankrupt ? "line-through text-green-900" : "text-white"}`}>
              {player.name}
            </span>
            {isMe && (
              <span className="rounded-full bg-green-900/40 border border-green-800/30 px-1.5 py-0.5 text-[9px] text-green-700">You</span>
            )}
            {player.isBot && !player.bankrupt && (
              <span className="rounded-full bg-sky-900 px-1.5 py-0.5 text-[9px] text-sky-400">BOT</span>
            )}
            {player.inJail && !player.bankrupt && (
              <span className="rounded-full bg-red-900 px-1.5 py-0.5 text-[9px] text-red-400">Jail</span>
            )}
            {player.bankrupt && (
              <span className="rounded-full bg-black/30 border border-white/5 px-1.5 py-0.5 text-[9px] text-green-900">Bankrupt</span>
            )}
            {isCurrentTurn && !player.bankrupt && (
              <span className="rounded-full bg-blue-900/60 border border-blue-700/40 px-1.5 py-0.5 text-[9px] text-blue-300">● Turn</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-bold text-green-400">${player.cash}</span>
            <span className="text-[10px] text-green-900">·</span>
            <span className="text-[10px] text-green-800">NW: ${worth.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mini color dots for monopolies */}
          {monopolyColors.map((c) => (
            <div
              key={c}
              className="h-2.5 w-2.5 rounded-full border border-white/20"
              style={{ backgroundColor: PROPERTY_COLORS[c] }}
              title={COLOR_LABELS[c]}
            />
          ))}
          <span className="text-green-900 text-xs ml-1">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded portfolio */}
      {expanded && !player.bankrupt && (
        <div className="px-3 pb-3 pt-2 flex flex-col gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(0,0,0,0.30)" }}>
              <p className="text-[9px] text-green-800 uppercase">Props</p>
              <p className="text-xs font-bold text-white">{myProps.length}</p>
            </div>
            <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(0,0,0,0.30)" }}>
              <p className="text-[9px] text-green-800 uppercase">Monop.</p>
              <p className="text-xs font-bold text-yellow-400">{monopolyColors.length}</p>
            </div>
            <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(0,0,0,0.30)" }}>
              <p className="text-[9px] text-green-800 uppercase">Mortgd</p>
              <p className="text-xs font-bold text-orange-400">{mortgagedCount}</p>
            </div>
          </div>

          {/* GOJF cards */}
          {(player.getOutOfJailFreeCards ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <span>🃏</span>
              <span>{player.getOutOfJailFreeCards} × Get Out of Jail Free</span>
            </div>
          )}

          {/* Color groups */}
          {myProps.length > 0 && (
            <div className="flex flex-col gap-2">
              {/* Color property groups */}
              {COLOR_ORDER.map((color) => {
                const group = COLOR_GROUPS[color] ?? [];
                const owned = group.filter((i) => state.properties[i]?.ownerId === player.id);
                if (owned.length === 0) return null;
                const isFullSet = owned.length === group.length;
                return (
                  <div key={color}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: PROPERTY_COLORS[color] }} />
                      <span className="text-[10px] font-semibold text-green-700">{COLOR_LABELS[color]}</span>
                      <span className="text-[10px] text-green-900">{owned.length}/{group.length}</span>
                      {isFullSet && <span className="text-[9px] font-black text-yellow-400">★</span>}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {owned.map((idx) => {
                        const p = state.properties[idx];
                        if (!p) return null;
                        const name = FULL_NAMES[idx] ?? p.name;
                        return (
                          <button
                            key={idx}
                            onClick={() => onPropertyClick(idx)}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 active:scale-[0.98] transition-all text-left hover:brightness-125"
                          >
                            <div className="flex items-center gap-1.5">
                              {p.mortgaged && <span className="text-[9px] text-orange-400">MTG</span>}
                              <span className="text-[10px] text-gray-200 truncate">{name}</span>
                            </div>
                            <span className="text-[10px] text-green-800 shrink-0">
                              {p.hasHotel ? "🏨" : p.houseCount > 0 ? `${p.houseCount}🏠` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Railroads */}
              {railroads.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-green-800">🚂</span>
                    <span className="text-[10px] font-semibold text-green-700">Railways</span>
                    <span className="text-[10px] text-green-900">{railroads.length}/4</span>
                  </div>
                  {railroads.map((p) => (
                    <button
                      key={p.spaceIndex}
                      onClick={() => onPropertyClick(p.spaceIndex)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 active:scale-[0.98] transition-all mb-0.5 text-left hover:brightness-125"
                    >
                      <span className="text-[10px] text-gray-200">{FULL_NAMES[p.spaceIndex] ?? p.name}</span>
                      {p.mortgaged && <span className="text-[9px] text-orange-400">MTG</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Utilities */}
              {utilities.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-green-800">⚡</span>
                    <span className="text-[10px] font-semibold text-green-700">Utilities</span>
                    <span className="text-[10px] text-green-900">{utilities.length}/2</span>
                  </div>
                  {utilities.map((p) => (
                    <button
                      key={p.spaceIndex}
                      onClick={() => onPropertyClick(p.spaceIndex)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 active:scale-[0.98] transition-all mb-0.5 text-left hover:brightness-125"
                    >
                      <span className="text-[10px] text-gray-200">{FULL_NAMES[p.spaceIndex] ?? p.name}</span>
                      {p.mortgaged && <span className="text-[9px] text-orange-400">MTG</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {myProps.length === 0 && (
            <p className="text-[10px] text-green-900 italic text-center py-1">No properties owned.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main PlayerPanel ─────────────────────────────────────────────────────────

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
  onPropertyClick: (spaceIndex: number) => void;
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
  onPropertyClick,
}: Props) {
  const currentPlayerId = state.turnOrder[state.currentTurnIndex];
  const isMyTurn = currentPlayerId === socketId;
  const myPlayer = state.players[socketId];

  const isRollingPhase = isMyTurn && state.phase === "rolling";
  const isEndedPhase = isMyTurn && state.phase === "ended";
  const canManageProperties = isMyTurn && (state.phase === "rolling" || state.phase === "ended");
  const inJail = myPlayer?.inJail ?? false;

  // Properties I can act on
  const buildable = isEndedPhase
    ? Object.values(state.properties).filter(
        (p) =>
          p.ownerId === socketId &&
          p.type === "property" &&
          p.color &&
          !p.hasHotel &&
          !p.mortgaged &&
          (COLOR_GROUPS[p.color] ?? []).every((i) => state.properties[i]?.ownerId === socketId)
      )
    : [];

  const sellable = canManageProperties
    ? Object.values(state.properties).filter(
        (p) => p.ownerId === socketId && p.type === "property" && (p.hasHotel || p.houseCount > 0)
      )
    : [];

  const mortgageable = canManageProperties
    ? Object.values(state.properties).filter(
        (p) => p.ownerId === socketId && !p.mortgaged && !p.hasHotel && p.houseCount === 0
      )
    : [];

  const unmortgageable = canManageProperties
    ? Object.values(state.properties).filter((p) => p.ownerId === socketId && p.mortgaged)
    : [];

  const canTrade =
    !myPlayer?.bankrupt &&
    !state.gameOver &&
    Object.values(state.players).some((p) => p.id !== socketId && !p.bankrupt);

  // Player order: me first, then others by turn order
  const playerOrder = [
    socketId,
    ...state.turnOrder.filter((id) => id !== socketId),
  ].filter((id) => state.players[id]);

  // My owned props for carousel
  const myOwnedProps = Object.values(state.properties).filter((p) => p.ownerId === socketId);

  return (
    <div className="flex flex-col gap-3">
      {/* Dice result */}
      {state.lastRoll && (
        <div className="rounded-xl p-3 text-center" style={{ background: "rgba(0,0,0,0.40)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-[9px] font-black uppercase tracking-widest text-green-900">Last Roll</p>
          <div className="mt-1 flex items-center justify-center gap-3">
            <Die value={state.lastRoll.die1} />
            <Die value={state.lastRoll.die2} />
          </div>
          <p className="mt-1 text-sm font-bold text-white">
            = {state.lastRoll.total}
            {state.lastRoll.isDoubles && (
              <span className="ml-2 text-amber-400">Doubles!</span>
            )}
          </p>
        </div>
      )}

      {/* Supply tracker */}
      <div className="flex gap-2 rounded-xl px-3 py-2 text-xs text-green-800"
        style={{ background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <span>🏠 {state.housesRemaining} left</span>
        <span className="mx-1 text-green-900">|</span>
        <span>🏨 {state.hotelsRemaining} left</span>
      </div>

      {/* Turn indicator */}
      <div className="rounded-xl px-3 py-2 text-center" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.05)" }}>
        {isMyTurn ? (
          <p className="text-sm font-black text-green-300 turn-glow rounded-full">Your turn — {state.phase}</p>
        ) : (
          <p className="text-sm text-green-800">
            <span className="font-bold text-green-400">{state.players[currentPlayerId]?.name}</span>
            <span className="text-green-900 text-xs ml-1">({state.phase})</span>
          </p>
        )}
      </div>

      {/* Jail controls */}
      {isRollingPhase && inJail && myPlayer && (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-400">In Jail (Turn {myPlayer.jailTurns + 1}/3)</p>
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
            <p className="text-center text-xs text-green-800">Or roll for doubles to escape</p>
          </div>
        </div>
      )}

      {/* Build section */}
      {buildable.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-green-800">Build</p>
          <div className="flex flex-col gap-1.5">
            {buildable.map((p: PropertyOwnership) => {
              const colorHex = p.color ? PROPERTY_COLORS[p.color] : "#374151";
              const costs: Record<string, number> = { brown: 50, lightblue: 50, pink: 100, orange: 100, red: 150, yellow: 150, green: 200, darkblue: 200 };
              const cost = p.color ? (costs[p.color] ?? 100) : 100;
              const label = p.houseCount < 4 ? `House ($${cost})` : `Hotel ($${cost})`;
              return (
                <div key={p.spaceIndex} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorHex }} />
                    <span className="text-xs text-gray-300 truncate">{FULL_NAMES[p.spaceIndex] ?? p.name}</span>
                    {p.houseCount > 0 && <span className="text-[10px] text-green-800">{p.houseCount}🏠</span>}
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

      {/* Property management */}
      {(sellable.length > 0 || mortgageable.length > 0 || unmortgageable.length > 0) && myPlayer && !myPlayer.bankrupt && (
        <div className="rounded-xl p-3" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-green-800">Property Actions</p>
          <div className="flex flex-col gap-1.5">
            {sellable.map((p: PropertyOwnership) => {
              const costs: Record<string, number> = { brown: 50, lightblue: 50, pink: 100, orange: 100, red: 150, yellow: 150, green: 200, darkblue: 200 };
              const cost = p.color ? (costs[p.color] ?? 100) : 100;
              return (
                <div key={`sell-${p.spaceIndex}`} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {p.color && <div className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: PROPERTY_COLORS[p.color] }} />}
                    <span className="text-xs text-gray-300 truncate">{FULL_NAMES[p.spaceIndex] ?? p.name}</span>
                    <span className="text-[10px] text-green-800">{p.hasHotel ? "🏨" : `${p.houseCount}🏠`}</span>
                  </div>
                  <button
                    onClick={() => onSellBuilding(p.spaceIndex)}
                    className="shrink-0 rounded-lg bg-red-800 px-2 py-1 text-[10px] font-bold hover:bg-red-700 active:scale-95 transition-all"
                  >
                    Sell +${Math.floor(cost / 2)}
                  </button>
                </div>
              );
            })}
            {mortgageable.map((p: PropertyOwnership) => (
              <div key={`mtg-${p.spaceIndex}`} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-300 truncate">{FULL_NAMES[p.spaceIndex] ?? p.name}</span>
                <button
                  onClick={() => onMortgage(p.spaceIndex)}
                  className="shrink-0 rounded-lg bg-orange-800 px-2 py-1 text-[10px] font-bold hover:bg-orange-700 active:scale-95 transition-all"
                >
                  Mortgage +${Math.floor(p.price / 2)}
                </button>
              </div>
            ))}
            {unmortgageable.map((p: PropertyOwnership) => {
              const cost = Math.ceil(p.price / 2 * 1.1);
              const canAfford = (myPlayer?.cash ?? 0) >= cost;
              return (
                <div key={`unmtg-${p.spaceIndex}`} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-green-800 line-through truncate">{FULL_NAMES[p.spaceIndex] ?? p.name}</span>
                    <span className="text-[9px] text-orange-400">mtg</span>
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
            className="w-full rounded-xl bg-green-600 py-3 text-base font-black text-white hover:bg-green-500 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-95 shadow-lg shadow-green-900/50"
          >
            🎲 Roll Dice
          </button>
          <button
            onClick={onEndTurn}
            disabled={state.phase !== "ended"}
            className="w-full rounded-xl py-3 text-base font-black text-green-600 border border-green-900/40 hover:bg-green-900/20 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-95"
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

      {/* My property carousel */}
      {myOwnedProps.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-green-800 px-0.5">My Properties</p>
          <PropertyCarousel
            props={myOwnedProps}
            state={state}
            onSelect={onPropertyClick}
          />
        </div>
      )}

      {/* Player portfolio list */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-green-800 px-0.5">Players</p>
        <div className="flex flex-col gap-2">
          {playerOrder.map((id) => {
            const p = state.players[id];
            if (!p) return null;
            return (
              <PlayerPortfolio
                key={id}
                player={p}
                state={state}
                isMe={id === socketId}
                isCurrentTurn={id === currentPlayerId}
                onPropertyClick={onPropertyClick}
              />
            );
          })}
        </div>
      </div>
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
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-950"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      ))}
    </div>
  );
}
