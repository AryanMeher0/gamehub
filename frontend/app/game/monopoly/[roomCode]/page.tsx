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
import AuctionModal from "@/components/game/AuctionModal";
import PropertyDetailDrawer from "@/components/game/PropertyDetailDrawer";

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [state, setState] = useState<GameState | null>(null);
  const [socketId, setSocketId] = useState("");
  const [error, setError] = useState("");
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [incomingTrade, setIncomingTrade] = useState<TradeOffer | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);

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
      if (trade.status === "pending" && trade.toId === (getSocket().id ?? "")) {
        setIncomingTrade(trade);
      }
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

  function emit(event: string, payload?: Record<string, unknown>) {
    getSocket().emit(event, { roomCode, ...payload });
  }

  function handleRoll()              { emit("game:roll"); }
  function handleEndTurn()           { emit("game:endTurn"); }
  function handleBuy()               { emit("game:buyProperty"); }
  function handleSkip()              { emit("game:skipProperty"); }
  function handleResolveCard()       { emit("game:resolveCard"); }
  function handlePayJailFine()       { emit("game:payJailFine"); }
  function handleUseGojf()           { emit("game:useGojf"); }
  function handleBuyBuilding(i: number)  { emit("game:buyBuilding",  { spaceIndex: i }); }
  function handleSellBuilding(i: number) { emit("game:sellBuilding", { spaceIndex: i }); }
  function handleMortgage(i: number)     { emit("game:mortgage",     { spaceIndex: i }); }
  function handleUnmortgage(i: number)   { emit("game:unmortgage",   { spaceIndex: i }); }
  function handleAuctionBid(amount: number) { emit("game:auctionBid", { amount }); }
  function handleAuctionPass()            { emit("game:auctionPass"); }

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
    emit("game:acceptTrade", { tradeId });
    setIncomingTrade(null);
  }

  function handleRejectTrade(tradeId: string) {
    emit("game:rejectTrade", { tradeId });
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
          <Board
            players={state.players}
            properties={state.properties}
            onSpaceClick={(i) => setSelectedSpace(i)}
          />
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
          <PlayerPanel
            state={state}
            socketId={socketId}
            onRoll={handleRoll}
            onEndTurn={handleEndTurn}
            onBuyBuilding={handleBuyBuilding}
            onSellBuilding={handleSellBuilding}
            onMortgage={handleMortgage}
            onUnmortgage={handleUnmortgage}
            onPayJailFine={handlePayJailFine}
            onUseGojf={handleUseGojf}
            onOpenTrade={() => setShowTradeModal(true)}
            onPropertyClick={(i) => setSelectedSpace(i)}
          />
          <GameLog log={state.log} />
        </div>
      </div>

      {/* Property purchase modal */}
      {state.phase === "buying" && (
        <PropertyModal
          state={state}
          socketId={socketId}
          onBuy={handleBuy}
          onSkip={handleSkip}
        />
      )}

      {/* Card modal */}
      {state.phase === "card" && state.activeCard && (
        <CardModal
          card={state.activeCard}
          isMyTurn={state.turnOrder[state.currentTurnIndex] === socketId}
          playerName={state.players[state.turnOrder[state.currentTurnIndex]]?.name ?? ""}
          onResolve={handleResolveCard}
        />
      )}

      {/* Auction modal */}
      {state.phase === "auction" && state.auctionState && (
        <AuctionModal
          state={state}
          socketId={socketId}
          onBid={handleAuctionBid}
          onPass={handleAuctionPass}
        />
      )}

      {/* Trade modals */}
      {showTradeModal && !state.gameOver && (
        <TradeModal
          state={state}
          socketId={socketId}
          onSend={handleSendTrade}
          onClose={() => setShowTradeModal(false)}
        />
      )}

      {incomingTrade && state.trades[incomingTrade.id]?.status === "pending" && (
        <IncomingTradeModal
          trade={incomingTrade}
          state={state}
          onAccept={() => handleAcceptTrade(incomingTrade.id)}
          onReject={() => handleRejectTrade(incomingTrade.id)}
        />
      )}

      {/* Property detail drawer */}
      {selectedSpace !== null && (
        <PropertyDetailDrawer
          spaceIndex={selectedSpace}
          state={state}
          onClose={() => setSelectedSpace(null)}
        />
      )}

      {/* Game over */}
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
