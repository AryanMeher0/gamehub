import { GameState, GamePlayer, DiceRoll, PropertyOwnership, PlayerRanking, AuctionState } from "../../types/game";
import { BOARD, BOARD_SIZE, GO_SALARY, JAIL_POSITION, isPurchasable } from "./board";
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS, drawFromDeck, shuffleDeck } from "./cards";
import { HOUSE_PRICE, HOTEL_RETURN_HOUSES, getRent, ownsFullGroup, COLOR_GROUPS } from "./buildings";
import { saveGame, loadGame } from "../../saveManager";

interface MonopolySave extends GameState {
  savedAt: number;
  playerNames: string[];
}

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];
const STARTING_CASH = 1500;
const MAX_HOUSES = 32;
const MAX_HOTELS = 12;

const games: Record<string, GameState> = {};

// ─── Dice ────────────────────────────────────────────────────────────────────

function rollDice(): DiceRoll {
  const die1 = Math.ceil(Math.random() * 6);
  const die2 = Math.ceil(Math.random() * 6);
  return { die1, die2, total: die1 + die2, isDoubles: die1 === die2 };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countOwnedRailroads(state: GameState, ownerId: string): number {
  return Object.values(state.properties).filter(
    (p) => p.ownerId === ownerId && p.type === "railroad" && !p.mortgaged
  ).length;
}

function countOwnedUtilities(state: GameState, ownerId: string): number {
  return Object.values(state.properties).filter(
    (p) => p.ownerId === ownerId && p.type === "utility" && !p.mortgaged
  ).length;
}

function isUnimprovedMonopoly(
  color: string,
  playerId: string,
  spaceIndex: number,
  properties: Record<number, PropertyOwnership>
): boolean {
  if (!ownsFullGroup(color, playerId, properties)) return false;
  const groupIndices = (COLOR_GROUPS[color] ?? []);
  if (groupIndices.length === 0) return false;
  return groupIndices.every((idx) => {
    const prop = properties[idx];
    return prop && prop.houseCount === 0 && !prop.hasHotel && !prop.mortgaged;
  });
}

function getCurrentPlayerId(state: GameState): string {
  return state.turnOrder[state.currentTurnIndex];
}

function findNearestRailroad(position: number): number {
  const railroads = [5, 15, 25, 35];
  for (const rr of railroads) {
    if (rr > position) return rr;
  }
  return railroads[0]; // wrap to Reading Railroad
}

function findNearestUtility(position: number): number {
  if (position < 12) return 12; // Electric Company
  if (position < 28) return 28; // Water Works
  return 12; // wrap to Electric Company
}

function playerNetWorth(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player) return 0;
  let worth = player.cash;
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId !== playerId) continue;
    worth += prop.mortgaged ? Math.floor(prop.price / 2) : prop.price;
    if (prop.type === "property" && prop.color) {
      const hcost = HOUSE_PRICE[prop.color] ?? 0;
      worth += prop.hasHotel
        ? hcost * HOTEL_RETURN_HOUSES
        : prop.houseCount * hcost;
    }
  }
  return worth;
}

// ─── Bankruptcy & Victory ─────────────────────────────────────────────────────

function buildRankings(state: GameState): PlayerRanking[] {
  return Object.values(state.players)
    .sort((a, b) => {
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      return playerNetWorth(state, b.id) - playerNetWorth(state, a.id);
    })
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cash: p.cash,
      propertyCount: Object.values(state.properties).filter((pr) => pr.ownerId === p.id).length,
      netWorth: playerNetWorth(state, p.id),
      rank: i + 1,
    }));
}

function checkVictory(state: GameState): boolean {
  const active = state.turnOrder.filter((id) => !state.players[id]?.bankrupt);
  if (active.length !== 1) return false;

  const winner = state.players[active[0]];
  state.gameOver = true;
  state.phase = "gameover";
  state.winnerId = winner.id;
  state.winnerName = winner.name;
  state.rankings = buildRankings(state);
  state.log.push(`🏆 ${winner.name} wins the game!`);
  return true;
}

