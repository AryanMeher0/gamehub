"use client";

import { useState } from "react";
import CreateGame from "./CreateGame";
import JoinGame from "./JoinGame";

type View = "home" | "create" | "join";

export default function HomeScreen() {
  const [view, setView] = useState<View>("home");

  if (view === "create") return <CreateGame onBack={() => setView("home")} />;
  if (view === "join") return <JoinGame onBack={() => setView("home")} />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-gray-950 px-4 pt-28 text-white">
      <div className="fixed inset-x-0 top-0 z-50 bg-yellow-300 px-4 py-5 text-center text-2xl font-black uppercase tracking-wide text-black shadow-2xl">
        GameHub Continue Test Successful
      </div>

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-6xl font-black tracking-tight">GameHub</h1>
        <p className="text-gray-400">Multiplayer gaming platform</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-4">
        <button
          onClick={() => setView("create")}
          className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-bold tracking-wide hover:bg-indigo-500 active:scale-95 transition-all"
        >
          Create Game
        </button>
        <button
          onClick={() => setView("join")}
          className="w-full rounded-2xl border border-gray-600 bg-gray-800 py-4 text-lg font-bold tracking-wide hover:bg-gray-700 active:scale-95 transition-all"
        >
          Join Game
        </button>
      </div>
    </main>
  );
}
