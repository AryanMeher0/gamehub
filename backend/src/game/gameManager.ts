import { GameState, GamePlayer, DiceRoll } from "../types/game";
import { BOARD, BOARD_SIZE, GO_SALARY, JAIL_POSITION } from "./board";

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
      color: PLAYER_COLORS[i] ?? "#ffffff",
    };
  });

  games[roomCode] = {
    roomCode,
    players,
    turnOrder: [...playerIds],
    currentTurnIndex: 0,
    phase: "rolling",
    lastRoll: null,
    log: ["Game started! Player 1 goes first."],
  };

  return games[roomCode];
}

function getCurrentPlayerId(state: GameState): string {
  return state.turnOrder[state.currentTurnIndex];
}

function processRoll(roomCode: string, socketId: string): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };

  const currentId = getCurrentPlayerId(state);
  if (currentId !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "rolling") return { state, error: "Already rolled this turn" };

  const roll = rollDice();
  state.lastRoll = roll;
  const player = state.players[socketId];

  const logLines: string[] = [];
  logLines.push(`${player.name} rolled ${roll.die1} + ${roll.die2} = ${roll.total}`);

  if (player.inJail) {
    if (roll.isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      logLines.push(`${player.name} rolled doubles and escaped jail!`);
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        player.inJail = false;
        player.jailTurns = 0;
        player.cash -= 50;
        logLines.push(`${player.name} paid $50 to get out of jail.`);
      } else {
        logLines.push(`${player.name} is still in jail (turn ${player.jailTurns}/3).`);
        state.log.push(...logLines);
        state.phase = "ended";
        return { state };
      }
    }
  }

  const prevPosition = player.position;
  const newPosition = (prevPosition + roll.total) % BOARD_SIZE;
  player.position = newPosition;

  if (newPosition < prevPosition && !player.inJail) {
    player.cash += GO_SALARY;
    logLines.push(`${player.name} passed GO and collected $${GO_SALARY}!`);
  }

  const space = BOARD[newPosition];
  logLines.push(`${player.name} landed on ${space.name}.`);

  if (space.type === "go_to_jail") {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    logLines.push(`${player.name} is sent to Jail!`);
  }

  if (space.type === "tax" && space.tax) {
    player.cash -= space.tax;
    logLines.push(`${player.name} paid $${space.tax} in tax.`);
  }

  state.log.push(...logLines);
  state.phase = "ended";
  return { state };
}

function endTurn(roomCode: string, socketId: string): { state: GameState; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: null!, error: "Game not found" };
  if (getCurrentPlayerId(state) !== socketId) return { state, error: "Not your turn" };
  if (state.phase !== "ended") return { state, error: "Must roll before ending turn" };

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

export { createGame, processRoll, endTurn, handlePlayerDisconnect, getGame };
