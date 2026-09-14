import { Engine } from "./engine.js";

export function evaluationFromEngine(engine, fen) {
  if (engine.currentFen !== fen) return null;
  const best = engine.topMoves?.get(1);
  if (
    !best ||
    best.bound ||
    !Number.isFinite(best.score) ||
    !["cp", "mate"].includes(best.scoreKind)
  )
    return null;
  const score = best.score * (fen.split(" ")[1] === "b" ? -1 : 1);
  return {
    cp: best.scoreKind === "cp" ? score : null,
    mate: best.scoreKind === "mate" ? score : null,
    depth: best.depth || 0,
  };
}

// A display-only engine never plays a move or changes the opponent's limits.
// Keep one worker across moves, and discard all results for superseded FENs.
export class PracticeEvaluation {
  constructor(createEngine, publish) {
    this.createEngine = createEngine;
    this.publish = publish;
    this.current = null;
    this.worker = null;
    this.requested = "";
    this.cache = new Map();
    this.failed = false;
  }
  update(request) {
    if (!request.enabled) {
      this.stop();
      return;
    }
    const changed =
      !this.current || this.current.fen !== request.fen || this.current.flavor !== request.flavor;
    if (this.current && this.current.flavor !== request.flavor) {
      this.stop();
      this.cache.clear();
    }
    this.current = request;
    if (changed)
      this.publish({
        active: true,
        fen: request.fen,
        evaluation: this.cache.get(`${request.flavor}:${request.fen}`) || null,
        status: "Evaluating…",
      });
    if (!this.worker && !this.failed) {
      const worker = this.createEngine();
      this.worker = worker;
      worker.multipv = 1;
      worker.skill = 20;
      worker.hashMB = 32;
      worker.backgroundEvaluation = true;
      const receive = () => {
        if (this.worker !== worker || !this.current) return;
        const fen = this.current.fen,
          evaluation = evaluationFromEngine(worker, fen);
        if (!evaluation) return;
        this.cache.set(`${this.current.flavor}:${fen}`, evaluation);
        if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value);
        this.publish({ active: true, fen, evaluation, status: "" });
      };
      worker.addEventListener("thinking", receive);
      worker.addEventListener("bestmove", receive);
      const fail = () => {
        if (this.worker !== worker) return;
        this.failed = true;
        this.worker = null;
        worker.terminate();
        if (this.current)
          this.publish({
            active: true,
            fen: this.current.fen,
            evaluation: null,
            status: "Evaluation unavailable",
          });
      };
      worker.addEventListener("engine-crashed", fail);
      worker.addEventListener("engine-terminated", fail);
      worker
        .boot({ flavor: request.flavor, threads: 1 })
        .then(() => {
          if (this.worker !== worker) {
            worker.terminate();
            return;
          }
          worker.setMultiPV(1);
          worker.setSkill(20);
          worker.setThreads(1);
          worker.setHash(32);
          this.search();
        })
        .catch(fail);
    }
    this.search();
  }
  search() {
    if (!this.worker?.ready || !this.current || this.requested === this.current.fen) return;
    this.requested = this.current.fen;
    this.worker.start(this.requested, { depth: 20, movetime: 1500 });
  }
  stop() {
    const active = !!this.current;
    const worker = this.worker;
    this.worker = null;
    this.current = null;
    this.requested = "";
    this.failed = false;
    worker?.terminate();
    if (active) this.publish({ active: false });
  }
}

export function installPracticeEvaluation(board, getContext, ui) {
  const gauge = document.getElementById("eval-gauge-control");
  const evaluator = new PracticeEvaluation(
    () => new Engine(),
    (state) => {
      board.practiceEvaluation = state;
      if (state.active && state.fen === board.fen()) {
        const value = state.evaluation;
        ui.gaugeBlack.dataset.evaluation = JSON.stringify({
          fen: state.fen,
          evaluation: value,
          status: state.status,
        });
        const advantage =
          value?.mate != null ? (value.mate >= 0 ? 1 : -1) : Math.tanh((value?.cp || 0) / 500);
        ui.gaugeBlack.style.height = `${50 - advantage * 48}%`;
        ui.pearl.textContent = value
          ? value.mate != null
            ? `${value.mate >= 0 ? "+" : "−"}M${Math.abs(value.mate)}`
            : `${value.cp >= 0 ? "+" : "−"}${(Math.abs(value.cp) / 100).toFixed(2)}`
          : "…";
      ui.pearl.title = value ? `White's perspective · depth ${value.depth}` : state.status;
      ui.pearl.className = `pearl ${value?.mate != null ? "mate" : value?.cp >= 300 ? "winning" : value?.cp <= -300 ? "losing" : ""}`;
      }
      board.dispatchEvent(new Event("evaluation-change"));
    },
  );
  let frame = 0;
  const refresh = () => {
    frame = 0;
    const context = getContext();
    evaluator.update({
      fen: board.fen(),
      flavor: context.flavor,
      enabled:
        !!context.practice &&
        !!context.flavor &&
        !context.busy &&
        !board.watchActive &&
        !document.hidden &&
        !gauge?.classList.contains("eval-gauge-hidden") &&
        !board.chess.isGameOver(),
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(refresh);
  };
  for (const event of ["move", "nav", "new-game", "undo", "analysis-change"])
    board.addEventListener(event, schedule);
  new MutationObserver(schedule).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  if (gauge)
    new MutationObserver(schedule).observe(gauge, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("pagehide", () => evaluator.stop());
  refresh();
}
