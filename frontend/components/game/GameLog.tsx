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
    <div className="rounded-xl overflow-hidden"
      style={{ background: "rgba(0,0,0,0.40)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <p className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-green-900"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        Game Log
      </p>
      <div className="flex h-40 flex-col gap-0.5 overflow-y-auto p-3">
        {log.slice(-50).map((entry, i) => (
          <p key={i} className="text-[10px] text-green-800 leading-relaxed">{entry}</p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
