"use client";

import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";

export default function Stack5Page() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();

  function handleLeave() {
    getSocket().emit("leaveRoom", { roomCode });
    router.push("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
      <span className="text-6xl">🧱</span>
      <h1 className="text-3xl font-black text-indigo-400">Stack5</h1>
      <p className="text-gray-400">Room: <span className="font-mono text-white">{roomCode}</span></p>
      <p className="text-sm text-gray-500">Coming soon…</p>
      <button
        onClick={handleLeave}
        className="mt-4 text-sm text-gray-600 hover:text-gray-400 transition-colors"
      >
        Leave
      </button>
    </main>
  );
}
