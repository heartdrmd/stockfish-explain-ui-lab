import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { claimGuestData } from '../src/server/auth.js';

const GUEST_ID = 'guest_claim_token_1234567890';

function normalized(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function claimHarness({ failGameUpdate = false, empty = false } = {}) {
  const transactions = [];
  const calls = [];
  let transactionIndex = 0;

  const transaction = async work => {
    const tx = { index: transactionIndex++, calls: [] };
    transactions.push(tx);
    const txQuery = async (sql, params = []) => {
      const text = normalized(sql);
      const call = { text, params, tx: tx.index };
      tx.calls.push(call);
      calls.push(call);

      if (failGameUpdate && /^UPDATE games /.test(text)) {
        throw new Error('simulated games collision');
      }
      if (/^DELETE FROM games /.test(text)) {
        const rows = empty ? [] : [{ id: 7, client_game_id: 'shared-client-id' }];
        return { rows, rowCount: rows.length };
      }
      if (/^UPDATE games /.test(text)) {
        const rows = empty ? [] : [{ id: 8 }, { id: 9 }];
        return { rows, rowCount: rows.length };
      }
      if (/^DELETE FROM favourites /.test(text)) {
        const rows = empty ? [] : [{ opening_key: 'Sicilian//2' }];
        return { rows, rowCount: rows.length };
      }
      if (/^UPDATE favourites /.test(text)) {
        const rows = empty ? [] : [{ opening_key: 'Italian//0' }];
        return { rows, rowCount: rows.length };
      }
      if (/^DELETE FROM custom_openings /.test(text)) {
        const rows = empty ? [] : [{ id: 11, group_name: 'Mine', opening_name: 'Line A' }];
        return { rows, rowCount: rows.length };
      }
      if (/^UPDATE custom_openings /.test(text)) {
        const rows = empty ? [] : [{ id: 12 }];
        return { rows, rowCount: rows.length };
      }
      if (/^UPDATE (engine_crashes|diagnostic_logs) /.test(text)) {
        const rows = empty ? [] : [{ id: 20 }];
        return { rows, rowCount: rows.length };
      }
      if (/^INSERT INTO guest_claim_audit/.test(text)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${text}`);
    };
    return work(txQuery);
  };

  return { transaction, transactions, calls };
}

const quietLogger = { info() {}, warn() {} };

test('guest claim deletes only account collisions before reassigning rows', async () => {
  const harness = claimHarness();
  const results = await claimGuestData(42, GUEST_ID, {
    transaction: harness.transaction,
    logger: quietLogger,
  });

  assert.equal(harness.transactions.length, 5, 'one independent transaction per table');
  assert.deepEqual(results.map(row => row.table), [
    'games', 'favourites', 'custom_openings', 'engine_crashes', 'diagnostic_logs',
  ]);
  assert.deepEqual(results[0], { table: 'games', removed: 1, claimed: 2 });

  const gameCalls = harness.transactions[0].calls;
  assert.match(gameCalls[0].text, /^DELETE FROM games g /);
  assert.match(gameCalls[0].text, /g\.client_game_id IS NOT NULL/);
  assert.match(gameCalls[0].text, /u\.user_id = \$1/);
  assert.match(gameCalls[0].text, /u\.client_game_id = g\.client_game_id/);
  assert.deepEqual(gameCalls[0].params, [42, GUEST_ID]);
  assert.match(gameCalls[1].text, /^UPDATE games /);
  assert.match(gameCalls[2].text, /^INSERT INTO guest_claim_audit/);

  const auditCalls = harness.calls.filter(call => /^INSERT INTO guest_claim_audit/.test(call.text));
  assert.equal(auditCalls.length, 5);
  for (const call of auditCalls) {
    assert.notEqual(call.params[1], GUEST_ID, 'audit must not persist the bearer guest token');
    assert.match(call.params[1], /^[a-f0-9]{64}$/);
  }
});

test('guest claim is idempotent and creates no empty audit records', async () => {
  const harness = claimHarness({ empty: true });
  const results = await claimGuestData(42, GUEST_ID, {
    transaction: harness.transaction,
    logger: quietLogger,
  });

  assert.equal(results.every(row => row.removed === 0 && row.claimed === 0), true);
  assert.equal(harness.calls.some(call => /^INSERT INTO guest_claim_audit/.test(call.text)), false);
});

test('a failed games transaction does not block the independent library claims', async () => {
  const harness = claimHarness({ failGameUpdate: true });
  const results = await claimGuestData(42, GUEST_ID, {
    transaction: harness.transaction,
    logger: quietLogger,
  });

  assert.match(results[0].error, /simulated games collision/);
  assert.deepEqual(results.slice(1).map(row => row.table), [
    'favourites', 'custom_openings', 'engine_crashes', 'diagnostic_logs',
  ]);
});

test('database transactions are bound to one checked-out client and always release it', async () => {
  const dbSource = await readFile(new URL('../src/server/db.js', import.meta.url), 'utf8');
  assert.match(dbSource, /const client = await db\.connect\(\)/);
  assert.match(dbSource, /await client\.query\('BEGIN'\)/);
  assert.match(dbSource, /await work\(\(sql, params = \[\]\) => client\.query\(sql, params\)\)/);
  assert.match(dbSource, /await client\.query\('COMMIT'\)/);
  assert.match(dbSource, /await client\.query\('ROLLBACK'\)/);
  assert.match(dbSource, /finally \{[\s\S]*?client\.release\(\)/);
});
