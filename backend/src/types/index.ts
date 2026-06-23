export interface Player {
  id: string;
  ready: boolean;
  disconnected?: boolean;
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
