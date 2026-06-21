"use client";

import { useEffect, useRef } from "react";

interface Props {
  log: string[];
}

export default function GameLog({ log }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900">
      <p className="border-b border-gray-700 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Game Log
      </p>
      <div className="flex h-40 flex-col gap-1 overflow-y-auto p-3">
        {log.slice(-50).map((entry, i) => (
          <p key={i} className="text-xs text-gray-300 leading-relaxed">
            {entry}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
