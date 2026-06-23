export type BotType = "easy";

export interface Player {
  id: string;
  ready: boolean;
  disconnected?: boolean;

  /** True when this player is a server-side bot (not a connected socket). */
  isBot?: boolean;
  botType?: BotType;
  /** Display name used in lobby. */
  displayName?: string;
}


export interface Room {
  roomCode: string;
  host: string;
  players: Record<string, Player>;
  createdAt: number;
  selectedGameId: string | null;
  /** old socket IDs waiting to be reclaimed */
  disconnectedIds?: string[];
}
