export interface Player {
  id: string;
  ready: boolean;
}

export interface Room {
  roomCode: string;
  host: string;
  players: Record<string, Player>;
  createdAt: number;
}
