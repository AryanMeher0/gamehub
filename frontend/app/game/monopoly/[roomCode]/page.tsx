"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { GameState, TradeOffer } from "@/types/game";
import Board from "@/components/game/Board";
import PlayerPanel from "@/components/game/PlayerPanel";
import GameLog from "@/components/game/GameLog";
import PropertyModal from "@/components/game/PropertyModal";
import CardModal from "@/components/game/CardModal";
import GameOverScreen from "@/components/game/GameOverScreen";
import TradeModal from "@/components/game/TradeModal";
import IncomingTradeModal from "@/components/game/IncomingTradeModal";

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [state, setState] = useState<GameState | null>(null);
  const [socketId, setSocketId] = useState("");
  const [error, setError] = useState("");
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [incomingTrade, setIncomingTrade] = useState<TradeOffer | null>(null);

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");
    if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);

    function onConnect() {
      setSocketId(socket.id ?? "");
      if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);
    }

    function onStateUpdated(s: GameState) {
      setState(s);
      setError("");
    }

    function onError(data: { message: string }) {
      setError(data.message);
      setTimeout(() => setError(""), 3000);
    }

    function onTradeUpdated(trade: TradeOffer) {
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, trades: { ...prev.trades, [trade.id]: trade } };
      });
      // Show incoming modal when this socket is the recipient of a new pending trade
      if (trade.status === "pending" && trade.toId === (getSocket().id ?? "")) {
        setIncomingTrade(trade);
      }
      // Clear incoming modal once resolved
      if (trade.status !== "pending") {
        setIncomingTrade((prev) => (prev?.id === trade.id ? null : prev));
      }
    }

    socket.on("connect", onConnect);
    socket.on("game:stateUpdated", onStateUpdated);
    socket.on("game:error", onError);
    socket.on("game:tradeUpdated", onTradeUpdated);

    socket.emit("game:getState", { roomCode });

    return () => {
      socket.off("connect", onConnect);
      socket.off("game:stateUpdated", onStateUpdated);
      socket.off("game:error", onError);
      socket.off("game:tradeUpdated", onTradeUpdated);
    };
  }, [roomCode]);

  function handleRoll()        { getSocket().emit("game:roll",          { roomCode }); }
  function handleEndTurn()     { getSocket().emit("game:endTurn",       { roomCode }); }
  function handleBuy()         { getSocket().emit("game:buyProperty",   { roomCode }); }
  function handleSkip()        { getSocket().emit("game:skipProperty",  { roomCode }); }
  function handleResolveCard() { getSocket().emit("game:resolveCard",   { roomCode }); }
  function handleBuyBuilding(spaceIndex: number) {
    getSocket().emit("game:buyBuilding", { roomCode, spaceIndex });
  }

  function handleSendTrade(payload: {
    toId: string;
    offeredCash: number;
    requestedCash: number;
    offeredPropertyIndices: number[];
    requestedPropertyIndices: number[];
  }) {
    getSocket().emit("game:createTrade", { roomCode, ...payload });
    setShowTradeModal(false);
  }

  function handleAcceptTrade(tradeId: string) {
    getSocket().emit("game:acceptTrade", { roomCode, tradeId });
    setIncomingTrade(null);
  }

  function handleRejectTrade(tradeId: string) {
    getSocket().emit("game:rejectTrade", { roomCode, tradeId });
    setIncomingTrade(null);
  }

  function handleLeave() {
    getSocket().emit("leaveRoom", { roomCode });
    router.push("/");
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="animate-pulse text-gray-400">Loading game...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-indigo-400">GameHub</span>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-400">
            {roomCode}
          </span>
        </div>
        {error && (
          <span className="rounded-lg bg-red-900/50 px-3 py-1 text-xs text-red-400">{error}</span>
        )}
        <button
          onClick={handleLeave}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Leave
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <div className="w-full lg:flex-1">
          <Board players={state.players} properties={state.properties} />
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
          <PlayerPanel
            state={state}
            socketId={socketId}
            onRoll={handleRoll}
            onEndTurn={handleEndTurn}
            onBuyBuilding={handleBuyBuilding}
            onOpenTrade={() => setShowTradeModal(true)}
          />
          <GameLog log={state.log} />
        </div>
      </div>

      {/* Property purchase modal — shown to all players when phase is buying */}
      {state.phase === "buying" && (
        <PropertyModal
          state={state}
          socketId={socketId}
          onBuy={handleBuy}
          onSkip={handleSkip}
        />
      )}

      {/* Card modal — shown to all players when phase is card */}
      {state.phase === "card" && state.activeCard && (
        <CardModal
          card={state.activeCard}
          isMyTurn={state.turnOrder[state.currentTurnIndex] === socketId}
          playerName={state.players[state.turnOrder[state.currentTurnIndex]]?.name ?? ""}
          onResolve={handleResolveCard}
        />
      )}

      {/* Trade offer modal (initiator) */}
      {showTradeModal && !state.gameOver && (
        <TradeModal
          state={state}
          socketId={socketId}
          onSend={handleSendTrade}
          onClose={() => setShowTradeModal(false)}
        />
      )}

      {/* Incoming trade modal (recipient) */}
      {incomingTrade && state.trades[incomingTrade.id]?.status === "pending" && (
        <IncomingTradeModal
          trade={incomingTrade}
          state={state}
          onAccept={() => handleAcceptTrade(incomingTrade.id)}
          onReject={() => handleRejectTrade(incomingTrade.id)}
        />
      )}

      {/* Game over overlay */}
      {state.gameOver && (
        <GameOverScreen
          state={state}
          socketId={socketId}
          roomCode={roomCode}
          onLeave={handleLeave}
        />
      )}
    </main>
  );
}
