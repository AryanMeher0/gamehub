"use client";

import { BoardSpace, GamePlayer, PropertyOwnership } from "@/types/game";
import { BOARD, PROPERTY_COLORS, getSpaceBg } from "@/lib/board";

// Grid: 7fr for corner columns/rows, 3fr for normal tile columns/rows.
// Total = 7 + 9*3 + 7 = 41fr per axis → board is square.
// Corners are naturally 7fr×7fr ≈ 2.3× the area of a normal tile.
const GRID = 11;
const COL_TEMPLATE = "7fr repeat(9, 3fr) 7fr";
const ROW_TEMPLATE = "7fr repeat(9, 3fr) 7fr";
// Center interior inset from each edge: 7/41 of board dimension
const CENTER_INSET = `calc(7 / 41 * 100%)`;

type Side = "south" | "north" | "west" | "east";

type Props = {
  players: Record<string, GamePlayer>;
  properties: Record<number, PropertyOwnership>;
  tokens?: Record<string, string>;
  onSpaceClick?: (spaceIndex: number) => void;
};

// Standard Monopoly corner positions (clockwise from GO):
// GO=0 (bottom-right), Jail=10 (bottom-left), FreePark=20 (top-left), GoJail=30 (top-right)
const CORNERS = {
  topLeft:    20, // Free Parking
  topRight:   30, // Go To Jail
  bottomLeft: 10, // Jail / Visiting
  bottomRight: 0, // GO
} as const;

function getPlayersOnSpace(index: number, players: Record<string, GamePlayer>): GamePlayer[] {
  return Object.values(players).filter((p) => p.position === index && !p.bankrupt);
}

function getCornerIndex(r: number, c: number): number | null {
  if (r === 0  && c === 0)  return CORNERS.topLeft;    // 20
  if (r === 0  && c === 10) return CORNERS.topRight;   // 30
  if (r === 10 && c === 0)  return CORNERS.bottomLeft; // 10
  if (r === 10 && c === 10) return CORNERS.bottomRight; // 0
  return null;
}

// Maps grid position → gameplay space index (0–39).
// Clockwise from GO at bottom-right:
//   Bottom row   (r=10, c=9→1):  indices  1– 9  (GO=0 at c=10, Jail=10 at c=0)
//   Left column  (c=0,  r=9→1):  indices 11–19  (Jail=10 at r=10, FreePark=20 at r=0)
//   Top row      (r=0,  c=1→9):  indices 21–29  (FreePark=20 at c=0, GoJail=30 at c=10)
//   Right column (c=10, r=1→9):  indices 31–39  (GoJail=30 at r=0, GO=0 at r=10)
function getSpaceIndex(r: number, c: number): number | null {
  const corner = getCornerIndex(r, c);
  if (corner !== null) return corner;

  if (r === 10 && c >= 1 && c <= 9) return 10 - c;   // c=9→1 … c=1→9
  if (c === 0  && r >= 1 && r <= 9) return 20 - r;   // r=9→11 … r=1→19
  if (r === 0  && c >= 1 && c <= 9) return 20 + c;   // c=1→21 … c=9→29
  if (c === 10 && r >= 1 && r <= 9) return 30 + r;   // r=1→31 … r=9→39

  return null;
}

function getSide(r: number, c: number): Side {
  if (r === 10) return "south";
  if (r === 0)  return "north";
  if (c === 0)  return "west";
  return "east";
}

