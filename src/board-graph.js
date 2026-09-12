import { povChances } from './eval-graph.js';

// The compact fullscreen graph reads the same cached evaluations as the
// existing timeline. Toggling it never starts another analysis or engine.
export function studyGraphForBoard(board, cache, visible, enabled) {
  const graph = {available:true, visible:visible && enabled, enabled,
    cursorPath:board.tree?.currentPath || '', points:[]};
  if (!graph.visible) return graph;
  let node = board.tree?.root, path = '';
  while (node?.children?.length && graph.points.length < 5000) {
    const before = node.fen.split(' ');
    node = node.children[0];
    if (!node?.fen || !node.id) break;
    path += node.id;
    const evaluation = cache.get(node.fen) || {};
    const cp = Number.isFinite(evaluation.cpWhite) ? evaluation.cpWhite : null;
    const mate = Number.isFinite(evaluation.mate) ? evaluation.mate : null;
    const hasEval = cp !== null || (mate !== null && mate !== 0);
    graph.points.push({path, label:`${before[5]}${before[1] === 'b' ? '…' : '.'} ${node.san}`,
      value:hasEval ? povChances(cp, mate) : null,
      score:hasEval ? mate !== null ? `#${mate}` : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}` : 'Not evaluated'});
  }
  return graph;
}
