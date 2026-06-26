Bots Step 1 notes (no code changes yet)

- Will update backend room player type and add bot insertion socket event.
- Will update lobby UI with host-only Add Bot button.
- Will adjust startGame gating to count bots toward minPlayers.

Planned safety constraints:
- Keep existing socket events unchanged.
- Add new socket event(s) only.
- Ensure operator panel still works (host identity rules unchanged for human host).

