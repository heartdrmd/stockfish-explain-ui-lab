import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BoardController } from '../src/board.js';
import { Chess } from '../vendor/chess.js/chess.js';
import { readMoveDiagnostics } from '../src/move-diagnostics.js';
import { completedGamePgn } from '../src/game_archive.js';

// Played game from the November 2 Nd5 report. After 12.Ng5, the actual
// continuation was 12...Bc4. Trying 12...Nd5 must keep all 40 played plies.
const original = 'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 e6 dxe6 fxe6 Nc3 Bxa6 g3 Nc6 Nh3 Be7 Bg2 O-O Bxc6 dxc6 Ng5 Bc4 O-O h6 Qxd8 Rfxd8 b3 Bxb3 Nf3 Bd5 Nd2 e5 a4 Bf7 Nf3 Nd7 Bd2 Bg6'.split(' ');
const beforeNd5 = 'r2q1rk1/4b1pp/b1p1pn2/2p3N1/8/2N3P1/PP2PP1P/R1BQK2R b KQ - 1 12';

function setup(t, mode = 'practice-finished') {
  const previousDocument = globalThis.document;
  const previousRAF = globalThis.requestAnimationFrame;
  globalThis.document = { body: { dataset: {}, classList: { contains: name => name === mode } } };
  globalThis.requestAnimationFrame = fn => fn();
  t.after(() => { globalThis.document = previousDocument; globalThis.requestAnimationFrame = previousRAF; });
  const board = new BoardController(null, null);
  board.cg = { set() {}, move() {}, setPieces() {}, setAutoShapes() {}, cancelMove() {}, selectSquare() {} };
  const chess = new Chess();
  const moves = original.map(san => {
    const m = chess.move(san);
    return m.from + m.to + (m.promotion || '');
  });
  board.playUciMoves(moves, { animate: false });
  const end = board.livePath;
  const endFen = board.fen();
  const path = end.slice(0, 23 * 2);
  board.goToPath(path);
  assert.equal(board.fen(), beforeNd5);
  return { board, path, end, endFen };
}

for (const mode of ['practice-finished', 'analysis-archived', 'learn-active', '']) {
  test(`12...Nd5 retains the original game and returns to it (${mode || 'plain review'})`, async t => {
    const { board, path, end, endFen } = setup(t, mode);
    const playedContinuation = JSON.stringify(board.tree.nodeAtPath(path).children[0]);
    const archive = Object.freeze({ history: Object.freeze([...original]) });
    board._archiveSnapshot = archive;
    assert.equal(await board._onUserMove('f6', 'd5', { via: '3d-board' }), true);
    assert.equal(board.chess.history().at(-1), 'Nd5');
    const variation = board.tree.currentPath;
    assert.deepEqual(board.tree.mainlineNodes().map(n => n.san), original);
    assert.equal(JSON.stringify(board.tree.nodeAtPath(path).children[0]), playedContinuation);
    assert.deepEqual(board.tree.nodeAtPath(path).children.map(n => n.san), ['Bc4', 'Nd5']);
    assert.equal(board.livePath, end);
    assert.equal(board.viewPly, 24);
    assert.equal(board._historicalChess, board.chess);
    assert.equal(board._archiveSnapshot, archive);
    assert.match(board.tree.pgn(), /\(12\.\.\. Nd5\)/);
    board.toEnd();
    assert.equal(board.fen(), endFen);
    assert.deepEqual(board.chess.history(), original);
    board.goToPath(variation);
    assert.equal(await board._onUserMove('e1', 'g1', { via: 'chessground-after' }), true);
    assert.equal(board.chess.history().at(-1), 'O-O');
    board.undo();
    assert.equal(board.tree.currentPath, variation);
    assert.equal(board.livePath, end);
    board.goToPath(path);
    assert.equal(await board._onUserMove('f6', 'd5'), true);
    assert.equal(board.tree.nodeAtPath(path).children.length, 2, 'retry must merge the existing variation');
    assert.deepEqual(board.tree.mainlineNodes().map(n => n.san), original);
    board.toEnd();
    assert.equal(board.fen(), endFen);
  });
}

test('Nd5 uses the displayed tree position even if a legacy caller cleared viewPly', async t => {
  const { board } = setup(t);
  board.viewPly = null;
  assert.equal(await board._onUserMove('f6', 'd5'), true);
  assert.equal(board.chess.history().length, 24);
  assert.equal(board.chess.history().at(-1), 'Nd5');
  assert.deepEqual(board.tree.mainlineNodes().map(n => n.san), original);
});

for (const [from, to] of [['f6', 'd6'], ['f7', 'd5'], ['e1', 'g1']]) {
  test(`rejected review move ${from}${to} changes neither position nor any branch`, async t => {
    const { board } = setup(t);
    const snapshot = () => JSON.stringify({ tree: board.tree, fen: board.fen(), history: board.chess.history(), livePath: board.livePath, viewPly: board.viewPly });
    const before = snapshot();
    let moves = 0;
    board.addEventListener('move', () => moves++);
    assert.equal(await board._onUserMove(from, to), false);
    assert.equal(snapshot(), before);
    assert.equal(moves, 0);
  });
}

