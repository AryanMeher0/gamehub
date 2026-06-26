import { Server } from "socket.io";
import { GameState, TradeOffer } from "../types/game";
import {
  processRoll, resolveCard, buyProperty, skipProperty,
  auctionBid, auctionPass, endTurn,
  buyBuilding, sellBuilding, mortgageProperty, unmortgageProperty,
  payJailFine, useGojf,
  persistGame, getGame,
} from "../games/monopoly/gameManager";
import { createTrade, acceptTrade, rejectTrade } from "../games/monopoly/tradeManager";
import {
  decideBuy, decideJailAction, decideAuction, decideBuild,
  decideUnmortgage, decideLiquidation, evaluateIncomingTrade,
  decideOutgoingTrade,
} from "./botDecisions";

let io: Server | null = null;

export function initBotScheduler(ioServer: Server): void {
  io = ioServer;
}

/**
 * Called after every game state broadcast. Schedules pending bot actions for
 * the current turn and responds to any incoming trades targeting bots.
 */
export function scheduleBotActions(roomCode: string, state: GameState): void {
  if (!io) return;
  if (state.phase === "gameover") return;
  console.log(`[BOT] scheduler triggered room=${roomCode} phase=${state.phase} currentTurn=${state.turnOrder[state.currentTurnIndex]}`);


  scheduleBotTradeDecisions(roomCode, state);

  if (state.phase === "auction") {
    scheduleAuctionActions(roomCode, state);
    return;
  }

  const currentId = state.turnOrder[state.currentTurnIndex];
  const currentPlayer = state.players[currentId];
  if (!currentPlayer?.isBot) return;
  console.log(`[BOT] turn detected bot=${currentId} name=${currentPlayer?.name} phase=${state.phase}`);


  setTimeout(() => {
    executeBotTurn(roomCode, currentId);
  }, BOT_TURN_DELAY_MS);
}

// ─── Incoming trade responses ─────────────────────────────────────────────────

function scheduleBotTradeDecisions(roomCode: string, state: GameState): void {
  const pendingForBots = Object.values(state.trades).filter(t => {
    if (t.status !== "pending") return false;
    const bot = state.players[t.toId];
    return bot?.isBot && !bot.bankrupt;
  });

  pendingForBots.forEach((trade, index) => {
    setTimeout(() => {
      executeBotTradeResponse(roomCode, trade.id, trade.toId);
    }, BOT_TRADE_DELAY_MS + index * 200);
  });
}

function executeBotTradeResponse(roomCode: string, tradeId: string, botId: string): void {
  if (!io) return;
  const state = getGame(roomCode);
  if (!state) return;

  const trade = state.trades[tradeId];
  if (!trade || trade.status !== "pending") return;

  const bot = state.players[botId];
  if (!bot || bot.bankrupt) return;

  const botType = bot.botType ?? "easy";
  const decision = evaluateIncomingTrade(state, trade, botId, botType);

  const { error } = decision === "accept"
    ? acceptTrade(state, tradeId, botId)
    : rejectTrade(state, tradeId, botId);

  if (error) return;

  persistGame(roomCode);
  io.to(roomCode).emit("game:stateUpdated", state);
  io.to(roomCode).emit("game:tradeUpdated", state.trades[tradeId]);
}

// ─── Auction ──────────────────────────────────────────────────────────────────

function scheduleAuctionActions(roomCode: string, state: GameState): void {
  const auction = state.auctionState;
  if (!auction) return;

  const pendingBots = state.turnOrder.filter(id => {
    const player = state.players[id];
    if (!player?.isBot || player.bankrupt) return false;
    if (auction.passedPlayerIds.includes(id)) return false;
    if (auction.highestBidderId === id) return false; // Already leading — wait for others
    return true;
  });

  pendingBots.forEach((botId, index) => {
    setTimeout(() => {
      executeBotAuctionAction(roomCode, botId);
    }, BOT_AUCTION_DELAY_MS + index * BOT_AUCTION_STAGGER_MS);
  });
}

function executeBotAuctionAction(roomCode: string, botId: string): void {
  if (!io) return;
  const state = getGame(roomCode);
  if (!state || state.phase !== "auction" || !state.auctionState) return;
  if (state.auctionState.passedPlayerIds.includes(botId)) return;
  if (state.auctionState.highestBidderId === botId) return;

  const player = state.players[botId];
  if (!player || player.bankrupt) return;

  const botType = player.botType ?? "easy";
  const decision = decideAuction(state, botId, botType);

  let result: { state: GameState; error?: string };
  if (decision === "pass") {
    result = auctionPass(roomCode, botId);
  } else {
    result = auctionBid(roomCode, botId, decision);
    if (result.error) result = auctionPass(roomCode, botId);
  }

  if (result.error) return;

  persistGame(roomCode);
  io.to(roomCode).emit("game:stateUpdated", result.state);
  scheduleBotActions(roomCode, result.state);
}

