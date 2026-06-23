import { GameState, GamePlayer, DiceRoll, PropertyOwnership, PlayerRanking } from "../../types/game";
import { BOARD, BOARD_SIZE, GO_SALARY, JAIL_POSITION, isPurchasable } from "./board";
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS, drawCard } from "./cards";
import { HOUSE_PRICE, getRent, ownsFullGroup } from "./buildings";
import { saveGame, loadGame } from "../../saveManager";

interface MonopolySave extends GameState {
  savedAt: number;
  playerNames: string[];
}

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];
const STARTING_CASH = 1500;

const games: Record<string, GameState> = {};

function rollDice(): DiceRoll {
  const die1 = Math.ceil(Math.random() * 6);
  const die2 = Math.ceil(Math.random() * 6);
  return { die1, die2, total: die1 + die2, isDoubles: die1 === die2 };
}

function countOwnedRailroads(state: GameState, ownerId: string): number {
  return Object.values(state.properties).filter((prop) => prop.ownerId === ownerId && prop.type === "railroad").length;
}


function countOwnedUtilities(state: GameState, ownerId: string): number {
  return Object.values(state.properties).filter((prop) => prop.ownerId === ownerId && prop.type === "utility").length;
}


function isUnimprovedMonopoly(color: string, playerId: string, spaceIndex: number, properties: Record<number, PropertyOwnership>): boolean {
  // Own full group
  if (!ownsFullGroup(color, playerId, properties)) return false;
  // Player has no houses/hotels anywhere in that group
  const groupIndices = Object.values(properties).filter((p) => p.color === color).map((p) => p.spaceIndex);
  // If we can't determine group indices (shouldn't happen), fallback to “not unimproved”.
  if (groupIndices.length === 0) return false;
  return groupIndices.every((idx) => {
    const prop = properties[idx];
    return prop && prop.houseCount === 0 && !prop.hasHotel;
  }) && properties[spaceIndex]?.houseCount === 0 && !properties[spaceIndex]?.hasHotel;
}


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
  };

  return games[roomCode];
}

function getCurrentPlayerId(state: GameState): string {
  return state.turnOrder[state.currentTurnIndex];
}

// ─── Bankruptcy & Victory ──────────────────────────────────────────────────

