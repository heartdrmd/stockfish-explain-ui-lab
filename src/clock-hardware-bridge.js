import { ClockHardware } from "./generated/clock-hardware.js";

// The study application's timer owns this controller. Both clock placements
// send input to it; neither renderer is allowed to run a second game timer.
export function createClockHardwareBridge({
  clock,
  turn,
  render,
  expired,
  now = () => Date.now(),
  storage = globalThis.localStorage,
}) {
  let family,
    engine,
    reportedFlag = false,
    audio,
    lastBeep = 0;
  const load = (kind) => {
    try {
      return JSON.parse(storage?.getItem(`stockfish.clock-hardware-v1:${kind}`) || "null");
    } catch {
      return undefined;
    }
  };
  function legacy() {
    return {
      whiteMs: clock.msWhite,
      blackMs: clock.msBlack,
      running: clock.tickingFor,
      paused: clock.paused === true,
      mode: clock.mode,
      control: { minutes: clock.initialMs / 60000, incrementSeconds: clock.incMs / 1000 },
    };
  }
  function sync() {
    if (!engine) return;
    const snapshot = engine.snapshot();
    if (engine.beep !== lastBeep) {
      lastBeep = engine.beep;
      if (audio?.state === "running") {
        const oscillator = audio.createOscillator(),
          gain = audio.createGain();
        oscillator.frequency.value = 2400;
        gain.gain.setValueAtTime(0.035, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.1);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.11);
      }
    }
    if (!engine.gameBound && !engine.untimed) clock.displayOnly = false;
    clock.mode =
      engine.untimed || engine.config.periods[engine.stages[engine.lever]].method === "UPCNT"
        ? "up"
        : "down";
    clock.msBlack = Math.abs(engine.times[0]);
    clock.msWhite = Math.abs(engine.times[1]);
    clock.paused = engine.phase !== "running";
    clock.tickingFor = engine.lever ? "w" : "b";
    clock.lastTickAt = now();
    clock.hardware = { family, display: snapshot.display };
    clock.hardwareLabel = engine.gameBound
      ? undefined
      : `${snapshot.display.title} · ${engine.config.periods[0].method} · set on clock`;
    const period = engine.config.periods[0];
    clock.incMs = period.method === "FISCH" ? period.extra[0] : 0;
    clock.initialMs = period.time[0];
    if (engine.flag !== null && !engine.untimed && !reportedFlag) {
      reportedFlag = true;
      expired(engine.flag ? "white" : "black");
    }
  }
  function adopt() {
    if (!family || !clock.active) {
      engine = undefined;
      clock.hardware = undefined;
      clock.hardwareLabel = undefined;
      return;
    }
    engine = new ClockHardware(family, load(family));
    engine.now = now();
    engine.adoptGame(legacy());
    reportedFlag = false;
    sync();
  }
  function resume() {
    if (engine.flag !== null && engine.config.freeze) return;
    // The board may have advanced while paused. Resume its current player,
    // without awarding a move bonus or charging the pause duration.
    engine.lever = turn() === "w" ? 1 : 0;
    engine.pausedLever = engine.lever;
    if (!engine.started) engine.first = engine.lever;
    engine.phase = "running";
    engine.started = true;
  }
  return {
    get active() {
      return !!engine;
    },
    model(value) {
      const next = ["dgt", "zmf"].includes(value) ? value : undefined;
      if (family === next && (!clock.active || engine)) return;
      if (engine) {
        engine.advance(now());
        sync();
      }
      family = next;
      adopt();
      render();
    },
    restart: adopt,
    stop() {
      if (engine) {
        engine.cancel(now());
        engine.phase = "paused";
      }
    },
    tick() {
      if (!engine) return false;
      engine.advance(now());
      sync();
      return true;
    },
    pause() {
      if (!engine) return false;
      engine.advance(now());
      engine.cancel(now());
      if (engine.phase === "running") {
        engine.phase = "paused";
        engine.pausedLever = engine.lever;
      } else if (["paused", "ready", "off"].includes(engine.phase)) {
        resume();
      }
      sync();
      render();
      return true;
    },
    moved() {
      if (!engine) return false;
      engine.advance(now());
      // Board-driven games still switch automatically. A physical click cannot
      // advance the turn or apply the same increment a second time.
      if (engine.phase === "running") engine.tap(engine.lever ? "right" : "left", now());
      if (engine.untimed) engine.lever = turn() === "w" ? 1 : 0;
      sync();
      render();
      return true;
    },
    input(key, phase) {
      if (
        !engine ||
        !clock.active ||
        !["back", "minus", "menu", "plus", "forward", "left", "right", "power"].includes(key) ||
        !["down", "up", "cancel"].includes(phase)
      )
        return;
      if (
        (key === "left" || key === "right") &&
        ["running", "ready", "paused"].includes(engine.phase)
      ) {
        // Sensors remain functional in setup/correction. During a board game,
        // the legal board move owns the side switch. A ZMF sensor starts a
        // ready clock after reset/power-on as well as resuming a paused clock.
        if (family === "zmf" && ["paused", "ready"].includes(engine.phase) && phase === "down") {
          engine.advance(now());
          engine.cancel(now());
          resume();
          sync();
          render();
        }
        return;
      }
      if (phase === "down") {
        try {
          if (globalThis.AudioContext) {
            audio ??= new AudioContext();
            void audio.resume().catch(() => {});
          }
        } catch {}
      }
      if (phase === "down") engine.down(key, now());
      else engine.up(key, now(), phase === "cancel");
      sync();
      render();
      try {
        storage?.setItem(`stockfish.clock-hardware-v1:${family}`, JSON.stringify(engine.save()));
      } catch {}
    },
  };
}
