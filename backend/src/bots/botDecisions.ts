import { GameState, PropertyOwnership, TradeOffer } from "../types/game";
import { BOARD } from "../games/monopoly/board";
import { HOUSE_PRICE, COLOR_GROUPS, ownsFullGroup } from "../games/monopoly/buildings";
import { BotType } from "../types";

// ─── Shared utilities ─────────────────────────────────────────────────────────

function levelOf(p: PropertyOwnership | undefined): number {
  return !p ? 0 : p.hasHotel ? 5 : p.houseCount;
}

function estimateValueForBot(spaceIndex: number, state: GameState, botId: string): number {
  const space = BOARD[spaceIndex];
  if (!space.price) return 0;

  let value = space.price;

  if (space.color) {
    const groupIndices = COLOR_GROUPS[space.color] ?? [];
    const ownedByBot = groupIndices.filter(i => state.properties[i]?.ownerId === botId).length;

    if (ownedByBot === groupIndices.length - 1) {
      // Completing a monopoly — greatly increases value
      value = Math.floor(value * 2.5);
    } else if (ownedByBot > 0) {
      value = Math.floor(value * 1.5);
    }
  }

  return value;
}

// ─── Buy decision ─────────────────────────────────────────────────────────────

export function decideBuy(state: GameState, botId: string, difficulty: BotType): "buy" | "skip" {
  const player = state.players[botId];
  const space = BOARD[player.position];
  if (!space.price) return "skip";

  const afterBuyCash = player.cash - space.price;
  const buffer = difficulty === "easy" ? 200 : difficulty === "medium" ? 150 : 80;
  if (afterBuyCash < buffer) return "skip";

  if (difficulty === "easy") return "buy";

  if (space.color) {
    const groupIndices = COLOR_GROUPS[space.color] ?? [];
    const botOwnsInGroup = groupIndices.filter(i => state.properties[i]?.ownerId === botId).length;
    const ownedByOthers = groupIndices.filter(i => {
      const p = state.properties[i];
      return p && p.ownerId !== botId;
    }).length;

    // Medium: skip if opponents have a strong presence and we have no stake in this group
    if (difficulty === "medium" && botOwnsInGroup === 0 && ownedByOthers >= groupIndices.length - 1) {
      return "skip";
    }
    // Hard: buy everything — deny opponents and maximize portfolio
  }

  return "buy";
}

// ─── Jail decision ────────────────────────────────────────────────────────────

export function decideJailAction(
  state: GameState,
  botId: string,
  difficulty: BotType
): "gojf" | "fine" | "roll" {
  const player = state.players[botId];

  if ((player.getOutOfJailFreeCards ?? 0) > 0) return "gojf";

  if (difficulty === "easy") {
    return player.jailTurns >= 2 ? "fine" : "roll";
  }

  if (difficulty === "medium") {
    if (player.cash >= 400) return "fine";
    return player.jailTurns >= 2 ? "fine" : "roll";
  }

  // Hard: stay in jail late-game when opponents have dangerous monopolies
  const activePlayers = state.turnOrder.filter(id => !state.players[id]?.bankrupt && id !== botId);
  const opponentHasMonopoly = activePlayers.some(id =>
    Object.keys(COLOR_GROUPS).some(color => {
      const g = COLOR_GROUPS[color] ?? [];
      return g.every(i => state.properties[i]?.ownerId === id);
    })
  );

  if (opponentHasMonopoly && player.cash < 600 && player.jailTurns < 2) return "roll";
  if (player.cash >= 300) return "fine";
  return player.jailTurns >= 2 ? "fine" : "roll";
}

// ─── Auction decision ─────────────────────────────────────────────────────────

export function decideAuction(
  state: GameState,
  botId: string,
  difficulty: BotType
): number | "pass" {
  if (difficulty === "easy") return "pass";

  const auction = state.auctionState!;
  const player = state.players[botId];
  const propValue = estimateValueForBot(auction.spaceIndex, state, botId);

  const cashReserve = difficulty === "medium" ? 200 : 150;
  const maxAffordable = player.cash - cashReserve;
  const multiplier = difficulty === "medium" ? 0.85 : 1.1;
  const maxBid = Math.min(Math.floor(propValue * multiplier), maxAffordable);

  const nextBid = auction.highestBid + 1;
  if (nextBid > maxBid) return "pass";

  return nextBid;
}

// ─── Build decision ───────────────────────────────────────────────────────────

