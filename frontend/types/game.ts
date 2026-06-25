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
  mortgaged: boolean;
}

export interface GamePlayer {
  id: string;
  name: string;
  position: number;
  cash: number;
  inJail: boolean;
  jailTurns: number;
  consecutiveDoubles: number;
  getOutOfJailFreeCards: number;
  color: string;
  bankrupt: boolean;
  isBot?: boolean;
  botType?: "easy" | "medium" | "hard";
}

export interface PlayerRanking {
  id: string;
  name: string;
  color: string;
  cash: number;
  propertyCount: number;
  netWorth: number;
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

export interface AuctionState {
  spaceIndex: number;
  highestBid: number;
  highestBidderId: string | null;
  passedPlayerIds: string[];
}

export interface GameState {
  roomCode: string;
  players: Record<string, GamePlayer>;
  turnOrder: string[];
  currentTurnIndex: number;
  phase: "waiting" | "rolling" | "buying" | "card" | "ended" | "gameover" | "auction";
  lastRoll: DiceRoll | null;
  properties: Record<number, PropertyOwnership>;
  log: string[];
  activeCard: DrawnCard | null;
  gameOver: boolean;
  winnerId: string | null;
  winnerName: string | null;
  rankings: PlayerRanking[];
  trades: Record<string, TradeOffer>;
  auctionState: AuctionState | null;
  housesRemaining: number;
  hotelsRemaining: number;
  chanceDeck: string[];
  communityDeck: string[];
}
