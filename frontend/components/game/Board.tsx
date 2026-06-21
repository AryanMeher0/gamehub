"use client";

import { BoardSpace, GamePlayer } from "@/types/game";
import { BOARD, PROPERTY_COLORS, getSpaceBg } from "@/lib/board";

interface Props {
  players: Record<string, GamePlayer>;
}

function getPlayersOnSpace(spaceIndex: number, players: Record<string, GamePlayer>): GamePlayer[] {
  return Object.values(players).filter((p) => p.position === spaceIndex);
}

function SpaceCell({
  space,
  players,
  rotation = 0,
}: {
  space: BoardSpace;
  players: GamePlayer[];
  rotation?: number;
}) {
  const colorBar = space.color ? PROPERTY_COLORS[space.color] : null;

  return (
    <div
      className={`relative flex flex-col items-center justify-between overflow-hidden border border-gray-700 text-center ${getSpaceBg(space.type)}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {colorBar && (
        <div className="w-full shrink-0" style={{ backgroundColor: colorBar, height: "22%" }} />
      )}
      <p className="px-0.5 text-[6px] leading-tight text-gray-300 font-medium line-clamp-2 w-full">
        {space.name}
      </p>
      {space.price && (
        <p className="text-[5px] text-gray-500">${space.price}</p>
      )}
      {space.tax && (
        <p className="text-[5px] text-red-400">-${space.tax}</p>
      )}
      {/* Player tokens */}
      {players.length > 0 && (
        <div className="absolute bottom-0.5 left-0 right-0 flex flex-wrap justify-center gap-0.5 px-0.5">
          {players.map((p) => (
            <div
              key={p.id}
              className="h-2.5 w-2.5 rounded-full border border-white/40 shadow"
              style={{ backgroundColor: p.color }}
              title={p.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Maps board index → [gridRow, gridCol] in an 11x11 grid (1-indexed)
function getBoardPosition(index: number): [number, number] {
  if (index <= 10)        return [11, 11 - index];          // bottom row: right→left
  if (index <= 20)        return [11 - (index - 10), 1];    // left col: bottom→top
  if (index <= 30)        return [1, index - 20];           // top row: left→right
  return [index - 29, 11];                                  // right col: top→bottom
}

export default function Board({ players }: Props) {
  return (
    <div
      className="relative grid aspect-square w-full"
      style={{
        gridTemplateColumns: "repeat(11, 1fr)",
        gridTemplateRows:    "repeat(11, 1fr)",
      }}
    >
      {/* 40 board spaces */}
      {BOARD.map((space) => {
        const [row, col] = getBoardPosition(space.index);
        const onSpace = getPlayersOnSpace(space.index, players);
        return (
          <div
            key={space.index}
            style={{ gridRow: row, gridColumn: col }}
            className="min-h-0 min-w-0"
          >
            <SpaceCell space={space} players={onSpace} />
          </div>
        );
      })}

      {/* Centre area */}
      <div
        style={{ gridRow: "2 / 11", gridColumn: "2 / 11" }}
        className="flex flex-col items-center justify-center gap-1 bg-gray-950 border border-gray-800"
      >
        <p className="text-2xl font-black tracking-widest text-indigo-400">GAMEHUB</p>
        <p className="text-xs text-gray-600 tracking-widest uppercase">Monopoly</p>
      </div>
    </div>
  );
}
