import { DiceRoll, GameState, PropertyOwnership } from "../../types/game";
import { BOARD, BOARD_SIZE, JAIL_POSITION, isPurchasable } from "./board";
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from "./cards";
import { getRent } from "./buildings";
import { processRoll } from "./gameManager";

export type OperatorAction =
  | { type: "addCash"; playerId: string; amount: number }
  | { type: "removeCash"; playerId: string; amount: number }
  | { type: "setCash"; playerId: string; amount: number }
  | { type: "movePlayer"; playerId: string; position: number }
  | { type: "sendToJail"; playerId: string }
  | { type: "releaseFromJail"; playerId: string }
  | { type: "giveProperty"; playerId: string; spaceIndex: number }
  | { type: "removeProperty"; spaceIndex: number }
  | { type: "changePropertyOwner"; playerId: string; spaceIndex: number }
  | { type: "addHouse"; spaceIndex: number }
  | { type: "removeHouse"; spaceIndex: number }
  | { type: "addHotel"; spaceIndex: number }
  | { type: "removeHotel"; spaceIndex: number }
  | { type: "forceCard"; playerId: string; deck: "chance" | "community"; cardId: string }
  | { type: "giveGojf"; playerId: string }
  | { type: "forceDiceRoll"; die1: number; die2: number }
  | { type: "endTurn" }
  | { type: "changeCurrentTurn"; playerId: string }
  | { type: "setMortgaged"; spaceIndex: number; mortgaged: boolean }
  // New actions
  | { type: "renamePlayer"; playerId: string; name: string }
  | { type: "removeGojf"; playerId: string }
  | { type: "globalCash"; amount: number }
  | { type: "globalTax"; amount: number }
  | { type: "changeBotDifficulty"; playerId: string; difficulty: "easy" | "medium" | "hard" }
  | { type: "forceBotTurn" }
  | { type: "event"; name: "marketCrash" | "taxHoliday" | "buildingBoom" | "randomWindfall" | "propertyGiveaway" };

export interface OperatorResult {
  state: GameState;
  message?: string;
  error?: string;
  triggerBotScheduler?: boolean;
}

function fail(state: GameState, error: string): OperatorResult {
  return { state, error };
}

function playerFor(state: GameState, playerId: string) {
  const player = state.players[playerId];
  return player && !player.bankrupt ? player : null;
}

function ownedProperty(state: GameState, spaceIndex: number) {
  return state.properties[spaceIndex] ?? null;
}

function propertyFromBoard(spaceIndex: number, ownerId: string): PropertyOwnership | null {
  const space = BOARD[spaceIndex];
  if (!space || !isPurchasable(space.type) || space.price === undefined || space.rent === undefined) {
    return null;
  }
  return {
    spaceIndex,
    ownerId,
    price: space.price,
    rent: space.rent,
    name: space.name,
    color: space.color,
    type: space.type,
    houseCount: 0,
    hasHotel: false,
    mortgaged: false,
  };
}

function refreshRent(property: PropertyOwnership): void {
  if (property.type === "property") {
    property.rent = getRent(property.spaceIndex, property.houseCount, property.hasHotel);
  }
}

function finish(state: GameState, message: string, triggerBotScheduler = false): OperatorResult {
  state.log.push(`[OPERATOR] ${message}`);
  return { state, message, triggerBotScheduler };
}

function activePlayers(state: GameState) {
  return Object.values(state.players).filter((p) => !p.bankrupt);
}

