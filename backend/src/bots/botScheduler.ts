import { Server } from "socket.io";
import { GameState } from "../types/game";
import {
  processRoll, resolveCard, buyProperty, skipProperty,
  auctionPass, endTurn, persistGame, getGame,
} from "../games/monopoly/gameManager";

let io: Server | null = null;

export function initBotScheduler(ioServer: Server): void {
  io = ioServer;
}

/**
 * Called after every game state broadcast. Schedules any pending bot actions.
 * Handles both turn-based actions (rolling, buying, card, endTurn)
 * and auction participation for all bots in the room.
 */
export function scheduleBotActions(roomCode: string, state: GameState): void {
  if (!io) return;
  if (state.phase === "gameover") return;

  if (state.phase === "auction") {
    scheduleAuctionPasses(roomCode, state);
    return;
  }

  // Non-auction: only the current player acts
  const currentId = state.turnOrder[state.currentTurnIndex];
  const currentPlayer = state.players[currentId];
  if (!currentPlayer?.isBot) return;

  setTimeout(() => {
    executeBotTurn(roomCode, currentId);
  }, BOT_TURN_DELAY_MS);
}

// ─── Auction participation ────────────────────────────────────────────────────

function scheduleAuctionPasses(roomCode: string, state: GameState): void {
  const auction = state.auctionState;
  if (!auction) return;

  const pendingBots = state.turnOrder.filter(
    (id) =>
      state.players[id]?.isBot &&
      !state.players[id]?.bankrupt &&
      !auction.passedPlayerIds.includes(id)
  );

  pendingBots.forEach((botId, index) => {
    setTimeout(() => {
      executeBotAuctionPass(roomCode, botId);
    }, BOT_AUCTION_DELAY_MS + index * BOT_AUCTION_STAGGER_MS);
  });
}

function executeBotAuctionPass(roomCode: string, botId: string): void {
  if (!io) return;
  const state = getGame(roomCode);
  if (!state || state.phase !== "auction" || !state.auctionState) return;
  if (state.auctionState.passedPlayerIds.includes(botId)) return;

  const { state: next, error } = auctionPass(roomCode, botId);
  if (error) return;

  persistGame(roomCode);
  io.to(roomCode).emit("game:stateUpdated", next);
  scheduleBotActions(roomCode, next);
}

// ─── Turn actions ─────────────────────────────────────────────────────────────

function executeBotTurn(roomCode: string, botId: string): void {
  if (!io) return;

  // Re-fetch state — it may have changed since the timeout was scheduled
  const state = getGame(roomCode);
  if (!state || state.phase === "gameover") return;

  // Guard: only act if it's still this bot's turn
  const currentId = state.turnOrder[state.currentTurnIndex];
  if (currentId !== botId) return;

  let result: { state: GameState; error?: string } | null = null;

  switch (state.phase) {
    case "rolling":
      result = processRoll(roomCode, botId);
      break;

    case "buying":
      // Phase 3A: always buy if possible; if error (can't afford), skip
      result = buyProperty(roomCode, botId);
      if (result.error) result = skipProperty(roomCode, botId);
      break;

    case "card":
      result = resolveCard(roomCode, botId);
      break;

    case "ended":
      result = endTurn(roomCode, botId);
      break;

    default:
      return;
  }

  if (!result || result.error) return;

  persistGame(roomCode);
  io.to(roomCode).emit("game:stateUpdated", result.state);
  scheduleBotActions(roomCode, result.state);
}

// ─── Timing constants ─────────────────────────────────────────────────────────

const BOT_TURN_DELAY_MS = 800;
const BOT_AUCTION_DELAY_MS = 600;
const BOT_AUCTION_STAGGER_MS = 350;