function applyBankruptcy(state: GameState, playerId: string, creditorId: string | null): void {
  const player = state.players[playerId];
  if (!player || player.bankrupt) return;

  player.bankrupt = true;
  player.cash = 0;
  state.log.push(`💸 ${player.name} is bankrupt!`);

  for (const key of Object.keys(state.properties)) {
    const prop = state.properties[Number(key)];
    if (prop.ownerId !== playerId) continue;

    if (creditorId && state.players[creditorId] && !state.players[creditorId].bankrupt) {
      // Transfer to creditor INCLUDING buildings; unmortgage state preserved
      prop.ownerId = creditorId;
      state.log.push(`  ${prop.name} transferred to ${state.players[creditorId].name}.`);
    } else {
      // Return to bank — sell buildings first at half price (goes nowhere, bank absorbs)
      if (prop.hasHotel) {
        state.hotelsRemaining += 1;
        state.housesRemaining += HOTEL_RETURN_HOUSES;
      } else {
        state.housesRemaining += prop.houseCount;
      }
      delete state.properties[Number(key)];
      state.log.push(`  ${prop.name} returned to the bank.`);
    }
  }

  const idx = state.turnOrder.indexOf(playerId);
  if (idx !== -1) {
    state.turnOrder.splice(idx, 1);
    if (state.currentTurnIndex >= state.turnOrder.length) {
      state.currentTurnIndex = 0;
    }
  }
}

// ─── Auction ──────────────────────────────────────────────────────────────────

function startAuction(state: GameState, spaceIndex: number): void {
  const space = BOARD[spaceIndex];
  state.auctionState = {
    spaceIndex,
    highestBid: 0,
    highestBidderId: null,
    passedPlayerIds: [],
  };
  state.phase = "auction";
  state.log.push(`🔨 ${space.name} goes to auction! All players may bid.`);
}

function concludeAuction(state: GameState): void {
  const auction = state.auctionState!;
  const space = BOARD[auction.spaceIndex];

  if (auction.highestBidderId && auction.highestBid > 0) {
    const winner = state.players[auction.highestBidderId];
    winner.cash -= auction.highestBid;
    state.properties[auction.spaceIndex] = {
      spaceIndex: auction.spaceIndex,
      ownerId: auction.highestBidderId,
      price: auction.highestBid,
      rent: space.rent ?? 0,
      name: space.name,
      color: space.color,
      type: space.type,
      houseCount: 0,
      hasHotel: false,
      mortgaged: false,
    };
    state.log.push(
      `🔨 ${winner.name} won the auction for ${space.name} at $${auction.highestBid}!`
    );
  } else {
    state.log.push(`🔨 No bids placed — ${space.name} remains with the bank.`);
  }

  state.auctionState = null;
  state.phase = "ended";
}

function checkAuctionEnd(state: GameState): void {
  const auction = state.auctionState;
  if (!auction) return;

  const activePlayers = state.turnOrder.filter((id) => !state.players[id]?.bankrupt);
  const stillBidding = activePlayers.filter((id) => !auction.passedPlayerIds.includes(id));

  if (stillBidding.length === 0) {
    concludeAuction(state);
  } else if (
    stillBidding.length === 1 &&
    auction.highestBidderId !== null &&
    stillBidding[0] === auction.highestBidderId
  ) {
    concludeAuction(state);
  }
}

// ─── Landing logic (shared by processRoll and card moves) ────────────────────

interface LandingOptions {
  doubleRailroadRent?: boolean;
  utilityTenX?: boolean;
}

