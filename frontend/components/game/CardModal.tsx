"use client";

import { useEffect, useState } from "react";
import { DrawnCard } from "@/types/game";

interface Props {
  card: DrawnCard;
  isMyTurn: boolean;
  playerName: string;
  onResolve: () => void;
}

const DECK_STYLE: Record<"chance" | "community", { bg: string; border: string; label: string; icon: string }> = {
  chance:    { bg: "bg-amber-950",  border: "border-amber-500",  label: "Chance",          icon: "❓" },
  community: { bg: "bg-sky-950",    border: "border-sky-500",    label: "Community Chest",  icon: "📦" },
};

export default function CardModal({ card, isMyTurn, playerName, onResolve }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on mount
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const style = DECK_STYLE[card.deck];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div
        className={`w-full max-w-sm rounded-2xl border-2 shadow-2xl transition-all duration-300
          ${style.bg} ${style.border}
          ${visible ? "scale-100 opacity-100" : "scale-90 opacity-0"}
        `}
      >
        {/* Header */}
        <div className={`rounded-t-2xl border-b-2 ${style.border} px-6 py-4 text-center`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{style.label}</p>
          <span className="mt-1 block text-5xl">{style.icon}</span>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center gap-4 px-6 py-6 text-center">
          <h2 className="text-xl font-black text-white">{card.title}</h2>
          <p className="text-sm leading-relaxed text-gray-300">{card.description}</p>

          {isMyTurn ? (
            <button
              onClick={onResolve}
              className={`mt-2 w-full rounded-xl py-3 text-base font-bold transition-all active:scale-95
                ${card.deck === "chance"
                  ? "bg-amber-600 hover:bg-amber-500"
                  : "bg-sky-600 hover:bg-sky-500"
                }`}
            >
              OK
            </button>
          ) : (
            <p className="mt-2 animate-pulse text-sm text-gray-500">
              Waiting for <span className="font-bold text-white">{playerName}</span>...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
