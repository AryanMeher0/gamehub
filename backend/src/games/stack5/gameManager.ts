import { Stack5State, Stack5Player, Stack5Stack, Stack5Card, CardColor, CardShape } from "./types";
import { buildDeck, reshuffleDiscard, shuffle } from "./cards";

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#f97316"];
const STARTING_HAND = 5;

const games: Record<string, Stack5State> = {};
const gameHistories: Record<string, Stack5State[]> = {};
const MAX_HISTORY = 20;

function saveHistory(roomCode: string): void {
  const state = games[roomCode];
  if (!state) return;
  const history = gameHistories[roomCode] ?? [];
  history.push(JSON.parse(JSON.stringify(state)) as Stack5State);
  if (history.length > MAX_HISTORY) history.shift();
  gameHistories[roomCode] = history;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyStacks(): Stack5Stack[] {
  return [0, 1, 2, 3].map((i) => ({
    slotIndex: i,
    cards: [],
    matchType: null,
    matchValue: null,
    completed: false,
  }));
}

function getCurrentPlayer(state: Stack5State): Stack5Player | null {
  return state.players[state.turnOrder[state.currentTurnIndex]] ?? null;
}

function effectiveColor(card: Stack5Card): CardColor | null {
  if (card.type === "standard") return card.color;
  if (card.type === "wild") return card.assignedColor ?? null;
  return null;
}

function effectiveShape(card: Stack5Card): CardShape | null {
  if (card.type === "standard") return card.shape;
  if (card.type === "wild") return card.assignedShape ?? null;
  return null;
}

function firstValuedCard(stack: Stack5Stack): Stack5Card | null {
  return (
    stack.cards.find((c) => effectiveColor(c) !== null || effectiveShape(c) !== null) ?? null
  );
}

function isValidPlay(
  stack: Stack5Stack,
  card: Stack5Card,
  chosenColor?: CardColor | null,
  chosenShape?: CardShape | null
): boolean {
  if (stack.cards.length === 0) return true;
  if (stack.completed) return false;
  if (card.type !== "standard" && card.type !== "wild") return false;

  if (card.type === "wild") {
    if (stack.matchType === "color") return chosenColor === stack.matchValue;
    if (stack.matchType === "shape") return chosenShape === stack.matchValue;
    return true;
  }

  // Standard card
  if (stack.matchType === "color") return card.color === stack.matchValue;
  if (stack.matchType === "shape") return card.shape === stack.matchValue;

  // matchType = null: must match the first valued card's color or shape
  const ref = firstValuedCard(stack);
  if (!ref) return true;
  return (
    (effectiveColor(ref) !== null && card.color === effectiveColor(ref)) ||
    (effectiveShape(ref) !== null && card.shape === effectiveShape(ref))
  );
}

function updateMatchType(stack: Stack5Stack): void {
  if (stack.matchType !== null) return;
  const valued = stack.cards.filter((c) => effectiveColor(c) !== null || effectiveShape(c) !== null);
  if (valued.length < 2) return;
  const fc = effectiveColor(valued[0]);
  const fs = effectiveShape(valued[0]);
  for (let i = 1; i < valued.length; i++) {
    const c = effectiveColor(valued[i]);
    const s = effectiveShape(valued[i]);
    const matchesColor = fc !== null && c === fc;
    const matchesShape = fs !== null && s === fs;
    // Only lock when one dimension matches but not the other.
    // If both match (same color AND shape), stay ambiguous — the player
    // can still steer this stack toward either color or shape.
    if (matchesColor && !matchesShape) { stack.matchType = "color"; stack.matchValue = fc; return; }
    if (matchesShape && !matchesColor) { stack.matchType = "shape"; stack.matchValue = fs; return; }
  }
}

function drawCards(state: Stack5State, count: number): Stack5Card[] {
  const drawn: Stack5Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.drawDeck.length === 0) {
      if (state.discardPile.length === 0) break;
      const { deck, discard } = reshuffleDiscard(state.drawDeck, state.discardPile);
      state.drawDeck = deck;
      state.discardPile = discard;
      state.log.push("♻️ Deck reshuffled from discard pile.");
    }
    const card = state.drawDeck.pop()!;
    drawn.push(card);
  }
  return drawn;
}

