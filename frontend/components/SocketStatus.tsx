"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

type Status = "Connecting..." | "Connected" | "Disconnected";

export default function SocketStatus() {
  const [status, setStatus] = useState<Status>("Connecting...");
  const [welcome, setWelcome] = useState<string>("");

  useEffect(() => {
    const socket: Socket = io("http://localhost:4000");

    socket.on("connect", () => setStatus("Connected"));
    socket.on("disconnect", () => setStatus("Disconnected"));
    socket.on("server:welcome", (data: { message: string }) =>
      setWelcome(data.message)
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  const statusColor =
    status === "Connected"
      ? "text-green-400"
      : status === "Disconnected"
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <p>
        Socket Status:{" "}
        <span className={`font-semibold ${statusColor}`}>{status}</span>
      </p>
      {welcome && <p className="text-gray-400">{welcome}</p>}
    </div>
  );
}