function buildRankings(state: GameState): PlayerRanking[] {
  const propertyCount = (id: string) =>
    Object.values(state.properties).filter((p) => p.ownerId === id).length;

  return Object.values(state.players)
    .sort((a, b) => {
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      return b.cash - a.cash;
    })
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cash: p.cash,
      propertyCount: propertyCount(p.id),
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
      prop.ownerId = creditorId;
      prop.houseCount = 0;
      prop.hasHotel = false;
      state.log.push(`  ${prop.name} transferred to ${state.players[creditorId].name}.`);
    } else {
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

// ─── processRoll ──────────────────────────────────────────────────────────

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
  const log: string[] = [];

  log.push(`${player.name} rolled ${roll.die1} + ${roll.die2} = ${roll.total}`);

  // Track consecutive doubles (3 doubles => jail, immediate turn end)
  if (roll.isDoubles) {
    player.consecutiveDoubles += 1;
    log.push(`${player.name} rolled doubles (${player.consecutiveDoubles}/3).`);
    if (player.consecutiveDoubles >= 3) {
      // Three consecutive doubles sends player directly to jail and ends the turn.
      player.position = JAIL_POSITION;
      player.inJail = true;
      player.jailTurns = 0;
      player.consecutiveDoubles = 0;
      log.push(`${player.name} rolled 3 consecutive doubles — sent to Jail!`);
      state.log.push(...log);
      state.phase = "ended";
      return { state };
    }
  } else {
    player.consecutiveDoubles = 0;
  }

  // Jail logic (use doubles / pay after 3 turns; GOJIF handled in resolveCard)
  if (player.inJail) {
    if (roll.isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      player.consecutiveDoubles = 0;
      log.push(`${player.name} rolled doubles and escaped jail!`);
      // In this ruleset, jail escape via doubles still grants another turn normally.
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        player.inJail = false;
        player.jailTurns = 0;
        player.cash -= 50;
        player.consecutiveDoubles = 0;
        log.push(`${player.name} paid $50 to get out of jail.`);
      } else {
        log.push(`${player.name} is still in jail (turn ${player.jailTurns}/3).`);
        state.log.push(...log);
        state.phase = "ended";
        return { state };
      }
    }
  }


  // Move
  const prevPosition = player.position;
  const newPosition = (prevPosition + roll.total) % BOARD_SIZE;
  player.position = newPosition;

  // Passing GO
  if (newPosition < prevPosition && !player.inJail) {
    player.cash += GO_SALARY;
    log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
  }

  // Landing exactly on GO also pays
  if (newPosition === 0 && !player.inJail) {
    player.cash += GO_SALARY;
    log.push(`${player.name} landed on GO and collected $${GO_SALARY}!`);
  }


  const space = BOARD[newPosition];
  log.push(`${player.name} landed on ${space.name}.`);

  // Go to Jail
  if (space.type === "go_to_jail") {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    log.push(`${player.name} is sent to Jail!`);
    state.log.push(...log);
    state.phase = "ended";
    return { state };
  }

  // Chance
  if (space.type === "chance") {
    const card = drawCard(CHANCE_CARDS);
    state.activeCard = { id: card.id, title: card.title, description: card.description, deck: "chance" };
    log.push(`${player.name} drew a Chance card: "${card.title}"`);
    state.log.push(...log);
    state.phase = "card";
    return { state };
  }

  // Community Chest
  if (space.type === "community") {
    const card = drawCard(COMMUNITY_CHEST_CARDS);
    state.activeCard = { id: card.id, title: card.title, description: card.description, deck: "community" };
    log.push(`${player.name} drew a Community Chest card: "${card.title}"`);
    state.log.push(...log);
    state.phase = "card";
    return { state };
  }

  // Tax
  if (space.type === "tax" && space.tax) {
    state.log.push(...log);
    player.cash -= space.tax;
    if (player.cash <= 0) {
      state.log.push(`${player.name} cannot pay $${space.tax} tax and is bankrupt!`);
      applyBankruptcy(state, socketId, null);
      if (!checkVictory(state)) state.phase = "ended";
    } else {
      state.log.push(`${player.name} paid $${space.tax} in tax.`);
      state.phase = "ended";
    }
    return { state };
  }

  // Property / Railroad / Utility
  if (isPurchasable(space.type) && space.price && space.rent !== undefined) {
    const existing = state.properties[newPosition];

    if (!existing) {
      if (player.cash >= space.price) {
        state.log.push(...log);
        state.phase = "buying";
        return { state };
      } else {
        log.push(`${player.name} cannot afford ${space.name} ($${space.price}).`);
        state.log.push(...log);
        state.phase = "ended";
        return { state };
      }
    }

    if (existing.ownerId !== socketId) {
      let rent = 0;
      const owner = state.players[existing.ownerId];

      if (space.type === "property") {
        rent = getRent(newPosition, existing.houseCount, existing.hasHotel);
        if (existing.color && isUnimprovedMonopoly(existing.color, existing.ownerId, newPosition, state.properties)) {
          rent *= 2;
          log.push(`Unimproved monopoly! Base rent doubled for ${space.name} (now $${rent}).`);
        }
      } else if (space.type === "railroad") {
        const rrCount = countOwnedRailroads(state, existing.ownerId);
        // 1=$25, 2=$50, 3=$100, 4=$200
        rent = rrCount === 1 ? 25 : rrCount === 2 ? 50 : rrCount === 3 ? 100 : rrCount >= 4 ? 200 : 0;
        log.push(`Railroad rent: ${rrCount} owned → $${rent} for ${space.name}.`);
      } else if (space.type === "utility") {
        const utilCount = countOwnedUtilities(state, existing.ownerId);
        const mult = utilCount === 1 ? 4 : utilCount >= 2 ? 10 : 0;
        rent = roll.total * mult;
        log.push(`Utility rent: ${utilCount} owned → dice(${roll.total})×${mult} = $${rent} for ${space.name}.`);
      } else {
        rent = existing.rent;
      }

      state.log.push(...log);
      log.length = 0;

      const buildingSuffix = existing.hasHotel
        ? " (hotel)"
        : existing.houseCount > 0

        ? ` (${existing.houseCount} house${existing.houseCount > 1 ? "s" : ""})`
        : "";

      state.log.push(...log);

      if (player.cash < rent) {
        const partial = player.cash;
        if (owner) owner.cash += partial;
        state.log.push(
          `${player.name} cannot pay $${rent} rent on ${space.name}${buildingSuffix} — only $${partial} paid.`
        );
        applyBankruptcy(state, socketId, existing.ownerId);
        if (!checkVictory(state)) state.phase = "ended";
        return { state };
      }

      player.cash -= rent;
      if (owner) owner.cash += rent;
      state.log.push(
        `${player.name} paid $${rent} rent to ${owner?.name ?? "unknown"} for ${space.name}${buildingSuffix}.`
      );
    }
    // Owned by self — nothing happens
  }

  state.log.push(...log);
  state.phase = "ended";
  return { state };
}