function advanceTurn(state: Stack5State): void {
  const N = state.turnOrder.length;
  let next = ((state.currentTurnIndex + state.direction) % N + N) % N;

  const nextPlayer = state.players[state.turnOrder[next]];
  if (nextPlayer?.skippedNextTurn) {
    state.log.push(`⏭️ ${nextPlayer.name}'s turn was skipped!`);
    nextPlayer.skippedNextTurn = false;
    next = ((next + state.direction) % N + N) % N;
  }

  state.currentTurnIndex = next;
  state.actionsRemaining = 2;
  state.turnStartedAt = Date.now();

  const cp = state.players[state.turnOrder[state.currentTurnIndex]];
  if (cp) state.log.push(`${cp.name}'s turn.`);
}

function spendAction(state: Stack5State): void {
  state.actionsRemaining -= 1;
  if (state.actionsRemaining <= 0) advanceTurn(state);
}

function checkWin(state: Stack5State, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || player.points < state.targetScore) return false;
  state.gameOver = true;
  state.phase = "gameover";
  state.winnerId = player.id;
  state.winnerName = player.name;
  state.log.push(`🏆 ${player.name} wins with ${player.points} point(s)!`);
  return true;
}

// ─── createGame ───────────────────────────────────────────────────────────────

function createGame(
  roomCode: string,
  roomPlayers: Record<string, { isBot?: boolean; botType?: string; displayName?: string }>,
  targetScore: number,
  startingMasterCards: number,
  turnTimerSeconds = 0,
  hostId = "",
  numDecks = 1
): Stack5State {
  const playerIds = Object.keys(roomPlayers);
  let deckCards = buildDeck(0);
  for (let d = 1; d < numDecks; d++) deckCards = [...deckCards, ...buildDeck(d)];
  if (numDecks > 1) deckCards = shuffle(deckCards);
  const deck = deckCards;
  const players: Record<string, Stack5Player> = {};

  playerIds.forEach((id, i) => {
    const rp = roomPlayers[id];
    players[id] = {
      id,
      name: rp.displayName ?? `Player ${i + 1}`,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      hand: deck.splice(0, STARTING_HAND),
      stacks: emptyStacks(),
      points: 0,
      masterCards: startingMasterCards,
      skippedNextTurn: false,
      isBot: rp.isBot,
      botType: rp.botType,
    };
  });

  const turnOrder = [...playerIds].sort(() => Math.random() - 0.5);

  const state: Stack5State = {
    roomCode,
    phase: "playing",
    players,
    turnOrder,
    currentTurnIndex: 0,
    direction: 1,
    actionsRemaining: 2,
    drawDeck: deck,
    discardPile: [],
    targetScore,
    turnTimerSeconds,
    turnStartedAt: Date.now(),
    gameOver: false,
    winnerId: null,
    winnerName: null,
    log: [
      `Game started! First to ${targetScore} point(s) wins.`,
      `${players[turnOrder[0]]?.name}'s turn.`,
    ],
    hostId,
  };

  games[roomCode] = state;
  return state;
}

// ─── drawCard ─────────────────────────────────────────────────────────────────

function drawCard(roomCode: string, playerId: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };

  const cp = getCurrentPlayer(state);
  if (!cp || cp.id !== playerId) return { state, error: "Not your turn" };
  if (state.actionsRemaining <= 0) return { state, error: "No actions remaining" };

  const [card] = drawCards(state, 1);
  if (!card) return { state, error: "No cards left in deck or discard" };

  cp.hand.push(card);
  state.log.push(`${cp.name} drew a card. (${state.drawDeck.length} left)`);
  spendAction(state);
  return { state };
}

// ─── playCard ─────────────────────────────────────────────────────────────────

export interface PlayCardInput {
  cardId: string;
  slotIndex?: number;
  chosenColor?: CardColor;
  chosenShape?: CardShape;
  targetPlayerId?: string;
}

