# TODO

- [x] Inspect lobby page and confirm Add Bot button rendering and placement.
- [x] Inspect backend socket handler for `lobby:addBot` and verify it emits `roomUpdated`.
- [x] Fix backend bot id normalization so bot ids remain consistent with `roomCode` normalization.
- [ ] Revert/avoid any unrelated front-end changes (Board.tsx) if not required for Add Bot visibility.
- [ ] Ensure correct build/deploy output includes the backend fix.
- [ ] Commit the fix.