function applyLanding(
  state: GameState,
  playerId: string,
  roll: DiceRoll | null,
  options: LandingOptions = {}
): void {
  const player = state.players[playerId];
  const position = player.position;
  const space = BOARD[position];

  state.log.push(`${player.name} landed on ${space.name}.`);

  if (space.type === "go_to_jail") {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    player.consecutiveDoubles = 0;
    state.log.push(`${player.name} is sent to Jail!`);
    state.phase = "ended";
    return;
  }

  if (space.type === "chance") {
    const { card, remaining } = drawFromDeck(state.chanceDeck, CHANCE_CARDS);
    state.chanceDeck = remaining;
    state.activeCard = { id: card.id, title: card.title, description: card.description, deck: "chance" };
    state.log.push(`${player.name} drew a Chance card: "${card.title}"`);
    state.phase = "card";
    return;
  }

  if (space.type === "community") {
    const { card, remaining } = drawFromDeck(state.communityDeck, COMMUNITY_CHEST_CARDS);
    state.communityDeck = remaining;
    state.activeCard = { id: card.id, title: card.title, description: card.description, deck: "community" };
    state.log.push(`${player.name} drew a Community Chest card: "${card.title}"`);
    state.phase = "card";
    return;
  }

  if (space.type === "tax" && space.tax) {
    player.cash -= space.tax;
    if (player.cash < 0) {
      state.log.push(`${player.name} cannot pay $${space.tax} tax and is bankrupt!`);
      applyBankruptcy(state, playerId, null);
      if (!checkVictory(state)) state.phase = "ended";
    } else {
      state.log.push(`${player.name} paid $${space.tax} in tax.`);
      state.phase = "ended";
    }
    return;
  }

  if (isPurchasable(space.type) && space.price !== undefined) {
    const existing = state.properties[position];

    if (!existing) {
      if (player.cash >= (space.price ?? 0)) {
        state.phase = "buying";
      } else {
        log(state, `${player.name} cannot afford ${space.name} — it goes to auction.`);
        startAuction(state, position);
      }
      return;
    }

    if (existing.ownerId !== playerId && !existing.mortgaged) {
      let rent = 0;
      const owner = state.players[existing.ownerId];

      if (space.type === "property") {
        rent = getRent(position, existing.houseCount, existing.hasHotel);
        if (
          existing.color &&
          isUnimprovedMonopoly(existing.color, existing.ownerId, position, state.properties)
        ) {
          rent *= 2;
          state.log.push(`Unimproved monopoly! Rent doubled for ${space.name} → $${rent}.`);
        }
      } else if (space.type === "railroad") {
        const rrCount = countOwnedRailroads(state, existing.ownerId);
        const base = rrCount === 1 ? 25 : rrCount === 2 ? 50 : rrCount === 3 ? 100 : 200;
        rent = options.doubleRailroadRent ? base * 2 : base;
        if (options.doubleRailroadRent) {
          state.log.push(`Chance railroad card — double rent: $${rent}.`);
        }
      } else if (space.type === "utility") {
        const diceTotal = roll?.total ?? state.lastRoll?.total ?? 7;
        const mult = options.utilityTenX ? 10 : (countOwnedUtilities(state, existing.ownerId) === 1 ? 4 : 10);
        rent = diceTotal * mult;
        if (options.utilityTenX) {
          state.log.push(`Chance utility card — 10× dice (${diceTotal}) = $${rent}.`);
        }
      }

      if (player.cash < rent) {
        const partial = player.cash;
        if (owner) owner.cash += partial;
        const buildingSuffix = existing.hasHotel ? " (hotel)" : existing.houseCount > 0 ? ` (${existing.houseCount}H)` : "";
        state.log.push(
          `${player.name} cannot pay $${rent} rent on ${space.name}${buildingSuffix} — only $${partial} paid.`
        );
        applyBankruptcy(state, playerId, existing.ownerId);
        if (!checkVictory(state)) state.phase = "ended";
        return;
      }

      player.cash -= rent;
      if (owner) owner.cash += rent;
      const buildingSuffix = existing.hasHotel ? " (hotel)" : existing.houseCount > 0 ? ` (${existing.houseCount}H)` : "";
      state.log.push(
        `${player.name} paid $${rent} rent to ${owner?.name ?? "bank"} for ${space.name}${buildingSuffix}.`
      );
    } else if (existing.mortgaged && existing.ownerId !== playerId) {
      state.log.push(`${space.name} is mortgaged — no rent collected.`);
    }
  }

  state.phase = "ended";
}

function log(state: GameState, msg: string): void {
  state.log.push(msg);
}

// ─── createGame ───────────────────────────────────────────────────────────────

function createGame(roomCode: string, playerIds: string[]): GameState {
  const players: Record<string, GamePlayer> = {};
  playerIds.forEach((id, i) => {
    players[id] = {
      id,
      name: `Player ${i + 1}`,
      position: 0,
      cash: STARTING_CASH,
      inJail: false,
      jailTurns: 0,
      consecutiveDoubles: 0,
      getOutOfJailFreeCards: 0,
      color: PLAYER_COLORS[i] ?? "#ffffff",
      bankrupt: false,
    };
  });

  games[roomCode] = {
    roomCode,
    players,
    turnOrder: [...playerIds],
    currentTurnIndex: 0,
    phase: "rolling",
    lastRoll: null,
    properties: {},
    log: ["Game started! Player 1 goes first."],
    activeCard: null,
    gameOver: false,
    winnerId: null,
    winnerName: null,
    rankings: [],
    trades: {},
    auctionState: null,
    housesRemaining: MAX_HOUSES,
    hotelsRemaining: MAX_HOTELS,
    chanceDeck: shuffleDeck(CHANCE_CARDS),
    communityDeck: shuffleDeck(COMMUNITY_CHEST_CARDS),
  };

  return games[roomCode];
}

// ─── processRoll ──────────────────────────────────────────────────────────────