test('engine PV analysis of Nd5 also retains the original endpoint', t => {
  const { board, end, endFen } = setup(t);
  assert.equal(board.playUciMoves(['f6d5'], { fromCurrent: true }), true);
  assert.equal(board.livePath, end);
  assert.deepEqual(board.tree.mainlineNodes().map(n => n.san), original);
  board.toEnd();
  assert.equal(board.fen(), endFen);
});

test('typed Nd5 creates the same variation and does not discard subsequent moves', async t => {
  const { board, end, endFen } = setup(t, 'review-mode');
  assert.equal(await board.playSanMove('Nd5'), true);
  assert.deepEqual(board.tree.mainlineNodes().map(n => n.san), original);
  assert.equal(board.livePath, end);
  const exported = new Chess();
  exported.loadPgn(board.tree.pgn());
  assert.deepEqual(exported.history(), original, 'PGN mainline must remain the played game');
  board.toEnd();
  assert.equal(board.fen(), endFen);
});

test('a rejected attempt remains diagnosable after reloading, without storing user metadata', async t => {
  const { board } = setup(t);
  const oldStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  t.after(() => { globalThis.localStorage = oldStorage; });
  assert.equal(await board._onUserMove('f6', 'd6', { via: '3d-board', token: 'never-store-this' }), false);
  const entries = readMoveDiagnostics();
  assert.deepEqual(entries.map(e => e.stage), ['requested', 'rejected']);
  assert.equal(entries[0].id, entries[1].id);
  assert.equal(entries[1].reason, 'illegal-move');
  assert.doesNotMatch([...store.values()].join(''), /never-store-this/);
  const key = [...store.keys()][0];
  store.set(key, JSON.stringify(Array.from({ length: 300 }, () => entries[0])));
  assert.equal(readMoveDiagnostics().length, 200);
  store.set(key, JSON.stringify([{ ...entries[0], at: '2000-01-01T00:00:00Z' }]));
  assert.equal(readMoveDiagnostics().length, 0);
});

test('review takeback does not prune the recorded game even if requested', t => {
  const { board, end, endFen } = setup(t);
  board.toEnd();
  assert.equal(board.undo({ prune: true }), true);
  assert.equal(board.livePath, end);
  assert.deepEqual(board.tree.mainlineNodes().map(n => n.san), original);
  board.toEnd();
  assert.equal(board.fen(), endFen);
});

test('loaded-game review retains its endpoint even when exploring beyond the last recorded move', async t => {
  const { board, end, endFen } = setup(t, '');
  board.reviewingGame = true;
  board.toEnd();
  const next = board.chess.moves({ verbose: true })[0];
  assert.equal(await board._onUserMove(next.from, next.to), true);
  assert.equal(board.livePath, end);
  board.toEnd();
  assert.equal(board.fen(), endFen);
  board.newGame();
  assert.equal(board.reviewingGame, false);
  assert.equal(await board.playSanMove('e4'), true);
  assert.equal(board.isAtLive(), true, 'new practice/analysis must not inherit review preservation');
});

test('background archiving uses the finished game, even after exploring Nd5 or starting another game', async t => {
  const { board } = setup(t);
  const snapshot = { startingFen: board.startingFen, history: original.map(san => ({ san })) };
  await board.playSanMove('Nd5');
  for (const tree of [board.tree, { pgn() { throw Error('must not consult the later board'); } }]) {
    const saved = new Chess();
    saved.loadPgn(completedGamePgn(tree, snapshot, { Event: 'Practice vs Stockfish', Result: '1-0' }));
    assert.deepEqual(saved.history(), original);
    assert.equal(saved.getHeaders().Result, '1-0');
  }
  assert.match(completedGamePgn(board.tree, null, { Result: '*' }), /\(12\.\.\. Nd5\)/, 'explicit analysis export still includes variations');
});

test('notation and typed moves use the shared controller; 3D requires explicit acceptance', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const bridge = await readFile(new URL('../src/board-3d.js', import.meta.url), 'utf8');
  const navigate = main.slice(main.indexOf('function navigateToTreePath('), main.indexOf('// The same wheel behavior'));
  assert.match(navigate, /return board\.goToPath\(path\)/);
  assert.doesNotMatch(navigate, /viewPly\s*=|board\.chess\s*=/);
  const keyboard = main.slice(main.indexOf('// Keyboard move input'), main.indexOf('// Gauge matches'));
  assert.match(keyboard, /board\.playSanMove\(txt\)/);
  assert.doesNotMatch(keyboard, /board\.chess\.move/);
  assert.match(bridge, /const accepted = await board\._onUserMove/);
  assert.doesNotMatch(bridge, /result\(board\.fen\(\)!==before/);
});