function playCard(roomCode: string, playerId: string, input: PlayCardInput): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };

  const cp = getCurrentPlayer(state);
  if (!cp || cp.id !== playerId) return { state, error: "Not your turn" };
  if (state.actionsRemaining <= 0) return { state, error: "No actions remaining" };

  const cardIdx = cp.hand.findIndex((c) => c.id === input.cardId);
  if (cardIdx === -1) return { state, error: "Card not in hand" };
  const card = cp.hand[cardIdx];

  // ── Skip ──
  if (card.type === "skip") {
    const target = input.targetPlayerId ? state.players[input.targetPlayerId] : null;
    if (!target || target.id === playerId) return { state, error: "Choose a different player to skip" };
    target.skippedNextTurn = true;
    cp.hand.splice(cardIdx, 1);
    state.discardPile.push(card);
    state.log.push(`${cp.name} played Skip — ${target.name}'s next turn is skipped!`);
    spendAction(state);
    return { state };
  }

  // ── Reverse ──
  if (card.type === "reverse") {
    cp.hand.splice(cardIdx, 1);
    state.discardPile.push(card);
    if (state.turnOrder.length === 2) {
      const otherId = state.turnOrder.find((id) => id !== playerId)!;
      state.players[otherId].skippedNextTurn = true;
      state.log.push(`${cp.name} played Reverse — ${state.players[otherId].name}'s turn is skipped!`);
    } else {
      state.direction = (state.direction * -1) as 1 | -1;
      state.log.push(`${cp.name} played Reverse — turn order reversed!`);
    }
    spendAction(state);
    return { state };
  }

  // ── Reset Hand ──
  if (card.type === "reset_hand") {
    const target = input.targetPlayerId ? state.players[input.targetPlayerId] : null;
    if (!target || target.id === playerId) return { state, error: "Choose a different player to reset" };
    const n = target.hand.length;
    state.discardPile.push(...target.hand);
    target.hand = [];
    cp.hand.splice(cardIdx, 1);
    state.discardPile.push(card);
    state.log.push(`${cp.name} played Reset Hand — ${target.name} discarded ${n} card(s)!`);
    spendAction(state);
    return { state };
  }

  // ── Standard / Wild → play to stack ──
  if (input.slotIndex === undefined || input.slotIndex < 0 || input.slotIndex > 3) {
    return { state, error: "Specify a valid slot (0–3)" };
  }

  const stack = cp.stacks[input.slotIndex];
  if (!stack) return { state, error: "Invalid slot" };

  if (!isValidPlay(stack, card, input.chosenColor, input.chosenShape)) {
    return { state, error: "Card doesn't match this stack's pattern" };
  }

  cp.hand.splice(cardIdx, 1);

  if (card.type === "wild") {
    card.assignedColor = input.chosenColor ?? null;
    card.assignedShape = input.chosenShape ?? null;
  }

  stack.cards.push(card);
  updateMatchType(stack);

  if (stack.cards.length >= 5) {
    stack.completed = true;
    state.log.push(`⭐ ${cp.name} completed slot ${input.slotIndex + 1}! READY TO SECURE.`);
  } else {
    const label =
      card.type === "wild"
        ? `Wild (${input.chosenColor ?? "?"} ${input.chosenShape ?? "?"})`
        : `${card.color} ${card.shape}`;
    state.log.push(`${cp.name} played ${label} → slot ${input.slotIndex + 1}.`);
  }

  spendAction(state);
  return { state };
}

// ─── tradeForMaster ───────────────────────────────────────────────────────────