// ─── resolveCard ──────────────────────────────────────────────────────────

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

  } else if (effect.type === "pay_money") {
    player.cash -= effect.amount;
    if (player.cash <= 0) {
      state.log.push(`${player.name} cannot pay $${effect.amount} and is bankrupt!`);
      applyBankruptcy(state, socketId, null);
      if (!checkVictory(state)) state.phase = "ended";
      return { state };
    }
    state.log.push(`${player.name} paid $${effect.amount}.`);

  } else if (effect.type === "move_to") {
    const target = effect.position;
    if (target <= player.position) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
    }
    player.position = target;
    state.log.push(`${player.name} moved to ${BOARD[target].name}.`);

  } else if (effect.type === "move_forward") {
    const prev = player.position;
    player.position = (prev + effect.steps) % BOARD_SIZE;
    if (player.position < prev) {
      player.cash += GO_SALARY;
      state.log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
    }
    state.log.push(`${player.name} moved forward to ${BOARD[player.position].name}.`);

  } else if (effect.type === "move_backward") {
    player.position = (player.position - effect.steps + BOARD_SIZE) % BOARD_SIZE;
    state.log.push(`${player.name} moved back to ${BOARD[player.position].name}.`);

  } else if (effect.type === "go_to_jail") {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    state.log.push(`${player.name} was sent to Jail!`);
  } else if (effect.type === "gojf_keep") {
    player.getOutOfJailFreeCards = (player.getOutOfJailFreeCards ?? 0) + 1;
    state.log.push(`${player.name} received a Get Out of Jail Free card.`);
  }

  state.phase = "ended";
  return { state };
}

// ─── buyProperty / skipProperty ───────────────────────────────────────────

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
    state.log.push(`${player.name} does not have enough cash to buy ${space.name}.`);
    state.phase = "ended";
    return { state };
  }

  player.cash -= space.price;

  const ownership: PropertyOwnership = {
    spaceIndex: player.position,
    ownerId: socketId,
    price: space.price,
    rent: space.rent,
    name: space.name,
    color: space.color,
    type: space.type,
    houseCount: 0,
    hasHotel: false,
  };

  state.properties[player.position] = ownership;
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
  state.log.push(`${player.name} chose not to buy ${space.name}.`);
  state.phase = "ended";
  return { state };
}

// ─── endTurn ──────────────────────────────────────────────────────────────

