export type BotType = "easy" | "medium" | "hard";

export interface Player {
  id: string;
  ready: boolean;

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
}