function processRoll(
  roomCode: string,
  socketId: string,
  forcedRoll?: DiceRoll
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };

  const currentId = getCurrentPlayerId(state);
  if (currentId !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "rolling") return { state, error: "Already rolled this turn" };

  const roll = forcedRoll ?? rollDice();
  state.lastRoll = roll;
  const player = state.players[socketId];

  state.log.push(`${player.name} rolled ${roll.die1} + ${roll.die2} = ${roll.total}`);

  // Consecutive doubles → jail on 3rd
  if (roll.isDoubles) {
    player.consecutiveDoubles += 1;
    state.log.push(`${player.name} rolled doubles (${player.consecutiveDoubles}/3).`);
    if (player.consecutiveDoubles >= 3) {
      player.position = JAIL_POSITION;
      player.inJail = true;
      player.jailTurns = 0;
      player.consecutiveDoubles = 0;
      state.log.push(`${player.name} rolled 3 consecutive doubles — sent to Jail!`);
      state.phase = "ended";
      return { state };
    }
  } else {
    player.consecutiveDoubles = 0;
  }

  // Jail logic
  if (player.inJail) {
    if (roll.isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      player.consecutiveDoubles = 0;
      state.log.push(`${player.name} rolled doubles and escaped jail!`);
      // Per official rules: escaping jail via doubles does NOT grant another turn.
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        player.inJail = false;
        player.jailTurns = 0;
        player.cash -= 50;
        player.consecutiveDoubles = 0;
        state.log.push(`${player.name} paid $50 to get out of jail.`);
      } else {
        state.log.push(`${player.name} is in jail (turn ${player.jailTurns}/3).`);
        state.phase = "ended";
        return { state };
      }
    }
  }

  // Move
  const prevPosition = player.position;
  const newPosition = (prevPosition + roll.total) % BOARD_SIZE;
  player.position = newPosition;

  // Passing GO (but NOT landing on GO — that's handled separately below)
  if (newPosition !== 0 && newPosition < prevPosition) {
    player.cash += GO_SALARY;
    state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
  }

  // Landing exactly on GO
  if (newPosition === 0) {
    player.cash += GO_SALARY;
    state.log.push(`${player.name} landed on GO and collected $${GO_SALARY}!`);
  }

  applyLanding(state, socketId, roll);
  return { state };
}

// ─── resolveCard ─────────────────────────────────────────────────────────────