function endTurn(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (state.phase === "gameover") return { state, error: "Game is over" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "ended") return { state, error: "Must resolve current action before ending turn" };

  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
  state.phase = "rolling";
  state.lastRoll = null;

  const nextPlayer = state.players[getCurrentPlayerId(state)];
  state.log.push(`It's now ${nextPlayer.name}'s turn.`);
  return { state };
}

// ─── buyBuilding ──────────────────────────────────────────────────────────

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
  if (!ownsFullGroup(ownership.color, socketId, state.properties)) {
    return { state, error: "You must own the full color group to build" };
  }
  if (ownership.hasHotel) return { state, error: "Already has a hotel" };

  const houseCost = HOUSE_PRICE[ownership.color];
  const player = state.players[socketId];

  if (ownership.houseCount < 4) {
    if (player.cash < houseCost) return { state, error: `Need $${houseCost} to buy a house` };
    player.cash -= houseCost;
    ownership.houseCount += 1;
    ownership.rent = getRent(spaceIndex, ownership.houseCount, false);
    state.log.push(`${player.name} built a house on ${ownership.name} (${ownership.houseCount}/4). Rent is now $${ownership.rent}.`);
  } else {
    if (player.cash < houseCost) return { state, error: `Need $${houseCost} to buy a hotel` };
    player.cash -= houseCost;
    ownership.houseCount = 0;
    ownership.hasHotel = true;
    ownership.rent = getRent(spaceIndex, 0, true);
    state.log.push(`${player.name} built a hotel on ${ownership.name}! Rent is now $${ownership.rent}.`);
  }

  return { state };
}

// ─── handlePlayerDisconnect ───────────────────────────────────────────────

function handlePlayerDisconnect(roomCode: string, socketId: string): GameState | null {
  const state = games[roomCode];
  if (!state) return null;

  const player = state.players[socketId];
  if (!player) return state;

  state.log.push(`${player.name} disconnected.`);

  for (const key of Object.keys(state.properties)) {
    if (state.properties[Number(key)].ownerId === socketId) {
      delete state.properties[Number(key)];
    }
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

  if (!state.gameOver) checkVictory(state);
  if (!state.gameOver) state.phase = "rolling";
  return state;
}

// ─── persist ──────────────────────────────────────────────────────────────

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

// ─── loadSavedGame ────────────────────────────────────────────────────────

function loadSavedGame(roomCode: string): GameState | null {
  const save = loadGame<MonopolySave>(roomCode);
  if (!save) return null;
  for (const player of Object.values(save.players)) {
    player.consecutiveDoubles ??= 0;
    player.getOutOfJailFreeCards ??= 0;
  }
  games[roomCode] = save;
  return save;
}

// ─── reassignPlayerId ─────────────────────────────────────────────────────
// Called after reconnect: remaps every reference to oldId → newId in game state

function reassignPlayerId(roomCode: string, oldId: string, newId: string): GameState | null {
  const state = games[roomCode];
  if (!state) return null;

  // Remap player record
  const player = state.players[oldId];
  if (player) {
    player.id = newId;
    state.players[newId] = player;
    delete state.players[oldId];
  }

  // Remap turnOrder
  state.turnOrder = state.turnOrder.map((id) => (id === oldId ? newId : id));

  // Remap property ownership
  for (const prop of Object.values(state.properties)) {
    if (prop.ownerId === oldId) prop.ownerId = newId;
  }

  // Remap trades
  for (const trade of Object.values(state.trades)) {
    if (trade.fromId === oldId) trade.fromId = newId;
    if (trade.toId   === oldId) trade.toId   = newId;
  }

  return state;
}

function getGame(roomCode: string): GameState | null {
  return games[roomCode] ?? null;
}

export {
  createGame, processRoll, resolveCard, buyProperty, skipProperty,
  endTurn, buyBuilding, handlePlayerDisconnect,
  reassignPlayerId, loadSavedGame, persistGame, getGame,
};