function tradeForMaster(
  roomCode: string,
  playerId: string,
  cardIds: string[]
): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };

  const cp = getCurrentPlayer(state);
  if (!cp || cp.id !== playerId) return { state, error: "Not your turn" };
  if (state.actionsRemaining <= 0) return { state, error: "No actions remaining" };
  if (cardIds.length !== 4) return { state, error: "Select exactly 4 cards" };

  const handCopy = [...cp.hand];
  const cards: Stack5Card[] = [];
  for (const id of cardIds) {
    const idx = handCopy.findIndex((c) => c.id === id);
    if (idx === -1) return { state, error: "Card not in hand" };
    const card = handCopy.splice(idx, 1)[0];
    if (card.type !== "standard") return { state, error: "Only standard cards can be traded" };
    cards.push(card);
  }

  const colors = new Set(cards.map((c) => c.color));
  const shapes = new Set(cards.map((c) => c.shape));
  if (colors.size !== 4 && shapes.size !== 4) {
    return { state, error: "Cards must have 4 unique colors or 4 unique shapes" };
  }

  cp.hand = handCopy;
  state.discardPile.push(...cards);
  cp.masterCards += 1;

  const tradeType = colors.size === 4 ? "4 unique colors" : "4 unique shapes";
  state.log.push(`${cp.name} traded cards (${tradeType}) for a Master Card! (${cp.masterCards} MC total)`);
  spendAction(state);
  return { state };
}

// ─── secure ───────────────────────────────────────────────────────────────────

function secure(
  roomCode: string,
  playerId: string,
  slotIndex: number
): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };

  const cp = getCurrentPlayer(state);
  if (!cp || cp.id !== playerId) return { state, error: "Not your turn" };
  if (state.actionsRemaining <= 0) return { state, error: "No actions remaining" };
  if (cp.masterCards <= 0) return { state, error: "No Master Cards" };

  const stack = cp.stacks[slotIndex];
  if (!stack || !stack.completed) return { state, error: "Stack is not complete" };

  cp.masterCards -= 1;
  cp.points += 1;
  state.discardPile.push(...stack.cards);
  cp.stacks[slotIndex] = { slotIndex, cards: [], matchType: null, matchValue: null, completed: false };

  state.log.push(`🏅 ${cp.name} secured slot ${slotIndex + 1}! ${cp.points}/${state.targetScore} points.`);

  if (checkWin(state, playerId)) return { state };

  spendAction(state);
  return { state };
}

// ─── steal ────────────────────────────────────────────────────────────────────

function steal(
  roomCode: string,
  playerId: string,
  targetPlayerId: string,
  targetSlotIndex: number
): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };

  const cp = getCurrentPlayer(state);
  if (!cp || cp.id !== playerId) return { state, error: "Not your turn" };
  if (state.actionsRemaining <= 0) return { state, error: "No actions remaining" };
  if (cp.masterCards <= 0) return { state, error: "No Master Cards" };
  if (targetPlayerId === playerId) return { state, error: "Cannot steal from yourself" };

  const target = state.players[targetPlayerId];
  if (!target) return { state, error: "Target not found" };

  const stack = target.stacks[targetSlotIndex];
  if (!stack || stack.cards.length === 0) return { state, error: "No stack to steal there" };

  const stolen = [...stack.cards];
  const desc = stack.matchType ? `${stack.matchType} stack (${stack.matchValue})` : "stack";

  cp.masterCards -= 1;
  cp.hand.push(...stolen);
  target.stacks[targetSlotIndex] = {
    slotIndex: targetSlotIndex,
    cards: [],
    matchType: null,
    matchValue: null,
    completed: false,
  };

  state.log.push(
    `🗡️ ${cp.name} stole ${target.name}'s ${desc} (${stolen.length} card(s))!`
  );

  spendAction(state);
  return { state };
}

// ─── endTurn ──────────────────────────────────────────────────────────────────

function endTurn(roomCode: string, playerId: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };

  const cp = getCurrentPlayer(state);
  if (!cp || cp.id !== playerId) return { state, error: "Not your turn" };

  state.log.push(`${cp.name} ended their turn early.`);
  advanceTurn(state);
  return { state };
}

// ─── forceAdvanceTurn (for timer expiry) ──────────────────────────────────────

function forceAdvanceTurn(roomCode: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  if (state.gameOver) return { state, error: "Game is over" };
  const cp = getCurrentPlayer(state);
  state.log.push(`⏰ ${cp?.name ?? "Player"}'s turn timed out!`);
  advanceTurn(state);
  return { state };
}