function canBuildOn(prop: PropertyOwnership, state: GameState): boolean {
  if (!prop.color) return false;
  const groupIndices = COLOR_GROUPS[prop.color] ?? [];
  const minLevel = Math.min(...groupIndices.map(i => levelOf(state.properties[i])));
  return levelOf(prop) <= minLevel;
}

export function decideBuild(state: GameState, botId: string, difficulty: BotType): number | null {
  const player = state.players[botId];
  const cashBuffer = difficulty === "easy" ? 700 : difficulty === "medium" ? 350 : 200;

  const candidates = Object.values(state.properties).filter(p => {
    if (p.ownerId !== botId || p.type !== "property" || !p.color) return false;
    if (p.hasHotel || p.mortgaged) return false;
    if (!ownsFullGroup(p.color, botId, state.properties)) return false;
    const groupIndices = COLOR_GROUPS[p.color] ?? [];
    if (groupIndices.some(i => state.properties[i]?.mortgaged)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Easy: only build on cheap (brown/lightblue) groups
  if (difficulty === "easy") {
    const cheap = candidates.filter(p => (HOUSE_PRICE[p.color!] ?? 999) <= 50);
    for (const prop of cheap) {
      if (!canBuildOn(prop, state)) continue;
      const cost = HOUSE_PRICE[prop.color!] ?? 999;
      if (player.cash - cost < cashBuffer) continue;
      if (prop.houseCount < 4 && state.housesRemaining <= 0) continue;
      if (prop.houseCount >= 4 && state.hotelsRemaining <= 0) continue;
      return prop.spaceIndex;
    }
    return null;
  }

  // Medium/Hard: prioritize highest-value color groups
  const sorted = [...candidates].sort((a, b) =>
    (HOUSE_PRICE[b.color!] ?? 0) - (HOUSE_PRICE[a.color!] ?? 0)
  );

  for (const prop of sorted) {
    if (!canBuildOn(prop, state)) continue;
    const cost = HOUSE_PRICE[prop.color!] ?? 999;
    if (player.cash - cost < cashBuffer) continue;
    if (prop.houseCount < 4 && state.housesRemaining <= 0) continue;
    if (prop.houseCount >= 4 && state.hotelsRemaining <= 0) continue;
    return prop.spaceIndex;
  }

  return null;
}

// ─── Unmortgage decision ──────────────────────────────────────────────────────

export function decideUnmortgage(state: GameState, botId: string, difficulty: BotType): number | null {
  const player = state.players[botId];
  const cashBuffer = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 300;

  const mortgaged = Object.values(state.properties).filter(
    p => p.ownerId === botId && p.mortgaged
  );
  if (mortgaged.length === 0) return null;

  // Prioritize properties in groups where bot owns the most (near-monopoly first)
  const prioritized = [...mortgaged].sort((a, b) => {
    const aColor = a.color ?? "";
    const bColor = b.color ?? "";
    const aCount = aColor ? (COLOR_GROUPS[aColor] ?? []).filter(i => state.properties[i]?.ownerId === botId).length : 0;
    const bCount = bColor ? (COLOR_GROUPS[bColor] ?? []).filter(i => state.properties[i]?.ownerId === botId).length : 0;
    return bCount - aCount;
  });

  for (const prop of prioritized) {
    const cost = Math.ceil(prop.price / 2 * 1.1);
    if (player.cash - cost >= cashBuffer) return prop.spaceIndex;
  }

  return null;
}

// ─── Liquidation decision ─────────────────────────────────────────────────────

export interface LiquidationAction {
  type: "sellBuilding" | "mortgage";
  spaceIndex: number;
}

function canSellFrom(prop: PropertyOwnership, state: GameState): boolean {
  if (!prop.color) return false;
  const groupIndices = COLOR_GROUPS[prop.color] ?? [];
  const maxLevel = Math.max(...groupIndices.map(i => levelOf(state.properties[i])));
  return levelOf(prop) >= maxLevel;
}

export function decideLiquidation(state: GameState, botId: string): LiquidationAction | null {
  const player = state.players[botId];
  if (player.cash >= 80) return null;

  // 1. Sell hotels first
  const hotels = Object.values(state.properties).filter(
    p => p.ownerId === botId && p.hasHotel && p.color && canSellFrom(p, state)
  );
  if (hotels.length > 0) return { type: "sellBuilding", spaceIndex: hotels[0].spaceIndex };

  // 2. Sell houses (least valuable group first)
  const houses = Object.values(state.properties)
    .filter(p => p.ownerId === botId && !p.hasHotel && p.houseCount > 0 && p.color && canSellFrom(p, state))
    .sort((a, b) => (HOUSE_PRICE[a.color!] ?? 0) - (HOUSE_PRICE[b.color!] ?? 0));
  if (houses.length > 0) return { type: "sellBuilding", spaceIndex: houses[0].spaceIndex };

  // 3. Mortgage (cheapest unbuilt property first)
  const toMortgage = Object.values(state.properties)
    .filter(p => p.ownerId === botId && !p.mortgaged && !p.hasHotel && p.houseCount === 0)
    .sort((a, b) => a.price - b.price);
  if (toMortgage.length > 0) return { type: "mortgage", spaceIndex: toMortgage[0].spaceIndex };

  return null;
}

// ─── Incoming trade decision ──────────────────────────────────────────────────

export function evaluateIncomingTrade(
  state: GameState,
  trade: TradeOffer,
  botId: string,
  difficulty: BotType
): "accept" | "reject" {
  if (trade.toId !== botId) return "reject";

  // Always accept if this completes a monopoly for the bot
  const completesMonopoly = trade.offeredPropertyIndices.some(idx => {
    const space = BOARD[idx];
    if (!space.color) return false;
    const groupIndices = COLOR_GROUPS[space.color] ?? [];
    const alreadyOwned = groupIndices.filter(i => state.properties[i]?.ownerId === botId).length;
    const wouldGain = trade.offeredPropertyIndices.filter(
      i => BOARD[i]?.color === space.color
    ).length;
    return alreadyOwned + wouldGain === groupIndices.length;
  });
  if (completesMonopoly) return "accept";

  // Net value calculation
  let receiveValue = trade.offeredCash;
  for (const idx of trade.offeredPropertyIndices) {
    receiveValue += estimateValueForBot(idx, state, botId);
  }

  let giveValue = trade.requestedCash;
  for (const idx of trade.requestedPropertyIndices) {
    giveValue += estimateValueForBot(idx, state, botId);
    // Heavy penalty for breaking an existing monopoly
    const space = BOARD[idx];
    if (space.color && ownsFullGroup(space.color, botId, state.properties)) {
      giveValue += (space.price ?? 0) * 2;
    }
  }

  const netGain = receiveValue - giveValue;
  // Easy bots accept bad deals; Hard bots only accept clearly good ones
  const threshold = difficulty === "easy" ? -150 : difficulty === "medium" ? 0 : 100;
  return netGain >= threshold ? "accept" : "reject";
}

// ─── Outgoing trade decision ──────────────────────────────────────────────────

export interface TradePayload {
  fromId: string;
  toId: string;
  offeredCash: number;
  requestedCash: number;
  offeredPropertyIndices: number[];
  requestedPropertyIndices: number[];
}

export function decideOutgoingTrade(
  state: GameState,
  botId: string,
  difficulty: BotType
): TradePayload | null {
  if (difficulty === "easy") return null;

  const player = state.players[botId];

  const hasPendingTrade = (targetId: string): boolean =>
    Object.values(state.trades).some(
      t =>
        t.status === "pending" &&
        ((t.fromId === botId && t.toId === targetId) ||
          (t.fromId === targetId && t.toId === botId))
    );

  // Look for the single missing property that would complete a monopoly
  for (const color of Object.keys(COLOR_GROUPS)) {
    const groupIndices = COLOR_GROUPS[color] ?? [];
    const botOwned = groupIndices.filter(i => state.properties[i]?.ownerId === botId);
    if (botOwned.length === 0) continue;

    const missing = groupIndices.filter(i => {
      const prop = state.properties[i];
      return !prop || prop.ownerId !== botId;
    });
    if (missing.length !== 1) continue;

    const missingIdx = missing[0];
    const missingProp = state.properties[missingIdx];
    if (!missingProp) continue; // Unowned — let auction handle it

    const targetId = missingProp.ownerId;
    if (state.players[targetId]?.bankrupt) continue;
    if (hasPendingTrade(targetId)) continue;

    const space = BOARD[missingIdx];
    const basePrice = space.price ?? 0;
    const multiplier = difficulty === "hard" ? 1.5 : 1.3;
    const offerCash = Math.floor(basePrice * multiplier);
    const cashBuffer = difficulty === "hard" ? 300 : 400;

    if (player.cash < offerCash + cashBuffer) continue;

    return {
      fromId: botId,
      toId: targetId,
      offeredCash: offerCash,
      requestedCash: 0,
      offeredPropertyIndices: [],
      requestedPropertyIndices: [missingIdx],
    };
  }

  return null;
}
