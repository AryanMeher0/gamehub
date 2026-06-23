import { GAME_REGISTRY } from "../games/registry";

export type BotDecision = {
  // placeholder for future bot actions
  // For now, bots will be passive until a game defines an action surface.
};

export function decideEasyBot(_args: {
  roomCode: string;
  gameId: string;
  botId: string;
}): BotDecision {
  // Stack5 is currently "Coming soon" server-side in this repo snapshot.
  // This function exists to provide the extension point for future games.
  const _ = GAME_REGISTRY;
  return {};
}

