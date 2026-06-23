const RECONNECT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ReconnectSession {
  oldSocketId: string;
  roomCode: string;
  gameId: string; // e.g. "monopoly"
  timer: ReturnType<typeof setTimeout>;
}

// oldSocketId → session
const sessions = new Map<string, ReconnectSession>();

/**
 * Register a disconnected player for potential reconnection.
 * @param onExpire  Called when the timer fires — perform actual removal here.
 */
export function registerDisconnect(
  oldSocketId: string,
  roomCode: string,
  gameId: string,
  onExpire: (oldSocketId: string, roomCode: string) => void
): void {
  // If a session already exists (e.g. rapid reconnect/disconnect) clear old timer
  clearSession(oldSocketId);

  const timer = setTimeout(() => {
    sessions.delete(oldSocketId);
    onExpire(oldSocketId, roomCode);
  }, RECONNECT_TTL_MS);

  sessions.set(oldSocketId, { oldSocketId, roomCode, gameId, timer });
  console.log(`[reconnect] Registered ${oldSocketId} for room ${roomCode} (5 min window)`);
}

/**
 * Try to match a reconnecting socket to a pending session.
 * Returns the session if a match exists (by roomCode + gameId hint or explicit oldId).
 */
export function claimReconnect(
  newSocketId: string,
  roomCode: string
): ReconnectSession | null {
  for (const [oldId, session] of sessions) {
    if (session.roomCode === roomCode) {
      clearTimeout(session.timer);
      sessions.delete(oldId);
      console.log(`[reconnect] ${oldId} reclaimed by ${newSocketId} in room ${roomCode}`);
      return session;
    }
  }
  return null;
}

/**
 * Look up a pending session by old socket ID (for explicit reconnect with stored ID).
 */
export function claimReconnectById(
  newSocketId: string,
  oldSocketId: string
): ReconnectSession | null {
  const session = sessions.get(oldSocketId);
  if (!session) return null;
  clearTimeout(session.timer);
  sessions.delete(oldSocketId);
  console.log(`[reconnect] ${oldSocketId} explicitly reclaimed by ${newSocketId}`);
  return session;
}

export function clearSession(socketId: string): void {
  const s = sessions.get(socketId);
  if (s) {
    clearTimeout(s.timer);
    sessions.delete(socketId);
  }
}

export function hasPendingReconnect(roomCode: string): boolean {
  for (const s of sessions.values()) {
    if (s.roomCode === roomCode) return true;
  }
  return false;
}

export function getPendingForRoom(roomCode: string): string[] {
  const ids: string[] = [];
  for (const [id, s] of sessions) {
    if (s.roomCode === roomCode) ids.push(id);
  }
  return ids;
}