function TileContent({
  space,
  players,
  ownership,
  ownerColor,
  onClick,
  isCorner,
  side,
  tokens,
}: {
  space: BoardSpace;
  players: GamePlayer[];
  ownership?: PropertyOwnership;
  ownerColor?: string;
  onClick?: () => void;
  isCorner: boolean;
  side?: Side;
  tokens?: Record<string, string>;
}) {
  const propertyColorHex = space.color ? PROPERTY_COLORS[space.color] : null;
  const isOwned = !!ownership;
  const isClickable = !!onClick;
  const showStrip = !!propertyColorHex && !isCorner;

  // Horizontal layout for left/right column tiles; vertical for top/bottom
  const isHorizontal = side === "west" || side === "east";
  // Strip faces board center:  south→top, north→bottom, west→right, east→left
  const stripFirst = side === "south" || side === "east" || (!side && !isCorner);
  const stripLast  = side === "north" || side === "west";

  const strip = showStrip ? (
    <div
      style={{
        backgroundColor: propertyColorHex!,
        flexShrink: 0,
        ...(isHorizontal
          ? { width: "28%", height: "100%" }
          : { height: "28%", width: "100%" }),
      }}
    />
  ) : null;

  const cornerLabel: Record<string, string> = {
    go:           "GO",
    visiting:     "JAIL\nJUST\nVISITING",
    free_parking: "FREE\nPARKING",
    go_to_jail:   "GO TO\nJAIL",
  };

  const cornerIcon: Record<string, string> = {
    go:           "←",
    visiting:     "🔒",
    free_parking: "🅿",
    go_to_jail:   "👮",
  };

  const content = (
    <div
      className={[
        "flex-1 flex flex-col items-center justify-between overflow-hidden",
        isCorner ? "p-[4px]" : "p-[2px]",
        "min-w-0 min-h-0",
      ].join(" ")}
    >
      {isCorner ? (
        // Corner tile layout
        <div className="w-full h-full flex flex-col items-center justify-center gap-[2px]">
          <span className="text-[20px] leading-none">{cornerIcon[space.type] ?? ""}</span>
          <p
            className="text-white font-bold text-center leading-[1.15] whitespace-pre-line"
            style={{ fontSize: "clamp(7px, 1.6vw, 14px)" }}
          >
            {cornerLabel[space.type] ?? space.name}
          </p>
          {space.type === "go" && (
            <p className="text-amber-300 font-bold text-center tracking-tight" style={{ fontSize: "clamp(5px, 1vw, 10px)" }}>
              Collect $200
            </p>
          )}
          {players.length > 0 && (
            <div className="flex flex-wrap justify-center gap-[2px] mt-[2px]">
              {players.map((p) => tokens?.[p.id] ? (
                <img
                  key={p.id}
                  src={tokens[p.id]}
                  alt={p.name}
                  title={p.name}
                  className="rounded border border-white/60 shadow-lg object-cover"
                  style={{ width: "clamp(12px,2vw,20px)", height: "clamp(12px,2vw,20px)" }}
                />
              ) : (
                <div
                  key={p.id}
                  className="rounded-full border-2 border-white/80 shadow-lg"
                  style={{ backgroundColor: p.color, width: "clamp(10px,1.8vw,18px)", height: "clamp(10px,1.8vw,18px)" }}
                  title={p.name}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        // Normal tile layout
        <>
          {/* Name */}
          <p
            className="text-gray-100 font-medium text-center w-full overflow-hidden"
            style={{
              fontSize: "clamp(5px, 0.95vw, 8.5px)",
              lineHeight: 1.18,
              display: "-webkit-box",
              WebkitLineClamp: isHorizontal ? 2 : 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={space.name}
          >
            {space.name}
          </p>

          {/* Buildings / ownership indicator */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full">
            {ownership?.mortgaged && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-[9px] font-black text-orange-400 rotate-[-20deg]">MTG</span>
              </div>
            )}
            {ownership?.hasHotel && (
              <span style={{ fontSize: "clamp(8px, 1.2vw, 14px)" }}>🏨</span>
            )}
            {ownership && !ownership.hasHotel && ownership.houseCount > 0 && (
              <div className="flex gap-[1px] flex-wrap justify-center">
                {Array.from({ length: Math.min(ownership.houseCount, 4) }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-sm bg-green-500 border border-green-300/40"
                    style={{ width: "clamp(4px, 0.7vw, 7px)", height: "clamp(4px, 0.7vw, 7px)" }}
                  />
                ))}
              </div>
            )}
            {ownership && ownerColor && !ownership.mortgaged && !ownership.hasHotel && ownership.houseCount === 0 && (
              <div
                className="rounded-full border-2 border-white/60 shadow"
                style={{
                  backgroundColor: ownerColor,
                  width: "clamp(5px, 0.9vw, 8px)",
                  height: "clamp(5px, 0.9vw, 8px)",
                }}
                title={`Rent $${ownership.rent}`}
              />
            )}
          </div>

          {/* Price / rent / tax */}
          <div className="shrink-0 text-center">
            {space.price !== undefined && !ownership && (
              <p className="text-amber-200 font-semibold" style={{ fontSize: "clamp(5px, 0.8vw, 8px)" }}>
                ${space.price}
              </p>
            )}
            {space.tax !== undefined && (
              <p className="text-red-300 font-semibold" style={{ fontSize: "clamp(5px, 0.8vw, 8px)" }}>
                -${space.tax}
              </p>
            )}
            {ownership && (
              <p className="text-cyan-200 font-semibold" style={{ fontSize: "clamp(5px, 0.8vw, 8px)" }}>
                R:${ownership.rent}
              </p>
            )}
          </div>

          {/* Player tokens */}
          {players.length > 0 && (
            <div className="flex flex-wrap justify-center gap-[1px] mt-[1px]">
              {players.map((p) => tokens?.[p.id] ? (
                <img
                  key={p.id}
                  src={tokens[p.id]}
                  alt={p.name}
                  title={p.name}
                  className="rounded-sm border border-white/60 shadow-lg object-cover"
                  style={{ width: "clamp(10px, 1.6vw, 16px)", height: "clamp(10px, 1.6vw, 16px)" }}
                />
              ) : (
                <div
                  key={p.id}
                  className="rounded-full border border-white/80 shadow-lg"
                  style={{
                    backgroundColor: p.color,
                    width: "clamp(8px, 1.4vw, 14px)",
                    height: "clamp(8px, 1.4vw, 14px)",
                  }}
                  title={p.name}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }
          : undefined
      }
      className={[
        "overflow-hidden border select-none",
        isOwned ? "border-gray-400/50" : "border-gray-600",
        getSpaceBg(space.type),
        isClickable ? "cursor-pointer hover:brightness-125 transition-all active:scale-[0.99]" : "",
        "w-full h-full",
        isHorizontal ? "flex flex-row" : "flex flex-col",
      ].join(" ")}
    >
      {stripFirst && strip}
      {content}
      {stripLast && strip}
    </div>
  );
}

export default function Board({ players, properties, tokens, onSpaceClick }: Props) {
  return (
    <div
      className="relative aspect-square w-full"
      style={{
        display: "grid",
        gridTemplateColumns: COL_TEMPLATE,
        gridTemplateRows: ROW_TEMPLATE,
      }}
    >
      {/* Board center — spans the full interior behind the grid */}
      <div
        className="absolute pointer-events-none z-0 flex items-center justify-center border border-gray-700/50"
        style={{ inset: CENTER_INSET, background: "radial-gradient(ellipse at 50% 40%, #1a2040 0%, #0c1228 100%)" }}
      >
        <div className="text-center px-2">
          <p
            className="font-black tracking-[0.3em] text-amber-400 uppercase"
            style={{ fontSize: "clamp(10px, 3vw, 40px)", textShadow: "0 0 20px rgba(245,158,11,0.4)" }}
          >
            India
          </p>
          <p
            className="font-black tracking-[0.2em] text-amber-300/60 uppercase"
            style={{ fontSize: "clamp(6px, 1.4vw, 18px)" }}
          >
            Monopoly
          </p>
        </div>
      </div>

      {/* Render all 11×11 grid cells */}
      {Array.from({ length: GRID }).flatMap((_, r) =>
        Array.from({ length: GRID }).map((__, c) => {
          const key = `${r}-${c}`;
          const isCorner = (r === 0 || r === 10) && (c === 0 || c === 10);
          const isOnPerimeter = r === 0 || r === 10 || c === 0 || c === 10;

          // Interior cells are invisible (center overlay covers them)
          if (!isOnPerimeter) {
            return (
              <div
                key={key}
                className="z-10"
                style={{ gridColumn: c + 1, gridRow: r + 1 }}
              />
            );
          }

          const spaceIndex = getSpaceIndex(r, c);
          if (spaceIndex === null) return <div key={key} style={{ gridColumn: c + 1, gridRow: r + 1 }} />;

          const space = BOARD.find((s) => s.index === spaceIndex);
          if (!space) return <div key={key} style={{ gridColumn: c + 1, gridRow: r + 1 }} />;

          const onSpace = getPlayersOnSpace(spaceIndex, players);
          const ownership = properties[spaceIndex];
          const ownerColor = ownership ? players[ownership.ownerId]?.color : undefined;
          const side = isCorner ? undefined : getSide(r, c);

          return (
            <div
              key={key}
              className="z-10"
              style={{ gridColumn: c + 1, gridRow: r + 1 }}
            >
              <TileContent
                space={space}
                players={onSpace}
                ownership={ownership}
                ownerColor={ownerColor}
                onClick={onSpaceClick ? () => onSpaceClick(spaceIndex) : undefined}
                isCorner={isCorner}
                side={side}
                tokens={tokens}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
