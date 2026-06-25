"use client";

import { useState } from "react";
import { GameState, AuctionState } from "@/types/game";
import { BOARD, PROPERTY_COLORS } from "@/lib/board";

interface Props {
  state: GameState;
  socketId: string;
  onBid: (amount: number) => void;
  onPass: () => void;
}

export default function AuctionModal({ state, socketId, onBid, onPass }: Props) {
  const auction = state.auctionState;
  if (!auction) return null;

  const space = BOARD[auction.spaceIndex];
  const colorHex = space?.color ? PROPERTY_COLORS[space.color] : null;

  const myPlayer = state.players[socketId];
  const hasPassed = auction.passedPlayerIds.includes(socketId);
  const isHighestBidder = auction.highestBidderId === socketId;
  const activePlayers = state.turnOrder.filter((id) => !state.players[id]?.bankrupt);
  const stillBidding = activePlayers.filter((id) => !auction.passedPlayerIds.includes(id));

  const minBid = auction.highestBid + 1;
  const [bidAmount, setBidAmount] = useState(minBid);

  const canAfford = (myPlayer?.cash ?? 0) >= bidAmount;
  const isOver = state.phase !== "auction";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-amber-700 bg-gray-900 shadow-2xl overflow-hidden">
        {/* Color bar */}
        {colorHex && <div className="h-2 w-full" style={{ backgroundColor: colorHex }} />}

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">🔨 Auction</p>
            <h2 className="text-2xl font-black text-white">{space?.name}</h2>
            {space?.color && (
              <span
                className="mt-1 rounded-full px-3 py-0.5 text-xs font-semibold capitalize text-white"
                style={{ backgroundColor: colorHex ?? "#374151" }}
              >
                {space.color}
              </span>
            )}
          </div>

          {/* Current bid */}
          <div className="rounded-xl bg-gray-800 px-4 py-3 text-center">
            <p className="text-xs text-gray-500">Current Highest Bid</p>
            <p className="text-2xl font-black text-amber-400">
              {auction.highestBid > 0 ? `$${auction.highestBid}` : "No bids yet"}
            </p>
            {auction.highestBidderId && (
              <p className="text-xs text-gray-400 mt-0.5">
                by {state.players[auction.highestBidderId]?.name ?? "Unknown"}
              </p>
            )}
          </div>

          {/* Bidder status */}
          <div className="flex flex-col gap-1">
            {activePlayers.map((id) => {
              const p = state.players[id];
              const passed = auction.passedPlayerIds.includes(id);
              const winning = auction.highestBidderId === id;
              return (
                <div key={id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p?.color }} />
                    <span className={passed ? "text-gray-600 line-through" : "text-gray-300"}>
                      {p?.name ?? id}
                      {id === socketId && " (You)"}
                    </span>
                  </div>
                  <span className={
                    passed ? "text-gray-600" :
                    winning ? "text-amber-400 font-bold" :
                    "text-gray-500"
                  }>
                    {passed ? "Passed" : winning ? `$${auction.highestBid} ✓` : "Bidding"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* My cash */}
          {myPlayer && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>Your cash:</span>
              <span className="font-bold text-green-400">${myPlayer.cash}</span>
            </div>
          )}

          {/* Bid controls */}
          {!hasPassed && !isOver && myPlayer && !myPlayer.bankrupt && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={minBid}
                  max={myPlayer.cash}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(Math.max(minBid, Number(e.target.value)))}
                  className="flex-1 rounded-xl bg-gray-800 px-3 py-2 text-center text-white outline-none focus:ring-1 focus:ring-amber-400"
                />
                <button
                  onClick={() => onBid(bidAmount)}
                  disabled={!canAfford || bidAmount <= auction.highestBid}
                  className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition-all"
                >
                  Bid
                </button>
              </div>
              {/* Quick bid buttons */}
              <div className="flex gap-1.5">
                {[minBid, minBid + 10, minBid + 25, minBid + 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setBidAmount(amt)}
                    disabled={amt > myPlayer.cash}
                    className="flex-1 rounded-lg bg-gray-800 py-1.5 text-xs font-bold hover:bg-gray-700 disabled:opacity-30 transition-all"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <button
                onClick={onPass}
                className="w-full rounded-xl bg-gray-700 py-2.5 text-sm font-bold hover:bg-gray-600 active:scale-95 transition-all"
              >
                Pass
              </button>
            </div>
          )}

          {hasPassed && (
            <p className="text-center text-sm text-gray-500 animate-pulse">
              You have passed on this auction.
              {stillBidding.length > 0 && ` Waiting for ${stillBidding.length} player${stillBidding.length > 1 ? "s" : ""}...`}
            </p>
          )}

          {isHighestBidder && !hasPassed && stillBidding.length === 1 && (
            <p className="text-center text-sm font-bold text-amber-400">
              You are the highest bidder — waiting for others to pass.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
