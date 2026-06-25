"use client";

import { BoardSpace, GamePlayer, PropertyOwnership } from "@/types/game";
import { BOARD, PROPERTY_COLORS, getSpaceBg } from "@/lib/board";

interface Props {
  players: Record<string, GamePlayer>;
  properties: Record<number, PropertyOwnership>;
  onSpaceClick?: (spaceIndex: number) => void;
}

function getPlayersOnSpace(index: number, players: Record<string, GamePlayer>): GamePlayer[] {
  return Object.values(players).filter((p) => p.position === index && !p.bankrupt);
}

function SpaceCell({
  space,
  players,
  ownership,
  ownerColor,
  onClick,
}: {
  space: BoardSpace;
  players: GamePlayer[];
  ownership?: PropertyOwnership;
  ownerColor?: string;
  onClick?: () => void;
}) {
  const propertyColorHex = space.color ? PROPERTY_COLORS[space.color] : null;
  const isClickable = !!onClick;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
      className={`relative flex flex-col items-center justify-between overflow-hidden border border-gray-700 text-center ${getSpaceBg(space.type)} ${
        isClickable ? "cursor-pointer hover:brightness-125 transition-all active:scale-[0.97]" : ""
      }`}
    >
      {/* Property color bar */}
      {propertyColorHex && (
        <div
          className="w-full shrink-0"
          style={{ backgroundColor: propertyColorHex, height: "22%" }}
        />
      )}

      <p className="px-0.5 text-[6px] leading-tight text-gray-300 font-medium line-clamp-2 w-full">
        {space.name}
      </p>

      {space.price && !ownership && (
        <p className="text-[5px] text-gray-500">${space.price}</p>
      )}
      {space.tax && <p className="text-[5px] text-red-400">-${space.tax}</p>}

      {/* Buildings */}
      {ownership?.hasHotel && (
        <div className="text-[7px] leading-none" title="Hotel">🏨</div>
      )}
      {ownership && !ownership.hasHotel && ownership.houseCount > 0 && (
        <div className="flex gap-px justify-center">
          {Array.from({ length: ownership.houseCount }).map((_, i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-sm bg-green-500" title="House" />
          ))}
        </div>
      )}

      {/* Mortgage indicator */}
      {ownership?.mortgaged && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="rotate-[-30deg] text-[6px] font-black text-orange-400 tracking-wider">MTG</span>
        </div>
      )}

      {/* Owner dot — when owned with no buildings */}
      {ownership && ownerColor && !ownership.hasHotel && ownership.houseCount === 0 && !ownership.mortgaged && (
        <div
          className="mb-0.5 h-2 w-2 rounded-full border border-white/40 shadow"
          style={{ backgroundColor: ownerColor }}
          title={`Rent $${ownership.rent}`}
        />
      )}

      {/* Player tokens */}
      {players.length > 0 && (
        <div className="absolute bottom-0.5 left-0 right-0 flex flex-wrap justify-center gap-0.5 px-0.5">
          {players.map((p) => (
            <div
              key={p.id}
              className="h-2.5 w-2.5 rounded-full border-2 border-white/80 shadow-lg"
              style={{ backgroundColor: p.color }}
              title={p.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getBoardPosition(index: number): [number, number] {
  if (index <= 10) return [11, 11 - index];
  if (index <= 20) return [11 - (index - 10), 1];
  if (index <= 30) return [1, index - 20];
  return [index - 29, 11];
}

export default function Board({ players, properties, onSpaceClick }: Props) {
  return (
    <div
      className="relative grid aspect-square w-full"
      style={{
        gridTemplateColumns: "repeat(11, 1fr)",
        gridTemplateRows: "repeat(11, 1fr)",
      }}
    >
      {BOARD.map((space) => {
        const [row, col] = getBoardPosition(space.index);
        const onSpace = getPlayersOnSpace(space.index, players);
        const ownership = properties[space.index];
        const ownerColor = ownership ? players[ownership.ownerId]?.color : undefined;

        return (
          <div
            key={space.index}
            style={{ gridRow: row, gridColumn: col }}
            className="min-h-0 min-w-0"
          >
            <SpaceCell
              space={space}
              players={onSpace}
              ownership={ownership}
              ownerColor={ownerColor}
              onClick={onSpaceClick ? () => onSpaceClick(space.index) : undefined}
            />
          </div>
        );
      })}

      {/* Centre */}
      <div
        style={{ gridRow: "2 / 11", gridColumn: "2 / 11" }}
        className="flex flex-col items-center justify-center gap-1 bg-gray-950 border border-gray-800"
      >
        <p className="text-xl font-black tracking-widest text-amber-400">INDIA</p>
        <p className="text-xs text-gray-600 tracking-widest uppercase">Monopoly</p>
        <p className="text-[10px] text-gray-700 tracking-widest uppercase mt-0.5">Click any space</p>
      </div>
    </div>
  );
}