function resolveCard(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "card" || !state.activeCard) return { state, error: "No active card" };

  const player = state.players[socketId];
  const cardId = state.activeCard.id;
  const deck = state.activeCard.deck === "chance" ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
  const card = deck.find((c) => c.id === cardId);

  state.activeCard = null;

  if (!card) {
    state.phase = "ended";
    return { state };
  }

  const { effect } = card;

  if (effect.type === "receive_money") {
    player.cash += effect.amount;
    state.log.push(`${player.name} received $${effect.amount}.`);
    state.phase = "ended";

  } else if (effect.type === "pay_money") {
    player.cash -= effect.amount;
    if (player.cash < 0) {
      state.log.push(`${player.name} cannot pay $${effect.amount} and is bankrupt!`);
      applyBankruptcy(state, socketId, null);
      if (!checkVictory(state)) state.phase = "ended";
    } else {
      state.log.push(`${player.name} paid $${effect.amount}.`);
      state.phase = "ended";
    }

  } else if (effect.type === "gojf_keep") {
    player.getOutOfJailFreeCards = (player.getOutOfJailFreeCards ?? 0) + 1;
    state.log.push(`${player.name} received a Get Out of Jail Free card.`);
    state.phase = "ended";

  } else if (effect.type === "go_to_jail") {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    state.log.push(`${player.name} was sent to Jail!`);
    state.phase = "ended";

  } else if (effect.type === "move_to") {
    const target = effect.position;
    const prev = player.position;
    // Pass GO if target is behind current position (but not landing ON GO which we check next)
    if (target !== 0 && target < prev) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
    }
    if (target === 0) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} advanced to GO and collected $${GO_SALARY}!`);
    }
    player.position = target;
    applyLanding(state, socketId, state.lastRoll);

  } else if (effect.type === "move_forward") {
    const prev = player.position;
    player.position = (prev + effect.steps) % BOARD_SIZE;
    if (player.position < prev) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
    }
    applyLanding(state, socketId, state.lastRoll);

  } else if (effect.type === "move_backward") {
    player.position = (player.position - effect.steps + BOARD_SIZE) % BOARD_SIZE;
    // Moving backward never collects GO salary
    applyLanding(state, socketId, state.lastRoll);

  } else if (effect.type === "advance_nearest_railroad") {
    const target = findNearestRailroad(player.position);
    if (target <= player.position) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
    }
    player.position = target;
    applyLanding(state, socketId, state.lastRoll, { doubleRailroadRent: true });

  } else if (effect.type === "advance_nearest_utility") {
    const target = findNearestUtility(player.position);
    if (target <= player.position) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
    }
    player.position = target;
    applyLanding(state, socketId, state.lastRoll, { utilityTenX: true });

  } else if (effect.type === "pay_each_player") {
    const others = state.turnOrder.filter(
      (id) => id !== socketId && !state.players[id]?.bankrupt
    );
    const total = effect.amount * others.length;
    if (player.cash < total) {
      // Pay what we can proportionally, then go bankrupt
      const share = Math.floor(player.cash / Math.max(others.length, 1));
      for (const otherId of others) {
        state.players[otherId].cash += share;
      }
      state.log.push(`${player.name} cannot pay $${total} total — paid $${share} each and is bankrupt!`);
      applyBankruptcy(state, socketId, null);
      if (!checkVictory(state)) state.phase = "ended";
    } else {
      player.cash -= total;
      for (const otherId of others) {
        state.players[otherId].cash += effect.amount;
      }
      state.log.push(`${player.name} paid $${effect.amount} to each player ($${total} total).`);
      state.phase = "ended";
    }

  } else if (effect.type === "collect_from_each_player") {
    const others = state.turnOrder.filter(
      (id) => id !== socketId && !state.players[id]?.bankrupt
    );
    let collected = 0;
    for (const otherId of others) {
      const other = state.players[otherId];
      const amt = Math.min(effect.amount, other.cash);
      other.cash -= amt;
      player.cash += amt;
      collected += amt;
    }
    state.log.push(`${player.name} collected $${effect.amount} from each player ($${collected} total).`);
    state.phase = "ended";

  } else if (effect.type === "street_repairs") {
    let total = 0;
    for (const prop of Object.values(state.properties)) {
      if (prop.ownerId !== socketId || prop.type !== "property") continue;
      total += prop.hasHotel ? effect.hotelCost : prop.houseCount * effect.houseCost;
    }
    if (total === 0) {
      state.log.push(`${player.name} has no buildings. No street repair costs.`);
      state.phase = "ended";
    } else if (player.cash < total) {
      state.log.push(`${player.name} cannot pay $${total} for street repairs and is bankrupt!`);
      applyBankruptcy(state, socketId, null);
      if (!checkVictory(state)) state.phase = "ended";
    } else {
      player.cash -= total;
      state.log.push(`${player.name} paid $${total} for street repairs (${effect.houseCost}/house, ${effect.hotelCost}/hotel).`);
      state.phase = "ended";
    }
  }

  return { state };
}

// ─── buyProperty / skipProperty ──────────────────────────────────────────────

function buyProperty(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "buying") return { state, error: "Nothing to buy" };

  const player = state.players[socketId];
  const space = BOARD[player.position];

  if (!space.price || space.rent === undefined) {
    state.phase = "ended";
    return { state, error: "Space is not purchasable" };
  }

  if (player.cash < space.price) {
    state.log.push(`${player.name} cannot afford ${space.name}.`);
    startAuction(state, player.position);
    return { state };
  }

  player.cash -= space.price;
  state.properties[player.position] = {
    spaceIndex: player.position,
    ownerId: socketId,
    price: space.price,
    rent: space.rent,
    name: space.name,
    color: space.color,
    type: space.type,
    houseCount: 0,
    hasHotel: false,
    mortgaged: false,
  };
  state.log.push(`${player.name} bought ${space.name} for $${space.price}.`);
  state.phase = "ended";
  return { state };
}

function skipProperty(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "buying") return { state, error: "Nothing to skip" };

  const player = state.players[socketId];
  const space = BOARD[player.position];
  state.log.push(`${player.name} declined to buy ${space.name} — going to auction.`);
  startAuction(state, player.position);
  return { state };
}

// ─── Auction actions ─────────────────────────────────────────────────────────

function auctionBid(
  roomCode: string,
  socketId: string,
  amount: number
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase !== "auction" || !state.auctionState) return { state, error: "No active auction" };

  const auction = state.auctionState;
  if (auction.passedPlayerIds.includes(socketId)) return { state, error: "You have already passed on this auction" };

  const player = state.players[socketId];
  if (!player || player.bankrupt) return { state, error: "Player not found or bankrupt" };

  if (!Number.isInteger(amount) || amount <= auction.highestBid) {
    return { state, error: `Bid must be higher than current highest bid ($${auction.highestBid})` };
  }
  if (amount > player.cash) {
    return { state, error: `You cannot afford to bid $${amount} (you have $${player.cash})` };
  }

  auction.highestBid = amount;
  auction.highestBidderId = socketId;
  state.log.push(`${player.name} bid $${amount} for ${BOARD[auction.spaceIndex].name}.`);

  checkAuctionEnd(state);
  return { state };
}

function auctionPass(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase !== "auction" || !state.auctionState) return { state, error: "No active auction" };

  const auction = state.auctionState;
  if (auction.passedPlayerIds.includes(socketId)) return { state, error: "You have already passed" };

  const player = state.players[socketId];
  if (!player || player.bankrupt) return { state, error: "Player not found or bankrupt" };

  auction.passedPlayerIds.push(socketId);
  state.log.push(`${player.name} passed on the auction.`);

  checkAuctionEnd(state);
  return { state };
}

// ─── endTurn ─────────────────────────────────────────────────────────────────

function endTurn(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "ended") return { state, error: "Must resolve current action before ending turn" };

  // consecutiveDoubles > 0 means the player rolled doubles and did NOT go to jail
  // (jail escape via doubles resets consecutiveDoubles to 0, so no extra turn per official rules)
  const player = state.players[socketId];

  if (player.consecutiveDoubles > 0) {
    state.phase = "rolling";
    state.lastRoll = null;
    state.log.push(`${player.name} rolled doubles — roll again!`);
    return { state };
  }
  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
  state.phase = "rolling";
  state.lastRoll = null;

  const nextPlayer = state.players[getCurrentPlayerId(state)];
  state.log.push(`It's now ${nextPlayer.name}'s turn.`);
  return { state };
}

// ─── buyBuilding ─────────────────────────────────────────────────────────────

function buyBuilding(
  roomCode: string,
  socketId: string,
  spaceIndex: number
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "ended") return { state, error: "Can only build after rolling" };

  const ownership = state.properties[spaceIndex];
  if (!ownership) return { state, error: "You don't own that property" };
  if (ownership.ownerId !== socketId) return { state, error: "You don't own that property" };
  if (ownership.type !== "property" || !ownership.color) return { state, error: "Can only build on color properties" };
  if (ownership.mortgaged) return { state, error: "Cannot build on a mortgaged property" };
  if (!ownsFullGroup(ownership.color, socketId, state.properties)) {
    return { state, error: "You must own the full color group to build" };
  }

  // Check any group member is mortgaged
  const groupIndices = COLOR_GROUPS[ownership.color] ?? [];
  const anyMortgaged = groupIndices.some((idx) => state.properties[idx]?.mortgaged);
  if (anyMortgaged) return { state, error: "Unmortgage all properties in this group before building" };

  if (ownership.hasHotel) return { state, error: "Already has a hotel" };

  // Even building rule
  const groupProps = groupIndices.map((idx) => state.properties[idx]);
  const levelOf = (p: PropertyOwnership | undefined): number =>
    !p ? 0 : p.hasHotel ? 5 : p.houseCount;
  const minLevel = Math.min(...groupProps.map(levelOf));
  const thisLevel = levelOf(ownership);

  if (thisLevel > minLevel) {
    return { state, error: "Even building rule: build on other properties in this group first" };
  }

  const houseCost = HOUSE_PRICE[ownership.color];
  const player = state.players[socketId];

  if (ownership.houseCount < 4) {
    // Build a house
    if (state.housesRemaining <= 0) return { state, error: "No houses remaining in the bank" };
    if (player.cash < houseCost) return { state, error: `Need $${houseCost} to buy a house` };
    player.cash -= houseCost;
    state.housesRemaining -= 1;
    ownership.houseCount += 1;
    ownership.rent = getRent(spaceIndex, ownership.houseCount, false);
    state.log.push(
      `${player.name} built a house on ${ownership.name} (${ownership.houseCount}/4). Rent → $${ownership.rent}.`
    );
  } else {
    // Upgrade to hotel
    if (state.hotelsRemaining <= 0) return { state, error: "No hotels remaining in the bank" };
    if (player.cash < houseCost) return { state, error: `Need $${houseCost} to buy a hotel` };
    player.cash -= houseCost;
    state.hotelsRemaining -= 1;
    state.housesRemaining += HOTEL_RETURN_HOUSES; // houses returned to bank
    ownership.houseCount = 0;
    ownership.hasHotel = true;
    ownership.rent = getRent(spaceIndex, 0, true);
    state.log.push(
      `${player.name} built a hotel on ${ownership.name}! Rent → $${ownership.rent}.`
    );
  }

  return { state };
}

// ─── sellBuilding ────────────────────────────────────────────────────────────

function sellBuilding(
  roomCode: string,
  socketId: string,
  spaceIndex: number
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };

  const player = state.players[socketId];
  if (!player || player.bankrupt) return { state, error: "Player not found" };

  const ownership = state.properties[spaceIndex];
  if (!ownership) return { state, error: "Property not found" };
  if (ownership.ownerId !== socketId) return { state, error: "You don't own that property" };
  if (ownership.type !== "property" || !ownership.color) return { state, error: "Can only sell buildings on color properties" };
  if (!ownership.hasHotel && ownership.houseCount === 0) return { state, error: "No buildings to sell" };

  // Even selling rule: must sell from property with most buildings
  const groupIndices = COLOR_GROUPS[ownership.color] ?? [];
  const groupProps = groupIndices.map((idx) => state.properties[idx]);
  const levelOf = (p: PropertyOwnership | undefined): number =>
    !p ? 0 : p.hasHotel ? 5 : p.houseCount;
  const maxLevel = Math.max(...groupProps.map(levelOf));
  const thisLevel = levelOf(ownership);

  if (thisLevel < maxLevel) {
    return { state, error: "Even selling rule: sell from properties with more buildings first" };
  }

  const houseCost = HOUSE_PRICE[ownership.color];
  const sellPrice = Math.floor(houseCost / 2);

  if (ownership.hasHotel) {
    // Selling hotel — need 4 houses to replace it (or sell the hotel and leave 0)
    // Official rule: sell hotel, get back 4 houses if available, otherwise just sell
    const housesNeeded = HOTEL_RETURN_HOUSES;
    const housesBack = Math.min(housesNeeded, state.housesRemaining);
    state.hotelsRemaining += 1;
    state.housesRemaining -= housesBack;
    ownership.hasHotel = false;
    ownership.houseCount = housesBack;
    ownership.rent = getRent(spaceIndex, ownership.houseCount, false);
    player.cash += sellPrice;
    state.log.push(
      `${player.name} sold the hotel on ${ownership.name} for $${sellPrice} (${housesBack} house${housesBack !== 1 ? "s" : ""} returned).`
    );
  } else {
    state.housesRemaining += 1;
    ownership.houseCount -= 1;
    ownership.rent = getRent(spaceIndex, ownership.houseCount, false);
    player.cash += sellPrice;
    state.log.push(
      `${player.name} sold a house on ${ownership.name} for $${sellPrice} (${ownership.houseCount} remaining).`
    );
  }

  return { state };
}

// ─── payJailFine ─────────────────────────────────────────────────────────────

function payJailFine(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "rolling") return { state, error: "Can only pay jail fine at the start of your turn" };

  const player = state.players[socketId];
  if (!player.inJail) return { state, error: "You are not in jail" };
  if (player.cash < 50) return { state, error: "You cannot afford the $50 jail fine" };

  player.cash -= 50;
  player.inJail = false;
  player.jailTurns = 0;
  state.log.push(`${player.name} paid $50 to leave jail.`);
  return { state };
}

// ─── useGojf ─────────────────────────────────────────────────────────────────

function useGojf(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "rolling") return { state, error: "Can only use GOJF card at the start of your turn" };

  const player = state.players[socketId];
  if (!player.inJail) return { state, error: "You are not in jail" };
  if ((player.getOutOfJailFreeCards ?? 0) <= 0) return { state, error: "You have no Get Out of Jail Free cards" };

  player.getOutOfJailFreeCards -= 1;
  player.inJail = false;
  player.jailTurns = 0;
  state.log.push(`${player.name} used a Get Out of Jail Free card!`);
  return { state };
}

// ─── mortgage / unmortgage ───────────────────────────────────────────────────

function mortgageProperty(
  roomCode: string,
  socketId: string,
  spaceIndex: number
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };

  const player = state.players[socketId];
  if (!player || player.bankrupt) return { state, error: "Player not found" };

  const prop = state.properties[spaceIndex];
  if (!prop) return { state, error: "Property not found" };
  if (prop.ownerId !== socketId) return { state, error: "You don't own that property" };
  if (prop.mortgaged) return { state, error: "Property is already mortgaged" };
  if (prop.hasHotel || prop.houseCount > 0) {
    return { state, error: "Sell all buildings on this property before mortgaging" };
  }
  if (prop.type === "property" && prop.color) {
    const groupIndices = COLOR_GROUPS[prop.color] ?? [];
    const groupHasBuildings = groupIndices.some((idx) => {
      const p = state.properties[idx];
      return p && (p.hasHotel || p.houseCount > 0);
    });
    if (groupHasBuildings) {
      return { state, error: "Sell all buildings on this color group before mortgaging" };
    }
  }

  const mortgageValue = Math.floor(prop.price / 2);
  prop.mortgaged = true;
  player.cash += mortgageValue;
  state.log.push(`${player.name} mortgaged ${prop.name} for $${mortgageValue}.`);
  return { state };
}

function unmortgageProperty(
  roomCode: string,
  socketId: string,
  spaceIndex: number
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };

  const player = state.players[socketId];
  if (!player || player.bankrupt) return { state, error: "Player not found" };

  const prop = state.properties[spaceIndex];
  if (!prop) return { state, error: "Property not found" };
  if (prop.ownerId !== socketId) return { state, error: "You don't own that property" };
  if (!prop.mortgaged) return { state, error: "Property is not mortgaged" };

  const unmortgageCost = Math.ceil(prop.price / 2 * 1.1);
  if (player.cash < unmortgageCost) {
    return { state, error: `Need $${unmortgageCost} to unmortgage (mortgage value + 10% interest)` };
  }

  player.cash -= unmortgageCost;
  prop.mortgaged = false;
  state.log.push(`${player.name} unmortgaged ${prop.name} for $${unmortgageCost}.`);
  return { state };
}

// ─── handlePlayerDisconnect ───────────────────────────────────────────────────

function handlePlayerDisconnect(roomCode: string, socketId: string): GameState | null {
  const state = games[roomCode];
  if (!state) return null;

  const player = state.players[socketId];
  if (!player) return state;

  state.log.push(`${player.name} disconnected.`);

  for (const key of Object.keys(state.properties)) {
    const prop = state.properties[Number(key)];
    if (prop.ownerId !== socketId) continue;
    if (prop.hasHotel) {
      state.hotelsRemaining += 1;
      state.housesRemaining += HOTEL_RETURN_HOUSES;
    } else {
      state.housesRemaining += prop.houseCount;
    }
    delete state.properties[Number(key)];
  }

  delete state.players[socketId];
  state.turnOrder = state.turnOrder.filter((id) => id !== socketId);

  if (state.turnOrder.length === 0) {
    delete games[roomCode];
    return null;
  }

  if (state.currentTurnIndex >= state.turnOrder.length) {
    state.currentTurnIndex = 0;
  }

  // If auction was active, clean up passed list
  if (state.auctionState) {
    state.auctionState.passedPlayerIds = state.auctionState.passedPlayerIds.filter(
      (id) => id !== socketId
    );
    checkAuctionEnd(state);
  }

  if (!state.gameOver) checkVictory(state);
  if (!state.gameOver && state.phase !== "auction") state.phase = "rolling";
  return state;
}

// ─── persist ─────────────────────────────────────────────────────────────────

function persistGame(roomCode: string): void {
  const state = games[roomCode];
  if (!state) return;
  const save: MonopolySave = {
    ...state,
    savedAt: Date.now(),
    playerNames: Object.values(state.players).map((p) => p.name),
  };
  saveGame<MonopolySave>(roomCode, save);
}

// ─── loadSavedGame ────────────────────────────────────────────────────────────

function loadSavedGame(roomCode: string): GameState | null {
  const save = loadGame<MonopolySave>(roomCode);
  if (!save) return null;

  // Migrate older saves
  for (const player of Object.values(save.players)) {
    player.consecutiveDoubles ??= 0;
    player.getOutOfJailFreeCards ??= 0;
  }
  for (const prop of Object.values(save.properties)) {
    (prop as any).mortgaged ??= false;
  }
  save.auctionState ??= null;
  save.housesRemaining ??= MAX_HOUSES;
  save.hotelsRemaining ??= MAX_HOTELS;
  save.chanceDeck ??= shuffleDeck(CHANCE_CARDS);
  save.communityDeck ??= shuffleDeck(COMMUNITY_CHEST_CARDS);

  games[roomCode] = save;
  return save;
}

// ─── reassignPlayerId ─────────────────────────────────────────────────────────

function reassignPlayerId(roomCode: string, oldId: string, newId: string): GameState | null {
  const state = games[roomCode];
  if (!state) return null;

  const player = state.players[oldId];
  if (player) {
    player.id = newId;
    state.players[newId] = player;
    delete state.players[oldId];
  }

  state.turnOrder = state.turnOrder.map((id) => (id === oldId ? newId : id));

  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId === oldId) prop.ownerId = newId;
  }

  for (const trade of Object.values(state.trades)) {
    if (trade.fromId === oldId) trade.fromId = newId;
    if (trade.toId === oldId) trade.toId = newId;
  }

  if (state.auctionState) {
    if (state.auctionState.highestBidderId === oldId) {
      state.auctionState.highestBidderId = newId;
    }
    state.auctionState.passedPlayerIds = state.auctionState.passedPlayerIds.map(
      (id) => (id === oldId ? newId : id)
    );
  }

  return state;
}

function getGame(roomCode: string): GameState | null {
  return games[roomCode] ?? null;
}

export {
  createGame, processRoll, resolveCard, buyProperty, skipProperty,
  auctionBid, auctionPass, endTurn, buyBuilding, sellBuilding,
  payJailFine, useGojf, mortgageProperty, unmortgageProperty,
  handlePlayerDisconnect, reassignPlayerId, loadSavedGame, persistGame, getGame,
};