// ─── reassignPlayerId ─────────────────────────────────────────────────────────

function reassignPlayerId(roomCode: string, oldId: string, newId: string): Stack5State | null {
  const state = games[roomCode];
  if (!state) return null;
  const player = state.players[oldId];
  if (!player) return null;
  delete state.players[oldId];
  player.id = newId;
  state.players[newId] = player;
  state.turnOrder = state.turnOrder.map((id) => (id === oldId ? newId : id));
  state.log.push(`${player.name} reconnected.`);
  return state;
}

// ─── Operator actions ─────────────────────────────────────────────────────────

function undoAction(roomCode: string): { state: Stack5State; error?: string } {
  const history = gameHistories[roomCode];
  if (!history || history.length === 0) {
    const state = games[roomCode];
    return { state: state!, error: "Nothing to undo" };
  }
  const prev = history.pop()!;
  games[roomCode] = prev;
  prev.log.push("↩️ Operator undid the last action.");
  return { state: prev };
}

function operatorForceNextTurn(roomCode: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  const cp = getCurrentPlayer(state);
  state.log.push(`🔧 Operator skipped ${cp?.name ?? "current player"}'s turn.`);
  advanceTurn(state);
  return { state };
}

function operatorGiveMC(
  roomCode: string, targetPlayerId: string, amount: number
): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  const target = state.players[targetPlayerId];
  if (!target) return { state, error: "Player not found" };
  target.masterCards = Math.max(0, target.masterCards + amount);
  state.log.push(`🔧 Operator gave ${target.name} ${amount > 0 ? "+" : ""}${amount} MC (now ${target.masterCards}).`);
  return { state };
}

function operatorClearStack(
  roomCode: string, targetPlayerId: string, slotIndex: number
): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  const target = state.players[targetPlayerId];
  if (!target) return { state, error: "Player not found" };
  const stack = target.stacks[slotIndex];
  if (!stack) return { state, error: "Invalid slot" };
  if (stack.cards.length === 0) return { state, error: "Slot is already empty" };
  state.discardPile.push(...stack.cards);
  target.stacks[slotIndex] = { slotIndex, cards: [], matchType: null, matchValue: null, completed: false };
  state.log.push(`🔧 Operator cleared ${target.name}'s slot ${slotIndex + 1}.`);
  return { state };
}

function operatorEndGame(roomCode: string, winnerId: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  const winner = state.players[winnerId];
  if (!winner) return { state, error: "Player not found" };
  state.gameOver = true;
  state.phase = "gameover";
  state.winnerId = winnerId;
  state.winnerName = winner.name;
  state.log.push(`🔧 Operator ended the game. ${winner.name} declared winner.`);
  return { state };
}

function operatorShuffleDeck(roomCode: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  state.drawDeck = shuffle(state.drawDeck);
  state.log.push("🔧 Operator shuffled the draw deck.");
  return { state };
}

function operatorTransferDiscard(roomCode: string): { state: Stack5State; error?: string } {
  const state = games[roomCode];
  if (!state) return { state: undefined as unknown as Stack5State, error: "Game not found" };
  const top = state.discardPile[state.discardPile.length - 1] ?? null;
  const rest = state.discardPile.slice(0, -1);
  state.drawDeck = [...state.drawDeck, ...shuffle(rest)];
  state.discardPile = top ? [top] : [];
  state.log.push("🔧 Operator moved discard pile into the draw deck.");
  return { state };
}

// ─── Getters ──────────────────────────────────────────────────────────────────

function getGame(roomCode: string): Stack5State | null {
  return games[roomCode] ?? null;
}

function deleteGame(roomCode: string): void {
  delete games[roomCode];
  delete gameHistories[roomCode];
}

export {
  createGame, drawCard, playCard, tradeForMaster, secure, steal,
  endTurn, forceAdvanceTurn, reassignPlayerId, getGame, deleteGame,
  saveHistory, undoAction, operatorForceNextTurn, operatorGiveMC,
  operatorClearStack, operatorEndGame, operatorShuffleDeck, operatorTransferDiscard,
};
