export type CardColor = "green" | "yellow" | "pink" | "blue";
export type CardShape = "flower" | "lightning" | "star" | "drop";
export type CardType = "standard" | "wild" | "skip" | "reverse" | "reset_hand";

export interface Stack5Card {
  id: string;
  type: CardType;
  color: CardColor | null;
  shape: CardShape | null;
  // Set when a wild card is placed into a stack slot
  assignedColor?: CardColor | null;
  assignedShape?: CardShape | null;
}

export interface Stack5Stack {
  slotIndex: number;
  cards: Stack5Card[];
  matchType: "color" | "shape" | null;
  matchValue: string | null;
  completed: boolean;
}

export interface Stack5Player {
  id: string;
  name: string;
  color: string;
  hand: Stack5Card[];
  stacks: Stack5Stack[];
  points: number;
  masterCards: number;
  skippedNextTurn: boolean;
  isBot?: boolean;
  botType?: string;
}

export interface Stack5State {
  roomCode: string;
  phase: "playing" | "gameover";
  players: Record<string, Stack5Player>;
  turnOrder: string[];
  currentTurnIndex: number;
  direction: 1 | -1;
  actionsRemaining: number;
  drawDeck: Stack5Card[];
  discardPile: Stack5Card[];
  targetScore: number;
  turnTimerSeconds: number;
  turnStartedAt: number;
  gameOver: boolean;
  winnerId: string | null;
  winnerName: string | null;
  log: string[];
  hostId: string;
}
