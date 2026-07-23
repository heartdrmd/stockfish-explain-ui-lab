// Pure, fail-closed liveness predicate for an engine move in Practice.
// A search result belongs to both a search generation and one exact position;
// the displayed board must still be that live position when the move is
// applied. Keeping this pure makes every play site use the same contract.
export function canApplyPracticeEngineMove({
  launchFen,
  resultFen,
  boardFen,
  searchToken,
  currentSearchToken,
  isAtLive,
  boardPly,
  livePly,
  practiceFinished = false,
} = {}) {
  if (!launchFen || practiceFinished || !isAtLive) return false;
  if (resultFen !== launchFen || boardFen !== launchFen) return false;
  if (searchToken !== currentSearchToken) return false;
  if (!Number.isInteger(boardPly) || !Number.isInteger(livePly)) return false;
  return boardPly >= livePly;
}
