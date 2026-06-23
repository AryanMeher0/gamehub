"use client";

import { GAME_REGISTRY, GameDefinition } from "@/lib/games";

interface Props {
  selectedGameId: string | null;
  isHost: boolean;
  playerCount: number;
  onSelect: (gameId: string) => void;
}

export default function GamePicker({ selectedGameId, isHost, playerCount, onSelect }: Props) {
  return (
    <div className="w-full rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        {isHost ? "Select a Game" : "Game"}
      </p>
      <div className="flex flex-col gap-2">
        {GAME_REGISTRY.map((game: GameDefinition) => {
          const isSelected = selectedGameId === game.id;
          const notEnoughPlayers = playerCount < game.minPlayers;

          return (
            <button
              key={game.id}
              onClick={() => isHost && onSelect(game.id)}
              disabled={!isHost}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all
                ${isSelected
                  ? "border-indigo-500 bg-indigo-950 ring-1 ring-indigo-500"
                  : "border-gray-700 bg-gray-800 hover:border-gray-600"
                }
                ${!isHost ? "cursor-default" : "cursor-pointer active:scale-[0.98]"}
              `}
            >
              <span className="text-2xl">{game.icon}</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{game.name}</span>
                  {isSelected && (
                    <span className="rounded-full bg-indigo-700 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{game.description}</p>
                <p className="text-[10px] text-gray-600">
                  {game.minPlayers}–{game.maxPlayers} players
                  {notEnoughPlayers && (
                    <span className="ml-1 text-yellow-600">
                      (need {game.minPlayers - playerCount} more)
                    </span>
                  )}
                </p>
              </div>
              {isSelected && <span className="text-indigo-400">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
