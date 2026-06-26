"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { playSound } from "@/lib/sounds";
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
  const LOCAL_SAVE_KEY = `gamehub:save:${roomCode}`;
  const [state, setState] = useState<GameState | null>(() => {
    // Seed from localStorage so the last known state shows instantly before the socket responds
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(`gamehub:save:${roomCode}`);
      return raw ? (JSON.parse(raw) as GameState) : null;
    } catch { return null; }
  });
  const [socketId, setSocketId] = useState("");
  const [error, setError] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [incomingTrade, setIncomingTrade] = useState<TradeOffer | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const prevStateRef = useRef<GameState | null>(null);

  useEffect(() => {
    const socket = getSocket();
    setSocketId(socket.id ?? "");
    if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);

    function onConnect() {
      setSocketId(socket.id ?? "");
      if (socket.id) sessionStorage.setItem(`gamehub:socket:${roomCode}`, socket.id);
      setDisconnected(false);
      socket.emit("game:getState", { roomCode });
      const name = (
        sessionStorage.getItem("gamehub:pendingName") ??
        localStorage.getItem("gamehub:name") ?? ""
      ).trim();
      if (name) socket.emit("room:setDisplayName", { roomCode, name });
    }

    function onDisconnect() {
      setDisconnected(true);
    }

    function onStateUpdated(s: GameState) {
      const prev = prevStateRef.current;
      prevStateRef.current = s;
      setState(s);
      setError("");
      setDisconnected(false);
      try { localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(s)); } catch { /* quota exceeded */ }

      if (prev) {
        // Turn changed
        if (prev.turnOrder[prev.currentTurnIndex] !== s.turnOrder[s.currentTurnIndex]) {
          playSound("turn");
        }
        // Phase changed
        if (prev.phase !== s.phase) {
          if (s.phase === "card")    playSound("chance");
          if (s.phase === "buying")  playSound("buy");
          if (s.phase === "auction") playSound("chance");
        }
        // Per-player events
        Object.values(s.players).forEach((player) => {
          const p = prev.players[player.id];
          if (!p) return;
          if (!p.inJail  && player.inJail)   playSound("jail");
          if (!p.bankrupt && player.bankrupt) playSound("bankrupt");
          // Passed GO: wrapped around the board
          if (p.position > 30 && player.position < 10 && !player.inJail) playSound("passgo");
          // Cash decreased while not buying (paying tax or rent)
          if (player.cash < p.cash) {
            if (s.phase === "rolling" || prev.phase === "card") playSound("tax");
          }
        });
      }
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

    function onTokensData(data: Record<string, string>) {
      setTokens(data);
    }
    function onTokenUpdated({ playerId, tokenDataUrl }: { playerId: string; tokenDataUrl: string }) {
      setTokens((prev) => ({ ...prev, [playerId]: tokenDataUrl }));
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("game:stateUpdated", onStateUpdated);
    socket.on("game:error", onError);
    socket.on("game:tradeUpdated", onTradeUpdated);
    socket.on("player:tokensData", onTokensData);
    socket.on("player:tokenUpdated", onTokenUpdated);

    socket.emit("game:getState", { roomCode });
    socket.emit("player:getTokens", { roomCode });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game:stateUpdated", onStateUpdated);
      socket.off("game:error", onError);
      socket.off("game:tradeUpdated", onTradeUpdated);
      socket.off("player:tokensData", onTokensData);
      socket.off("player:tokenUpdated", onTokenUpdated);
    };
  }, [roomCode]);

  function emit(event: string, payload?: Record<string, unknown>) {
    getSocket().emit(event, { roomCode, ...payload });
  }

  function handleRoll()              { playSound("roll"); emit("game:roll"); }
  function handleEndTurn()           { emit("game:endTurn"); }
  function handleBuy()               { emit("game:buyProperty"); }
  function handleSkip()              { emit("game:skipProperty"); }
  function handleResolveCard()       { emit("game:resolveCard"); }
  function handlePayJailFine()       { playSound("tax"); emit("game:payJailFine"); }
  function handleUseGojf()           { emit("game:useGojf"); }
  function handleBuyBuilding(i: number)  { playSound("build"); emit("game:buyBuilding",  { spaceIndex: i }); }
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
    offeredGojfCount: number;
    requestedGojfCount: number;
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
      <main className="flex min-h-screen items-center justify-center text-white"
        style={{ background: "radial-gradient(ellipse at 50% 40%, #1a2040 0%, #0c1228 55%, #060810 100%)" }}>
        <div className="text-center fade-up">
          <div className="text-5xl mb-3 animate-pulse">🎩</div>
          <p className="text-amber-400 font-black text-lg">India Monopoly</p>
          <p className="text-xs text-slate-600 mt-1">Connecting to server…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col text-white overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #1a2040 0%, #0c1228 55%, #060810 100%)" }}>

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between px-4 py-2"
        style={{ background: "rgba(0,0,0,0.55)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-2.5">
          <span className="font-black text-base text-amber-400 tracking-tight">India Monopoly</span>
        </div>

        {disconnected && (
          <span className="animate-pulse rounded-lg bg-orange-900/60 px-3 py-1 text-xs font-bold text-orange-300">
            Reconnecting… (last state saved)
          </span>
        )}
        {!disconnected && error && (
          <span className="rounded-lg bg-red-900/50 px-3 py-1 text-xs text-red-400">{error}</span>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/game/monopoly/${roomCode}/operator`)}
            className="text-xs px-2 py-1 rounded-lg bg-black/30 border border-amber-900/40 text-amber-700 hover:text-amber-400 hover:border-amber-700 transition-all duration-150">
            ⚙️ Operator
          </button>
          <button onClick={handleLeave}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            Leave
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Board */}
        <div className="flex-1 p-3 overflow-auto flex items-start justify-center">
          <div className="w-full max-w-3xl">
            <Board
              players={state.players}
              properties={state.properties}
              tokens={tokens}
              onSpaceClick={(i) => setSelectedSpace(i)}
            />
          </div>
        </div>

        {/* Side panel */}
        <div className="w-72 shrink-0 flex flex-col gap-3 p-3 overflow-y-auto"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
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
