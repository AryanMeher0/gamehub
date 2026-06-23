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
  rent?: number;
  tax?: number;
}

export interface PropertyOwnership {
  spaceIndex: number;
  ownerId: string;
  price: number;
  rent: number;
  name: string;
  color?: string;
  type: SpaceType;
  houseCount: number;
  hasHotel: boolean;
}

export interface GamePlayer {
  id: string;
  name: string;
  position: number;
  cash: number;
  inJail: boolean;
  jailTurns: number;
  /** Used for "3 consecutive doubles" jail rule. */
  consecutiveDoubles: number;
  /** Number of Get Out of Jail Free cards held by the player. */
  getOutOfJailFreeCards: number;
  color: string;
  bankrupt: boolean;
}


export interface PlayerRanking {
  id: string;
  name: string;
  color: string;
  cash: number;
  propertyCount: number;
  rank: number;
}

export interface DiceRoll {
  die1: number;
  die2: number;
  total: number;
  isDoubles: boolean;
}

export interface DrawnCard {
  id: string;
  title: string;
  description: string;
  deck: "chance" | "community";
}

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  offeredCash: number;
  requestedCash: number;
  offeredPropertyIndices: number[];
  requestedPropertyIndices: number[];
  status: "pending" | "accepted" | "rejected";
}

export interface GameState {
  roomCode: string;
  players: Record<string, GamePlayer>;
  turnOrder: string[];
  currentTurnIndex: number;
  phase: "waiting" | "rolling" | "buying" | "card" | "ended" | "gameover";
  lastRoll: DiceRoll | null;
  properties: Record<number, PropertyOwnership>;
  log: string[];
  activeCard: DrawnCard | null;
  gameOver: boolean;
  winnerId: string | null;
  winnerName: string | null;
  rankings: PlayerRanking[];
  trades: Record<string, TradeOffer>;
}
