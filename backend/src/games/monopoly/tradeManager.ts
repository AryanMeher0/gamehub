import { GameState, TradeOffer } from "../../types/game";
import { getRent } from "./buildings";

let tradeCounter = 0;
function nextTradeId(): string {
  return `trade_${++tradeCounter}`;
}

interface CreateTradeInput {
  fromId: string;
  toId: string;
  offeredCash: number;
  requestedCash: number;
  offeredPropertyIndices: number[];
  requestedPropertyIndices: number[];
  offeredGojfCount?: number;
  requestedGojfCount?: number;
}

export function createTrade(
  state: GameState,
  input: CreateTradeInput
): { trade?: TradeOffer; error?: string } {
  if (state.gameOver) return { error: "Game is over" };

  const from = state.players[input.fromId];
  const to   = state.players[input.toId];

  if (!from || from.bankrupt) return { error: "You are not an active player" };
  if (!to   || to.bankrupt)   return { error: "Target player is not active" };
  if (input.fromId === input.toId) return { error: "Cannot trade with yourself" };

  // Prevent duplicate pending offers between same pair
  const existing = Object.values(state.trades).find(
    (t) =>
      t.status === "pending" &&
      ((t.fromId === input.fromId && t.toId === input.toId) ||
       (t.fromId === input.toId   && t.toId === input.fromId))
  );
  if (existing) return { error: "A pending trade already exists between these players" };

  if (input.offeredCash < 0 || input.requestedCash < 0) return { error: "Cash amounts must be non-negative" };
  if (from.cash < input.offeredCash) return { error: "Insufficient cash to offer" };

  const offeredGojf = input.offeredGojfCount ?? 0;
  const requestedGojf = input.requestedGojfCount ?? 0;
  if (offeredGojf < 0 || requestedGojf < 0) return { error: "GOJF card counts must be non-negative" };
  if (offeredGojf > (from.getOutOfJailFreeCards ?? 0)) return { error: "You don't have that many Get Out of Jail Free cards" };
  if (requestedGojf > (to.getOutOfJailFreeCards ?? 0)) return { error: "Target player doesn't have that many Get Out of Jail Free cards" };

  for (const idx of input.offeredPropertyIndices) {
    if (state.properties[idx]?.ownerId !== input.fromId) {
      return { error: `You don't own property at index ${idx}` };
    }
  }
  for (const idx of input.requestedPropertyIndices) {
    if (state.properties[idx]?.ownerId !== input.toId) {
      return { error: `Target doesn't own property at index ${idx}` };
    }
  }

  const trade: TradeOffer = {
    id: nextTradeId(),
    fromId: input.fromId,
    toId: input.toId,
    offeredCash: input.offeredCash,
    requestedCash: input.requestedCash,
    offeredPropertyIndices: input.offeredPropertyIndices,
    requestedPropertyIndices: input.requestedPropertyIndices,
    offeredGojfCount: offeredGojf,
    requestedGojfCount: requestedGojf,
    status: "pending",
  };

  state.trades[trade.id] = trade;

  const fromName = from.name;
  const toName   = to.name;
  const parts: string[] = [];
  if (input.offeredCash > 0) parts.push(`$${input.offeredCash}`);
  for (const idx of input.offeredPropertyIndices) parts.push(state.properties[idx].name);
  if (offeredGojf > 0) parts.push(`${offeredGojf}x GOJF card`);

  const wantParts: string[] = [];
  if (input.requestedCash > 0) wantParts.push(`$${input.requestedCash}`);
  for (const idx of input.requestedPropertyIndices) wantParts.push(state.properties[idx].name);
  if (requestedGojf > 0) wantParts.push(`${requestedGojf}x GOJF card`);

  state.log.push(
    `🤝 ${fromName} offered ${parts.join(", ") || "nothing"} to ${toName}` +
    (wantParts.length ? ` in exchange for ${wantParts.join(", ")}` : "") + "."
  );

  return { trade };
}

export function acceptTrade(
  state: GameState,
  tradeId: string,
  acceptorId: string
): { error?: string } {
  const trade = state.trades[tradeId];
  if (!trade) return { error: "Trade not found" };
  if (trade.status !== "pending") return { error: "Trade is no longer pending" };
  if (trade.toId !== acceptorId) return { error: "Not your trade to accept" };

  const from = state.players[trade.fromId];
  const to   = state.players[trade.toId];
  if (!from || from.bankrupt) return { error: "Initiator is no longer active" };
  if (!to   || to.bankrupt)   return { error: "You are no longer active" };

  // Re-validate at execution time
  if (from.cash < trade.offeredCash)   return { error: "Initiator no longer has enough cash" };
  if (to.cash   < trade.requestedCash) return { error: "You no longer have enough cash" };
  if ((trade.offeredGojfCount ?? 0) > (from.getOutOfJailFreeCards ?? 0)) {
    return { error: "Initiator no longer has enough Get Out of Jail Free cards" };
  }
  if ((trade.requestedGojfCount ?? 0) > (to.getOutOfJailFreeCards ?? 0)) {
    return { error: "You no longer have enough Get Out of Jail Free cards" };
  }

  for (const idx of trade.offeredPropertyIndices) {
    if (state.properties[idx]?.ownerId !== trade.fromId) {
      return { error: `Initiator no longer owns ${state.properties[idx]?.name ?? idx}` };
    }
  }
  for (const idx of trade.requestedPropertyIndices) {
    if (state.properties[idx]?.ownerId !== trade.toId) {
      return { error: `You no longer own ${state.properties[idx]?.name ?? idx}` };
    }
  }

  // Execute
  from.cash -= trade.offeredCash;
  to.cash   += trade.offeredCash;
  to.cash   -= trade.requestedCash;
  from.cash += trade.requestedCash;

  // Transfer GOJF cards
  const offeredGojf = trade.offeredGojfCount ?? 0;
  const requestedGojf = trade.requestedGojfCount ?? 0;
  from.getOutOfJailFreeCards = (from.getOutOfJailFreeCards ?? 0) - offeredGojf + requestedGojf;
  to.getOutOfJailFreeCards   = (to.getOutOfJailFreeCards   ?? 0) + offeredGojf - requestedGojf;

  for (const idx of trade.offeredPropertyIndices) {
    const prop = state.properties[idx];
    prop.ownerId = trade.toId;
    // Recalculate rent based on current buildings (buildings are preserved)
    prop.rent = getRent(idx, prop.houseCount, prop.hasHotel);
    state.log.push(`  ${prop.name} transferred to ${to.name}.`);
  }
  for (const idx of trade.requestedPropertyIndices) {
    const prop = state.properties[idx];
    prop.ownerId = trade.fromId;
    prop.rent = getRent(idx, prop.houseCount, prop.hasHotel);
    state.log.push(`  ${prop.name} transferred to ${from.name}.`);
  }

  trade.status = "accepted";
  state.log.push(`✅ ${to.name} accepted the trade with ${from.name}.`);

  return {};
}

export function rejectTrade(
  state: GameState,
  tradeId: string,
  rejectorId: string
): { error?: string } {
  const trade = state.trades[tradeId];
  if (!trade) return { error: "Trade not found" };
  if (trade.status !== "pending") return { error: "Trade is no longer pending" };
  if (trade.toId !== rejectorId) return { error: "Not your trade to reject" };

  trade.status = "rejected";
  const from = state.players[trade.fromId];
  const to   = state.players[trade.toId];
  state.log.push(`❌ ${to?.name ?? "Player"} rejected the trade offer from ${from?.name ?? "Player"}.`);

  return {};
}
