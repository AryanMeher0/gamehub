export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  icon: string;
}

export const GAME_REGISTRY: GameDefinition[] = [
  {
    id: "monopoly",
    name: "Monopoly",
    description: "Buy properties, collect rent, and bankrupt your opponents.",
    minPlayers: 2,
    maxPlayers: 4,
    icon: "🏦",
  },
  {
    id: "stack5",
    name: "Stack5",
    description: "Stack tiles to reach 5 in a row before your opponents.",
    minPlayers: 2,
    maxPlayers: 4,
    icon: "🧱",
  },
  {
    id: "arena",
    name: "Arena Brawler",
    description: "Last player standing wins the arena.",
    minPlayers: 2,
    maxPlayers: 4,
    icon: "⚔️",
  },
];