// ─── Turn execution ───────────────────────────────────────────────────────────

function executeBotTurn(roomCode: string, botId: string): void {
  if (!io) return;

  const state = getGame(roomCode);
  if (!state || state.phase === "gameover") return;

  const currentId = state.turnOrder[state.currentTurnIndex];
  if (currentId !== botId) return;

  const player = state.players[botId];
  if (!player || player.bankrupt) return;

  const botType = player.botType ?? "easy";
  let result: { state: GameState; error?: string } | null = null;
  let pendingTrade: TradeOffer | null = null;

  switch (state.phase) {
    case "rolling": {
      console.log(`[BOT] decision selected bot=${botId} phase=rolling jail=${player.inJail}`);

      // Proactive liquidation before rolling
      const liq = decideLiquidation(state, botId);
      if (liq) {
        result = liq.type === "sellBuilding"
          ? sellBuilding(roomCode, botId, liq.spaceIndex)
          : mortgageProperty(roomCode, botId, liq.spaceIndex);
        break;
      }

      if (player.inJail) {
        const jailAction = decideJailAction(state, botId, botType);
        if (jailAction === "gojf") {
          result = useGojf(roomCode, botId);
          if (result.error) result = processRoll(roomCode, botId);
        } else if (jailAction === "fine") {
          result = payJailFine(roomCode, botId);
          if (result.error) result = processRoll(roomCode, botId);
        } else {
          result = processRoll(roomCode, botId);
        }
        break;
      }

      result = processRoll(roomCode, botId);
      break;
    }

    case "buying": {
      const decision = decideBuy(state, botId, botType);
      if (decision === "buy") {
        result = buyProperty(roomCode, botId);
        if (result.error) result = skipProperty(roomCode, botId);
      } else {
        result = skipProperty(roomCode, botId);
      }
      break;
    }

    case "card":
      result = resolveCard(roomCode, botId);
      break;

    case "ended": {
      // 1. Proactive liquidation
      const liq = decideLiquidation(state, botId);
      if (liq) {
        result = liq.type === "sellBuilding"
          ? sellBuilding(roomCode, botId, liq.spaceIndex)
          : mortgageProperty(roomCode, botId, liq.spaceIndex);
        break;
      }

      // 2. Build houses/hotels
      const buildIdx = decideBuild(state, botId, botType);
      if (buildIdx !== null) {
        result = buyBuilding(roomCode, botId, buildIdx);
        if (result.error) result = endTurn(roomCode, botId);
        break;
      }

      // 3. Unmortgage properties
      const unmtgIdx = decideUnmortgage(state, botId, botType);
      if (unmtgIdx !== null) {
        result = unmortgageProperty(roomCode, botId, unmtgIdx);
        if (result.error) result = endTurn(roomCode, botId);
        break;
      }

      // 4. Propose one trade, then end turn immediately to avoid looping
      if (botType !== "easy") {
        const payload = decideOutgoingTrade(state, botId, botType);
        if (payload) {
          const { trade, error: tradeErr } = createTrade(state, payload);
          if (!tradeErr && trade) pendingTrade = trade;
        }
      }

      result = endTurn(roomCode, botId);
      break;
    }

    default:
      return;
  }

  if (!result || result.error) {
    if (result?.error) console.log(`[BOT] action error bot=${botId} phase=${state.phase} err=${result.error}`);
    return;
  }

  console.log(`[BOT] action executed bot=${botId} nextPhase=${result.state.phase} nextTurn=${result.state.turnOrder[result.state.currentTurnIndex]}`);
  persistGame(roomCode);
  io.to(roomCode).emit("game:stateUpdated", result.state);

  if (pendingTrade) {
    io.to(roomCode).emit("game:tradeUpdated", pendingTrade);
  }
  scheduleBotActions(roomCode, result.state);
}

// ─── Timing constants ─────────────────────────────────────────────────────────

const BOT_TURN_DELAY_MS = 800;
const BOT_AUCTION_DELAY_MS = 600;
const BOT_AUCTION_STAGGER_MS = 350;
const BOT_TRADE_DELAY_MS = 500;