export function applyOperatorAction(
  roomCode: string,
  state: GameState,
  action: OperatorAction
): OperatorResult {
  switch (action.type) {
    case "addCash": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      if (!Number.isFinite(action.amount) || action.amount < 0) return fail(state, "Amount must be non-negative");
      player.cash += Math.floor(action.amount);
      return finish(state, `Added $${Math.floor(action.amount)} to ${player.name}.`);
    }
    case "removeCash": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      if (!Number.isFinite(action.amount) || action.amount < 0) return fail(state, "Amount must be non-negative");
      const removed = Math.min(player.cash, Math.floor(action.amount));
      player.cash -= removed;
      return finish(state, `Removed $${removed} from ${player.name}.`);
    }
    case "setCash": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      if (!Number.isFinite(action.amount) || action.amount < 0) return fail(state, "Cash must be non-negative");
      player.cash = Math.floor(action.amount);
      return finish(state, `Set ${player.name}'s cash to $${player.cash}.`);
    }
    case "movePlayer": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      if (!Number.isInteger(action.position) || action.position < 0 || action.position >= BOARD_SIZE) {
        return fail(state, "Position must be a board index from 0 to 39");
      }
      player.position = action.position;
      return finish(state, `Moved ${player.name} to ${BOARD[action.position].name}.`);
    }
    case "sendToJail": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      player.position = JAIL_POSITION;
      player.inJail = true;
      player.jailTurns = 0;
      player.consecutiveDoubles = 0;
      return finish(state, `Sent ${player.name} to Jail.`);
    }
    case "releaseFromJail": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      player.inJail = false;
      player.jailTurns = 0;
      player.consecutiveDoubles = 0;
      return finish(state, `Released ${player.name} from Jail.`);
    }
    case "giveProperty": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      if (ownedProperty(state, action.spaceIndex)) return fail(state, "Property already has an owner");
      const property = propertyFromBoard(action.spaceIndex, action.playerId);
      if (!property) return fail(state, "Space is not a purchasable property");
      state.properties[action.spaceIndex] = property;
      return finish(state, `Gave ${property.name} to ${player.name}.`);
    }
    case "removeProperty": {
      const property = ownedProperty(state, action.spaceIndex);
      if (!property) return fail(state, "Property is not owned");
      delete state.properties[action.spaceIndex];
      return finish(state, `Removed ${property.name} from its owner and returned it to the bank.`);
    }
    case "changePropertyOwner": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      const property = ownedProperty(state, action.spaceIndex);
      if (!property) return fail(state, "Property is not owned");
      property.ownerId = action.playerId;
      return finish(state, `Changed ${property.name}'s owner to ${player.name}.`);
    }
    case "addHouse": {
      const property = ownedProperty(state, action.spaceIndex);
      if (!property || property.type !== "property") return fail(state, "Owned street property not found");
      if (property.hasHotel) return fail(state, "Remove the hotel before adding houses");
      if (property.houseCount >= 4) return fail(state, "Property already has four houses");
      property.houseCount += 1;
      refreshRent(property);
      return finish(state, `Added a house to ${property.name} (${property.houseCount}/4).`);
    }
    case "removeHouse": {
      const property = ownedProperty(state, action.spaceIndex);
      if (!property || property.type !== "property") return fail(state, "Owned street property not found");
      if (property.hasHotel) return fail(state, "Remove the hotel before removing houses");
      if (property.houseCount <= 0) return fail(state, "Property has no houses");
      property.houseCount -= 1;
      refreshRent(property);
      return finish(state, `Removed a house from ${property.name} (${property.houseCount}/4 remain).`);
    }
    case "addHotel": {
      const property = ownedProperty(state, action.spaceIndex);
      if (!property || property.type !== "property") return fail(state, "Owned street property not found");
      if (property.hasHotel) return fail(state, "Property already has a hotel");
      property.houseCount = 0;
      property.hasHotel = true;
      refreshRent(property);
      return finish(state, `Added a hotel to ${property.name}.`);
    }
    case "removeHotel": {
      const property = ownedProperty(state, action.spaceIndex);
      if (!property || property.type !== "property") return fail(state, "Owned street property not found");
      if (!property.hasHotel) return fail(state, "Property has no hotel");
      property.hasHotel = false;
      property.houseCount = 4;
      refreshRent(property);
      return finish(state, `Removed the hotel from ${property.name} and restored four houses.`);
    }
    case "forceCard": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      const deck = action.deck === "chance" ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
      const card = deck.find((candidate) => candidate.id === action.cardId);
      if (!card) return fail(state, "Card not found");
      const turnIndex = state.turnOrder.indexOf(action.playerId);
      if (turnIndex < 0) return fail(state, "Player is not in the turn order");
      state.currentTurnIndex = turnIndex;
      state.activeCard = {
        id: card.id,
        title: card.title,
        description: card.description,
        deck: action.deck,
      };
      state.phase = "card";
      state.lastRoll = null;
      return finish(state, `Forced ${card.title} (${action.deck}) for ${player.name}.`, true);
    }
    case "giveGojf": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      player.getOutOfJailFreeCards = (player.getOutOfJailFreeCards ?? 0) + 1;
      return finish(state, `Gave ${player.name} a Get Out of Jail Free card.`);
    }
    case "forceDiceRoll": {
      if (![action.die1, action.die2].every((die) => Number.isInteger(die) && die >= 1 && die <= 6)) {
        return fail(state, "Each die must be an integer from 1 to 6");
      }
      const currentPlayerId = state.turnOrder[state.currentTurnIndex];
      const currentPlayer = playerFor(state, currentPlayerId);
      if (!currentPlayer) return fail(state, "Current player not found");
      state.phase = "rolling";
      state.activeCard = null;
      const roll: DiceRoll = {
        die1: action.die1,
        die2: action.die2,
        total: action.die1 + action.die2,
        isDoubles: action.die1 === action.die2,
      };
      const result = processRoll(roomCode, currentPlayerId, roll);
      if (result.error) return fail(state, result.error);
      return finish(state, `Forced ${currentPlayer.name} to roll ${action.die1} + ${action.die2}.`, true);
    }
    case "endTurn": {
      if (state.turnOrder.length === 0) return fail(state, "No players remain in the turn order");
      state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
      state.phase = "rolling";
      state.lastRoll = null;
      state.activeCard = null;
      const next = state.players[state.turnOrder[state.currentTurnIndex]];
      return finish(state, `Ended the turn. It is now ${next?.name ?? "the next player"}'s turn.`, true);
    }
    case "changeCurrentTurn": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      const turnIndex = state.turnOrder.indexOf(action.playerId);
      if (turnIndex < 0) return fail(state, "Player is not in the turn order");
      state.currentTurnIndex = turnIndex;
      state.phase = "rolling";
      state.lastRoll = null;
      state.activeCard = null;
      return finish(state, `Changed the current turn to ${player.name}.`, true);
    }
    case "setMortgaged": {
      const property = ownedProperty(state, action.spaceIndex);
      if (!property) return fail(state, "Property is not owned");
      property.mortgaged = action.mortgaged;
      return finish(state, `Set ${property.name} mortgage status to ${action.mortgaged}.`);
    }

    // ── New actions ──────────────────────────────────────────────────────────

    case "renamePlayer": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      const newName = action.name.trim().slice(0, 20);
      if (!newName) return fail(state, "Name cannot be empty");
      const oldName = player.name;
      player.name = newName;
      return finish(state, `Renamed ${oldName} to ${newName}.`);
    }

    case "removeGojf": {
      const player = playerFor(state, action.playerId);
      if (!player) return fail(state, "Active player not found");
      if ((player.getOutOfJailFreeCards ?? 0) <= 0) return fail(state, "Player has no Get Out of Jail Free cards");
      player.getOutOfJailFreeCards -= 1;
      return finish(state, `Removed a Get Out of Jail Free card from ${player.name}.`);
    }

    case "globalCash": {
      if (!Number.isFinite(action.amount) || action.amount <= 0) return fail(state, "Amount must be positive");
      const amt = Math.floor(action.amount);
      const active = activePlayers(state);
      active.forEach((p) => { p.cash += amt; });
      return finish(state, `Gave $${amt} to all ${active.length} active players.`);
    }

    case "globalTax": {
      if (!Number.isFinite(action.amount) || action.amount <= 0) return fail(state, "Amount must be positive");
      const amt = Math.floor(action.amount);
      const active = activePlayers(state);
      active.forEach((p) => { p.cash = Math.max(0, p.cash - amt); });
      return finish(state, `Taxed all ${active.length} active players $${amt} each.`);
    }

    case "changeBotDifficulty": {
      const player = state.players[action.playerId];
      if (!player) return fail(state, "Player not found");
      if (!player.isBot) return fail(state, "Player is not a bot");
      player.botType = action.difficulty;
      return finish(state, `Changed ${player.name}'s difficulty to ${action.difficulty}.`);
    }

    case "forceBotTurn": {
      return finish(state, "Bot turn forced.", true);
    }

    case "event": {
      switch (action.name) {
        case "marketCrash": {
          const active = activePlayers(state);
          active.forEach((p) => { p.cash = Math.floor(p.cash * 0.75); });
          return finish(state, `Market Crash! All players lost 25% of their cash.`);
        }
        case "taxHoliday": {
          const active = activePlayers(state);
          active.forEach((p) => { p.cash += 200; });
          return finish(state, `Tax Holiday! All players received $200.`);
        }
        case "buildingBoom": {
          const active = activePlayers(state);
          let recipients = 0;
          active.forEach((p) => {
            const hasMonopoly = Object.values(state.properties).some(
              (prop) => prop.ownerId === p.id && prop.type === "property"
            );
            if (hasMonopoly) { p.cash += 400; recipients++; }
          });
          return finish(state, `Building Boom! ${recipients} player(s) with properties each received $400.`);
        }
        case "randomWindfall": {
          const active = activePlayers(state);
          if (active.length === 0) return fail(state, "No active players");
          const winner = active[Math.floor(Math.random() * active.length)];
          winner.cash += 500;
          return finish(state, `Random Windfall! ${winner.name} received $500.`);
        }
        case "propertyGiveaway": {
          const unowned = BOARD.filter(
            (sp) => isPurchasable(sp.type) && !state.properties[sp.index]
          );
          if (unowned.length === 0) return fail(state, "No unowned properties to give away");
          const active = activePlayers(state);
          if (active.length === 0) return fail(state, "No active players");
          const space = unowned[Math.floor(Math.random() * unowned.length)];
          const player = active[Math.floor(Math.random() * active.length)];
          const property = propertyFromBoard(space.index, player.id);
          if (!property) return fail(state, "Failed to create property");
          state.properties[space.index] = property;
          return finish(state, `Property Giveaway! ${space.name} awarded to ${player.name}.`);
        }
      }
      break;
    }
  }
  return fail(state, "Unknown operator action");
}

export const OPERATOR_CARDS = {
  chance: CHANCE_CARDS.map(({ id, title, description }) => ({ id, title, description })),
  community: COMMUNITY_CHEST_CARDS.map(({ id, title, description }) => ({ id, title, description })),
};
