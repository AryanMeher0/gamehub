import fs from "fs";
import path from "path";

const SAVES_DIR = path.join(__dirname, "..", "data", "saves");

if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });

function savePath(roomCode: string): string {
  return path.join(SAVES_DIR, `${roomCode}.json`);
}

export function saveGame<T>(roomCode: string, state: T): void {
  try {
    fs.writeFileSync(savePath(roomCode), JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error(`[saveManager] Failed to save ${roomCode}:`, e);
  }
}

export function loadGame<T>(roomCode: string): T | null {
  try {
    const raw = fs.readFileSync(savePath(roomCode), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function deleteSave(roomCode: string): void {
  try {
    if (fs.existsSync(savePath(roomCode))) fs.unlinkSync(savePath(roomCode));
  } catch (e) {
    console.error(`[saveManager] Failed to delete save ${roomCode}:`, e);
  }
}

export interface SaveMeta {
  roomCode: string;
  savedAt: number;
  playerNames: string[];
  phase: string;
}

export function listSaves(): SaveMeta[] {
  try {
    return fs
      .readdirSync(SAVES_DIR)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f): SaveMeta[] => {
        try {
          const raw = fs.readFileSync(path.join(SAVES_DIR, f), "utf-8");
          const data = JSON.parse(raw);
          return [{
            roomCode: data.roomCode ?? f.replace(".json", ""),
            savedAt:  data.savedAt  ?? 0,
            playerNames: data.playerNames ?? [],
            phase:    data.phase    ?? "unknown",
          }];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
