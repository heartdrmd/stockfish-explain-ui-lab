# Account board settings

The UI Lab uses its own PostgreSQL 16 database in Ohio, matching the existing dev database's Basic 256 MB / 15 GB setup. `DATABASE_URL` is configured privately in Render. The web service stays on its existing Free plan. No old database users or games are copied, and paid AI remains separately gated.

Migration `018_user_board_settings` creates one revisioned JSONB document per user, with a foreign key to the existing account table. Authenticated GET/PATCH `/api/board-settings` use the existing session cookie and additionally bind requests to the expected account. Responses are not cached. Writes validate the complete viewer configuration, check origin, and use a transaction plus optimistic revision checks.

The embedded viewer restores presentation only, preserving the parent game's current position and clocks. Each account has a separate browser cache and durable pending operations. A first account with no server profile imports that browser's existing guest settings and saved views once. Existing server settings win when signing in from another device. Guest settings remain separate after logout. Automatic last-used settings, all piece sizes/materials/light controls, camera/fit, coordinates, clock appearance and visibility, moves/evaluation visibility, and named presets synchronize. Delete tombstones prevent stale devices resurrecting removed presets. The latest explicit edit wins after a revision conflict; saved views merge by ID. Settings status is shown under Saved views.

After viewer edits, build and update both the embedded frontend and validator together:

```
# In the viewer checkout:
npm run build:portable
# In this checkout:
node scripts/update-zagreb.mjs /absolute/path/to/zagreb-viewer
```

Validation: `npm test`; run `BOARD_SYNC_TEST_URL=http://localhost:8343 node --test test/board-settings.test.js` against an isolated local PostgreSQL app to exercise the real account API. That integration test creates disposable QA accounts; do not point it at a shared production service.
