export type SpaceType =
  | "go"
  | "property"
  | "railroad"
  | "utility"
  | "tax"
  | "chance"
  | "community"
  | "jail"
  | "free_parking"
  | "go_to_jail"
  | "visiting";

export interface BoardSpace {
  index: number;
  name: string;
  type: SpaceType;
  color?: string;
  price?: number;
  tax?: number;
}

export interface GamePlayer {
  id: string;
  name: string;
  position: number;
  cash: number;
  inJail: boolean;
  jailTurns: number;
  color: string;
}

export interface DiceRoll {
  die1: number;
  die2: number;
  total: number;
  isDoubles: boolean;
}

export interface GameState {
  roomCode: string;
  players: Record<string, GamePlayer>;
  turnOrder: string[];
  currentTurnIndex: number;
  phase: "waiting" | "rolling" | "ended";
  lastRoll: DiceRoll | null;
  log: string[];
}
