import { GameState, GamePlayer, DiceRoll, PropertyOwnership } from "../types/game";
import { BOARD, BOARD_SIZE, GO_SALARY, JAIL_POSITION, isPurchasable } from "./board";

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];
const STARTING_CASH = 1500;

const games: Record<string, GameState> = {};

function rollDice(): DiceRoll {
  const die1 = Math.ceil(Math.random() * 6);
  const die2 = Math.ceil(Math.random() * 6);
  return { die1, die2, total: die1 + die2, isDoubles: die1 === die2 };
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

function processRoll(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };

  const currentId = getCurrentPlayerId(state);
  if (currentId !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "rolling") return { state, error: "Already rolled this turn" };

  const roll = rollDice();
  state.lastRoll = roll;
  const player = state.players[socketId];
  const log: string[] = [];

  log.push(`${player.name} rolled ${roll.die1} + ${roll.die2} = ${roll.total}`);

  // Jail logic
  if (player.inJail) {
    if (roll.isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      log.push(`${player.name} rolled doubles and escaped jail!`);
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        player.inJail = false;
        player.jailTurns = 0;
        player.cash -= 50;
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

  // Pass GO
  if (newPosition < prevPosition && !player.inJail) {
    player.cash += GO_SALARY;
    log.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
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

  // Tax
  if (space.type === "tax" && space.tax) {
    player.cash -= space.tax;
    log.push(`${player.name} paid $${space.tax} in tax.`);
    state.log.push(...log);
    state.phase = "ended";
    return { state };
  }

  // Property / Railroad / Utility
  if (isPurchasable(space.type) && space.price && space.rent !== undefined) {
    const existing = state.properties[newPosition];

    if (!existing) {
      // Unowned — offer purchase
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
      // Owned by another — pay rent
      const rent = existing.rent;
      const owner = state.players[existing.ownerId];
      const actualRent = Math.min(rent, player.cash);

      player.cash -= actualRent;
      if (owner) owner.cash += actualRent;

      if (actualRent < rent) {
        log.push(
          `${player.name} could only pay $${actualRent} rent on ${space.name} (owned by ${owner?.name ?? "unknown"}).`
        );
      } else {
        log.push(
          `${player.name} paid $${rent} rent to ${owner?.name ?? "unknown"} for ${space.name}.`
        );
      }
    }
    // Owned by self — nothing happens
  }

  state.log.push(...log);
  state.phase = "ended";
  return { state };
}

function buyProperty(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
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
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "buying") return { state, error: "Nothing to skip" };

  const player = state.players[socketId];
  const space = BOARD[player.position];
  state.log.push(`${player.name} chose not to buy ${space.name}.`);
  state.phase = "ended";
  return { state };
}

function endTurn(
  roomCode: string,
  socketId: string
): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "ended") return { state, error: "Must resolve current action before ending turn" };

  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
  state.phase = "rolling";
  state.lastRoll = null;

  const nextPlayer = state.players[getCurrentPlayerId(state)];
  state.log.push(`It's now ${nextPlayer.name}'s turn.`);
  return { state };
}

function handlePlayerDisconnect(roomCode: string, socketId: string): GameState | null {
  const state = games[roomCode];
  if (!state) return null;

  const player = state.players[socketId];
  if (!player) return state;

  state.log.push(`${player.name} disconnected.`);

  // Release owned properties
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

  state.phase = "rolling";
  return state;
}

function getGame(roomCode: string): GameState | null {
  return games[roomCode] ?? null;
}

export { createGame, processRoll, buyProperty, skipProperty, endTurn, handlePlayerDisconnect, getGame };
