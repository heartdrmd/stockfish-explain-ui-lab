//#region lib/clock-hardware.ts
var other = (side) => 1 - side;
var pair = (value) => [value, value];
var copy = (value) => JSON.parse(JSON.stringify(value));
var period = (minutes = 0, method = "TIME", extra = 0) => ({
	method,
	time: pair(minutes * 6e4),
	extra: pair(extra * 1e3),
	moves: 0,
	moments: pair(1)
});
var base = () => ({
	periods: [period(5)],
	freeze: false,
	sound: false,
	leds: true,
	increment: "PRE",
	delayDisplay: "F",
	tournament: false,
	counter: true
});
function dgtPreset(option) {
	const c = base();
	const times = {
		1: [5],
		2: [10],
		3: [25],
		4: [60],
		5: [120],
		6: [120, 30],
		7: [120, 60],
		8: [
			120,
			60,
			30
		],
		9: [
			120,
			60,
			60
		],
		10: [3],
		11: [25],
		12: [90],
		13: [90, 30],
		14: [
			100,
			50,
			15
		],
		15: [25],
		16: [115],
		17: [120, 15],
		18: [
			120,
			60,
			15
		],
		19: [60, 5],
		20: [60, 1 / 3],
		21: [25, 0],
		22: [5],
		23: [25],
		24: [115, 60]
	};
	const method = option >= 10 && option <= 14 ? "FISCH" : option >= 15 && option <= 18 ? "DELAY" : option >= 22 && option <= 24 ? "US-DLY" : "TIME";
	const bonus = {
		10: 2,
		11: 10,
		12: 30,
		13: 30,
		14: 30,
		15: 10,
		16: 5,
		17: 30,
		18: 30,
		22: 2,
		23: 5,
		24: 5
	}[option] || 0;
	c.periods = (times[option] || [0]).map((t) => period(t, method, bonus));
	if (option === 19) c.periods[1].method = "CAN-BYO";
	if (option === 20) c.periods[1].method = "BYO";
	if (option === 21) c.periods[1].method = "UPCNT";
	c.freeze = option >= 10 && option <= 18;
	c.sound = option >= 19 && option <= 21;
	return c;
}
function formatHardwareTime(ms, full = false) {
	const n = Math.ceil(Math.abs(ms) / 1e3), h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, s = n % 60;
	return `${ms < 0 ? "-" : ""}${full || h ? `${h}:${String(m).padStart(2, "0")}` : String(m)}:${String(s).padStart(2, "0")}`;
}
var ClockHardware = class {
	constructor(family, saved) {
		this.untimed = false;
		this.gameBound = false;
		this.option = 1;
		this.manual = {};
		this.phase = "ready";
		this.times = pair(3e5);
		this.moves = pair(0);
		this.stages = pair(0);
		this.stageMoves = pair(0);
		this.delay = pair(0);
		this.turnStart = pair(0);
		this.lever = 1;
		this.first = 1;
		this.started = false;
		this.pausedLever = 1;
		this.flag = null;
		this.periodFlag = null;
		this.periodFlagUntil = 0;
		this.now = 0;
		this.beep = 0;
		this.revision = 0;
		this.showMoves = false;
		this.movesUntil = 0;
		this.notice = "";
		this.field = 0;
		this.digit = 0;
		this.zmfMenu = -1;
		this.zmfEditing = false;
		this.zmfSection = "";
		this.tournamentCount = 0;
		this.held = null;
		this.lastMenuTap = -Infinity;
		this.correctionTimes = pair(0);
		this.correctionMoves = pair(0);
		this.correctionStages = pair(0);
		this.powerAt = -Infinity;
		this.family = family;
		this.config = family === "dgt" ? dgtPreset(1) : {
			...base(),
			sound: true
		};
		this.draft = copy(this.config);
		try {
			const v = saved;
			if (v?.version === 1) {
				this.option = Math.max(1, Math.min(30, Math.round(v.option || 1)));
				if (validConfig(v.config)) this.config = copy(v.config);
				for (const [key, value] of Object.entries(v.manual || {})) if (+key >= 26 && +key <= 30 && validConfig(value)) this.manual[+key] = copy(value);
			}
		} catch {}
		this.reset();
		if (family === "dgt") this.phase = "option";
	}
	adoptGame(clock) {
		this.untimed = clock.mode === "up";
		this.gameBound = true;
		const c = base();
		c.periods = [period(clock.control?.minutes || 5, clock.mode === "up" ? "UPCNT" : clock.control?.incrementSeconds ? "FISCH" : "TIME", clock.control?.incrementSeconds || 0)];
		c.freeze = clock.mode === "down";
		c.sound = this.config.sound;
		c.leds = this.config.leds;
		this.config = c;
		this.times = [clock.blackMs, clock.whiteMs];
		this.turnStart = [...this.times];
		this.lever = clock.running === "b" ? 0 : 1;
		this.pausedLever = this.lever;
		this.started = true;
		this.phase = clock.paused ? "paused" : "running";
		this.flag = null;
	}
	save() {
		return {
			version: 1,
			option: this.option,
			config: this.config,
			manual: this.manual
		};
	}
	current(side = this.lever) {
		return this.config.periods[this.stages[side]] || this.config.periods[0];
	}
	initial(p, side) {
		return p.method === "UPCNT" ? 0 : p.time[side] * (p.method === "BYO" ? Math.max(1, p.moments[side]) : 1) + (p.method === "FISCH" && this.config.increment === "PRE" || p.method === "DELAY" ? p.extra[side] : 0);
	}
	reset() {
		this.gameBound = false;
		this.times = [this.initial(this.config.periods[0], 0), this.initial(this.config.periods[0], 1)];
		this.moves = pair(0);
		this.stages = pair(0);
		this.stageMoves = pair(0);
		this.delay = [...this.config.periods[0].extra];
		this.turnStart = [...this.times];
		this.started = false;
		this.flag = null;
		this.periodFlag = null;
		this.phase = "ready";
		this.showMoves = false;
		this.movesUntil = 0;
		this.notice = "";
		this.first = this.lever;
		this.pausedLever = this.lever;
		this.revision++;
	}
	advance(now) {
		if (!Number.isFinite(now) || now < this.now) return;
		const elapsed = now - this.now;
		this.now = now;
		if (this.phase === "running" && elapsed > 0) this.elapse(elapsed);
		const h = this.held;
		if (h) {
			const age = now - h.at;
			if (h.repeat && age >= 1e3) {
				const count = Math.floor((age - 1e3) / 120) + 1;
				while (h.repeats < count) {
					this.short(h.key);
					h.repeats++;
				}
				h.fired = true;
			} else if (!h.fired && age >= h.threshold) {
				this.long(h.key);
				h.fired = true;
			}
		}
	}
	elapse(elapsed) {
		const s = this.lever, p = this.current();
		let dt = elapsed;
		if (p.method === "US-DLY") {
			const free = Math.min(dt, this.delay[s]);
			this.delay[s] -= free;
			dt -= free;
		}
		const old = this.times[s];
		if (this.untimed) {
			this.times[s] += dt;
			return;
		}
		if (p.method === "UPCNT") {
			this.times[s] = this.family === "zmf" ? Math.max(-6e5, old - dt) : old + dt;
			return;
		}
		if (p.method === "HOURGLASS") {
			dt = Math.min(dt, Math.max(0, old));
			this.times[other(s)] += dt;
		}
		this.times[s] -= dt;
		if (this.config.sound && old > 0) {
			const before = Math.ceil(old / 1e3), after = Math.ceil(Math.max(0, this.times[s]) / 1e3);
			if (before !== after && (after === 10 || after <= 5)) this.beep++;
		}
		if (this.times[s] > 0) return;
		const next = this.config.periods[this.stages[s] + 1];
		if (next && p.moves === 0) {
			const targets = this.family === "zmf" || [
				"BYO",
				"CAN-BYO",
				"UPCNT"
			].includes(next.method) ? [s] : [0, 1];
			for (const i of targets) {
				const prev = this.current(i);
				this.stages[i]++;
				this.stageMoves[i] = 0;
				this.times[i] += this.initial(next, i) - (prev.method === "DELAY" || prev.method === "FISCH" && this.config.increment === "PRE" ? prev.extra[i] : 0);
				this.delay[i] = next.extra[i];
			}
			this.periodFlag = s;
			this.periodFlagUntil = this.now + 3e5;
			if (this.current().method === "UPCNT") {
				this.times[s] = this.family === "zmf" ? Math.max(-6e5, this.times[s]) : Math.abs(this.times[s]);
				return;
			}
			if (this.times[s] <= 0) this.elapse(0);
			return;
		}
		this.times[s] = 0;
		if (p.method === "BYO" || p.method === "CAN-BYO") {
			this.periodFlag = s;
			this.periodFlagUntil = Infinity;
			return;
		}
		if (this.flag === null) this.flag = s;
		if (this.config.freeze || p.method === "HOURGLASS") this.phase = "paused";
	}
	down(key, now) {
		this.advance(now);
		if (this.held) return;
		const editing = this.phase === "setup" || this.phase === "correction" || this.phase === "option";
		const repeat = editing && (this.family === "dgt" ? [
			"back",
			"minus",
			"plus",
			"forward"
		].includes(key) : ["left", "right"].includes(key));
		this.held = {
			key,
			at: now,
			repeats: 0,
			fired: false,
			repeat,
			threshold: this.family === "dgt" ? 3e3 : 5e3
		};
		if (this.family === "dgt" && key === "plus" && !editing && this.phase !== "off") this.showMoves = true;
		if (repeat) {
			this.short(key);
			this.held.fired = true;
		} else if (key === "left" || key === "right") {
			this.short(key);
			this.held.fired = true;
		}
	}
	up(key, now, cancel = false) {
		this.advance(now);
		const h = this.held;
		if (!h || h.key !== key) return;
		this.held = null;
		this.showMoves = false;
		if (!cancel && !h.fired) this.short(key);
	}
	tap(key, now = this.now) {
		this.down(key, now);
		this.up(key, now);
	}
	cancel(now = this.now) {
		if (this.held) this.up(this.held.key, now, true);
	}
	long(key) {
		if (this.phase === "off" || this.phase === "computer") return;
		if (this.family === "dgt") {
			if (key === "menu" && this.phase === "paused") this.beginCorrection();
			if (key === "minus" && [
				"ready",
				"paused",
				"running"
			].includes(this.phase)) {
				this.config.sound = !this.config.sound;
				this.revision++;
			}
			if (key === "forward" && !this.started && this.phase === "ready") {
				this.config.freeze = !this.config.freeze;
				this.revision++;
			}
			if (key === "back" && ["running", "paused"].includes(this.phase) && this.current().method === "CAN-BYO") {
				this.times[this.lever] = this.current().time[this.lever];
				this.periodFlag = null;
			}
		} else if (key === "menu") {
			if (this.phase === "paused") this.beginCorrection();
			else if (this.phase === "ready") {
				this.draft = copy(this.config);
				this.phase = "setup";
				this.zmfMenu = this.config.tournament || this.current().method === "HOURGLASS" ? -0 : -1;
				this.zmfEditing = false;
				this.field = this.digit = 0;
			}
		}
	}
	short(key) {
		if (key === "power") {
			if (this.phase !== "off") {
				this.phase = "off";
				this.powerAt = this.now;
			} else {
				this.reset();
				if (this.family === "dgt") this.phase = this.now - this.powerAt < 800 ? "ready" : "option";
			}
			return;
		}
		if (this.phase === "off" || this.phase === "computer") return;
		if (this.phase === "setup" || this.phase === "correction") {
			this.edit(key);
			return;
		}
		if (this.phase === "option") {
			if (key === "plus" || key === "minus") {
				this.option = (this.option + (key === "plus" ? 1 : 29) - 1) % 30 + 1;
				this.revision++;
			}
			if (key === "forward" || key === "menu") {
				if (this.option === 25) {
					this.phase = "computer";
					return;
				}
				if (this.option >= 26) {
					this.draft = copy(this.manual[this.option] || {
						...base(),
						periods: [period(0, "END")]
					});
					this.phase = "setup";
					this.field = this.digit = 0;
					return;
				}
				this.untimed = false;
				this.config = dgtPreset(this.option);
				this.reset();
			}
			return;
		}
		if (key === "left" || key === "right") {
			this.player(key === "left" ? 0 : 1);
			return;
		}
		if (key !== "menu") return;
		if (this.family === "zmf") {
			if (this.now - this.lastMenuTap < 400) {
				this.reset();
				this.lastMenuTap = -Infinity;
				return;
			}
			this.lastMenuTap = this.now;
			if (this.phase === "running") {
				this.phase = "paused";
				this.pausedLever = this.lever;
			}
			return;
		}
		if (this.phase === "running") {
			this.phase = "paused";
			this.pausedLever = this.lever;
		} else if (this.phase === "paused" && this.lever !== this.pausedLever) this.beginCorrection();
		else if (!(this.flag !== null && this.config.freeze)) {
			this.phase = "running";
			this.started = true;
			this.first = this.moves[0] + this.moves[1] === 0 ? this.lever : this.first;
		}
	}
	player(pressed) {
		if (this.flag !== null && this.config.freeze) return;
		if (this.phase === "ready") {
			this.lever = other(pressed);
			this.first = this.lever;
			this.pausedLever = this.lever;
			if (this.family === "zmf") {
				this.phase = "running";
				this.started = true;
			}
			return;
		}
		if (this.phase === "paused") {
			this.lever = other(pressed);
			if (this.family === "zmf") this.phase = "running";
			return;
		}
		if (this.phase !== "running" || this.lever !== pressed) return;
		const p = this.current(pressed);
		this.moves[pressed]++;
		this.stageMoves[pressed]++;
		if (p.method === "FISCH") this.times[pressed] += p.extra[pressed];
		if (p.method === "DELAY") this.times[pressed] = Math.min(this.turnStart[pressed], this.times[pressed] + p.extra[pressed]);
		if (p.method === "BYO") {
			const unit = p.time[pressed];
			this.times[pressed] = Math.max(unit, Math.ceil(this.times[pressed] / Math.max(1, unit)) * unit);
		}
		if (p.moves > 0 && this.stageMoves[pressed] >= p.moves && this.config.periods[this.stages[pressed] + 1]) {
			this.stages[pressed]++;
			this.stageMoves[pressed] = 0;
			const next = this.current(pressed);
			this.times[pressed] += this.initial(next, pressed) - (p.method === "FISCH" && this.config.increment === "PRE" ? p.extra[pressed] : 0);
		}
		this.lever = other(pressed);
		this.delay[this.lever] = this.current().extra[this.lever];
		this.turnStart[this.lever] = this.times[this.lever];
		if (this.family === "zmf" && this.config.tournament) this.movesUntil = this.now + 500;
		if (this.family === "zmf" && this.config.sound) this.beep++;
		if (this.current().method === "BYO" || this.current().method === "CAN-BYO") this.periodFlag = null;
	}
	beginCorrection() {
		this.phase = "correction";
		this.correctionTimes = [...this.times];
		this.correctionMoves = [...this.moves];
		this.correctionStages = [...this.stages];
		this.field = this.digit = 0;
	}
	correctionFields() {
		const result = this.correctionTimes.map((n, i) => ({
			id: `time${i}`,
			label: `${i ? "Right" : "Left"} time`,
			value: Math.max(0, n),
			max: 35999e3,
			kind: "time",
			width: 5,
			side: i
		}));
		if (this.family === "dgt" || this.config.tournament) this.correctionMoves.forEach((n, i) => result.push({
			id: `move${i}`,
			label: `${i ? "Right" : "Left"} moves`,
			value: n,
			max: 999,
			width: 3,
			side: i
		}));
		if (this.family === "dgt" && this.config.periods.length > 1) {
			result.push({
				id: "stage0",
				label: "Period",
				value: this.correctionStages[0] + 1,
				max: this.config.periods.length,
				min: 1
			});
			if (this.config.periods.some((p) => [
				"BYO",
				"CAN-BYO",
				"UPCNT"
			].includes(p.method))) result.push({
				id: "stage1",
				label: "Right period",
				value: this.correctionStages[1] + 1,
				max: this.config.periods.length,
				min: 1
			});
		}
		return result;
	}
	dgtFields() {
		const result = [];
		for (let i = 0; i < 4; i++) {
			const p = this.draft.periods[i] || period(0, "END");
			const methods = [
				"END",
				"TIME",
				"FISCH",
				"DELAY",
				"US-DLY",
				"BYO",
				"CAN-BYO",
				"UPCNT"
			];
			result.push({
				id: `p${i}.method`,
				label: `Period ${i + 1} method`,
				value: methods.indexOf(p.method),
				max: 7,
				choices: methods
			});
			if (p.method === "END") break;
			if (p.method !== "UPCNT") for (let j = 0; j < 2; j++) result.push({
				id: `p${i}.time${j}`,
				label: `Period ${i + 1} ${j ? "right" : "left"} time`,
				value: p.time[j],
				max: p.method === "CAN-BYO" ? 599e3 : 35999e3,
				kind: "time",
				width: 5,
				side: j
			});
			if ([
				"FISCH",
				"DELAY",
				"US-DLY"
			].includes(p.method)) for (let j = 0; j < 2; j++) result.push({
				id: `p${i}.extra${j}`,
				label: `${j ? "Right" : "Left"} ${p.method === "FISCH" ? "bonus" : "delay"}`,
				value: p.extra[j] / 1e3,
				max: 599,
				width: 3,
				side: j
			});
			if (p.method === "FISCH") result.push({
				id: `p${i}.moves`,
				label: `Period ${i + 1} moves (000 = time)`,
				value: p.moves,
				max: 999,
				width: 3
			});
			if (p.method === "BYO") for (let j = 0; j < 2; j++) result.push({
				id: `p${i}.moments${j}`,
				label: `${j ? "Right" : "Left"} byo periods`,
				value: p.moments[j],
				max: 99,
				width: 2,
				side: j
			});
			if ([
				"BYO",
				"CAN-BYO",
				"UPCNT"
			].includes(p.method)) break;
		}
		result.push({
			id: "freeze",
			label: "Freeze",
			value: +this.draft.freeze,
			max: 1,
			choices: ["OFF", "ON"]
		}, {
			id: "sound",
			label: "Sound",
			value: +this.draft.sound,
			max: 1,
			choices: ["OFF", "ON"]
		});
		return result;
	}
	menuNames() {
		return [
			"HH:MM HH:MM",
			"MM:SS MM:SS",
			`DEL ${this.draft.delayDisplay} ${String(this.draft.periods[0].extra[0] / 1e3).padStart(2, "0")}`,
			`INC - ${this.draft.periods[0].extra[0] / 1e3}`,
			"P-00 000",
			"HOGL 000",
			`INC ${this.draft.increment}-`,
			"SCRA OFF",
			`FIDE ${this.draft.freeze ? "ON" : "OFF"}`,
			`LED ${this.draft.leds ? "ON" : "OFF"}`,
			`SOUN ${this.draft.sound ? "ON" : "OFF"}`,
			"PLAY ----"
		];
	}
	zmfFields() {
		const p = this.draft.periods[0], s = this.zmfSection;
		if (s === "quick" || s === "hm" || s === "ms") return p.time.map((n, i) => ({
			id: `p0.time${i}`,
			label: `${i ? "Right" : "Left"} time`,
			value: n,
			max: s === "hm" ? 35994e4 : 5999e3,
			kind: s === "hm" ? "hm" : "ms",
			width: 4,
			side: i
		}));
		if (s === "delay") return [{
			id: "delayDisplay",
			label: "Delay display",
			value: [
				"F",
				"C",
				"t"
			].indexOf(this.draft.delayDisplay),
			max: 2,
			choices: [
				"F",
				"C",
				"t"
			]
		}, {
			id: "delay",
			label: "Delay seconds",
			value: p.extra[0] / 1e3,
			max: 60,
			width: 2
		}];
		if (s === "increment") return [{
			id: "bonus",
			label: "Increment seconds",
			value: p.extra[0] / 1e3,
			max: 60,
			width: 2
		}];
		if (s === "hourglass") return [{
			id: "hourglass",
			label: "Hourglass seconds",
			value: p.method === "HOURGLASS" ? p.time[0] / 1e3 : 30,
			min: 5,
			max: 180,
			width: 3
		}];
		if (s === "incMode") return [{
			id: "increment",
			label: "Increment timing",
			value: this.draft.increment === "PRE" ? 0 : 1,
			max: 1,
			choices: ["PRE", "POST"]
		}];
		if (s === "scrabble") return [{
			id: "scrabble",
			label: "Scrabble minutes",
			value: this.draft.periods[1]?.method === "UPCNT" ? p.time[0] / 6e4 : 0,
			max: 40,
			width: 2
		}];
		if (s === "tournament") {
			const count = this.tournamentCount;
			const fields = [{
				id: "tournamentCount",
				label: "Moves / 2t / 3t",
				value: count,
				max: 101,
				choices: [
					...Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")),
					"2t",
					"3t"
				]
			}, {
				id: "tournamentTime0",
				label: "Period 1 minutes",
				value: p.time[0] / 6e4,
				max: 999,
				width: 3
			}];
			const second = this.draft.periods[1] || period(30);
			if (count < 100) fields.push({
				id: "tournamentMoves1",
				label: "Period 2 moves (00 = ALL)",
				value: second.moves,
				max: 99,
				width: 2
			});
			fields.push({
				id: "tournamentTime1",
				label: "Period 2 minutes",
				value: second.time[0] / 6e4,
				max: 999,
				width: 3
			});
			if (count === 101 || count < 100 && second.moves > 0) fields.push({
				id: "tournamentTime2",
				label: "Period 3 minutes",
				value: (this.draft.periods[2] || period(30)).time[0] / 6e4,
				max: 999,
				width: 3
			});
			return fields;
		}
		return [];
	}
	fields() {
		return this.phase === "correction" ? this.correctionFields() : this.family === "dgt" ? this.dgtFields() : this.zmfFields();
	}
	writeField(f, value) {
		if (this.phase === "correction") {
			const i = Number(f.id.slice(-1));
			if (f.id.startsWith("time")) this.correctionTimes[i] = value;
			if (f.id.startsWith("move")) {
				this.correctionMoves[i] = value;
				if (i === 0) {
					const diff = this.lever === this.first ? 0 : this.first === 0 ? 1 : -1;
					this.correctionMoves[1] = Math.max(0, value - diff);
				} else if (this.correctionMoves[0] !== this.correctionMoves[1]) this.first = this.correctionMoves[0] > this.correctionMoves[1] ? 0 : 1;
			}
			if (f.id.startsWith("stage")) {
				this.correctionStages[i] = value - 1;
				if (i === 0) this.correctionStages[1] = value - 1;
			}
			return;
		}
		const match = /^p(\d)\.(method|time|extra|moves|moments)([01])?$/.exec(f.id);
		if (match) {
			const i = +match[1], p = this.draft.periods[i] ??= period(0, "END"), which = match[2], side = +(match[3] || 0);
			if (which === "method") p.method = f.choices[value];
			if (which === "moves") p.moves = value;
			if (which === "time") p.time[side] = value;
			if (which === "extra") p.extra[side] = value * 1e3;
			if (which === "moments") p.moments[side] = value;
			return;
		}
		const p = this.draft.periods[0];
		switch (f.id) {
			case "freeze":
				this.draft.freeze = !!value;
				break;
			case "sound":
				this.draft.sound = !!value;
				break;
			case "delayDisplay":
				this.draft.delayDisplay = [
					"F",
					"C",
					"t"
				][value];
				break;
			case "delay":
			case "bonus":
				this.draft.periods.forEach((p) => {
					p.method = f.id === "delay" ? "US-DLY" : "FISCH";
					p.extra = pair(value * 1e3);
				});
				break;
			case "increment":
				this.draft.increment = value ? "POST" : "PRE";
				break;
			case "hourglass":
				this.draft.periods = [period(value / 60, "HOURGLASS")];
				this.draft.tournament = false;
				break;
			case "scrabble":
				this.draft.periods = value ? [period(value), period(0, "UPCNT")] : [period(5)];
				this.draft.tournament = false;
				this.draft.freeze = false;
				break;
			case "tournamentCount":
				this.tournamentCount = value;
				this.draft.counter = value < 100;
				this.draft.tournament = true;
				p.moves = value < 100 ? value : 0;
				break;
			case "tournamentMoves1":
				(this.draft.periods[1] ??= period(30, p.method)).moves = value;
				break;
			default: if (f.id.startsWith("tournamentTime")) {
				const i = +f.id.slice(-1);
				const stage = this.draft.periods[i] ??= period(30, p.method, p.extra[0] / 1e3);
				stage.time = pair(value * 6e4);
			}
		}
	}
	adjust(dir) {
		const f = this.fields()[this.field];
		if (!f) return;
		let value = f.value;
		if (this.family === "dgt" && !f.choices && f.width) if (f.kind === "time") {
			const digits = timeDigits(value, "time").split("").map(Number), index = this.digit;
			const max = index === 1 || index === 3 ? 5 : 9;
			digits[index] = (digits[index] + dir + max + 1) % (max + 1);
			value = digitsTime(digits.join(""), "time");
		} else {
			const n = 10 ** (f.width - 1 - this.digit), digit = Math.floor(value / n) % 10;
			value += ((digit + dir + 10) % 10 - digit) * n;
		}
		else if (f.kind) {
			const units = f.kind === "hm" ? 6e4 : 1e3;
			value += dir * units;
		} else value += dir;
		const min = f.min || 0;
		if (value > f.max) value = min;
		if (value < min) value = f.max;
		this.writeField(f, value);
	}
	edit(key) {
		if (this.family === "zmf" && this.phase === "setup" && !this.zmfEditing) {
			if (key === "left" || key === "right") {
				this.zmfMenu = (this.zmfMenu + (key === "right" ? 1 : 11) + 12) % 12;
				return;
			}
			if (key !== "menu") return;
			if (this.zmfMenu >= 8 && this.zmfMenu <= 10) {
				const k = [
					"freeze",
					"leds",
					"sound"
				][this.zmfMenu - 8];
				this.draft[k] = !this.draft[k];
				return;
			}
			if (this.zmfMenu === 11) {
				this.finish();
				return;
			}
			this.zmfSection = this.zmfMenu === -1 ? "quick" : [
				"hm",
				"ms",
				"delay",
				"increment",
				"tournament",
				"hourglass",
				"incMode",
				"scrabble"
			][this.zmfMenu];
			if (["hm", "ms"].includes(this.zmfSection) && ![
				"TIME",
				"FISCH",
				"US-DLY"
			].includes(this.draft.periods[0].method)) this.draft.periods = [period(5)];
			this.zmfEditing = true;
			this.field = this.digit = 0;
			return;
		}
		if (this.family === "dgt" && key === "minus" || this.family === "zmf" && key === "left") {
			this.adjust(-1);
			return;
		}
		if (this.family === "dgt" && key === "plus" || this.family === "zmf" && key === "right") {
			this.adjust(1);
			return;
		}
		if (this.family === "dgt" && key === "menu") {
			this.finish();
			return;
		}
		if (key === "back" && this.family === "dgt") {
			if (this.digit > 0) this.digit--;
			else if (this.field > 0) {
				this.field--;
				this.digit = (this.fields()[this.field].width || 1) - 1;
			}
			return;
		}
		if (key === (this.family === "dgt" ? "forward" : "menu")) {
			const f = this.fields()[this.field];
			if (f && this.family === "zmf") this.writeField(f, f.value);
			if (this.family === "dgt" && f && !f.choices && this.digit < (f.width || 1) - 1) {
				this.digit++;
				return;
			}
			this.digit = 0;
			this.field++;
			if (this.field >= this.fields().length) if (this.family === "zmf" && this.phase === "setup") {
				this.zmfEditing = false;
				this.zmfMenu = this.zmfMenu === -1 ? 11 : this.zmfMenu;
				this.field = 0;
			} else this.finish();
		}
	}
	finish() {
		if (this.phase === "correction") {
			this.times = [...this.correctionTimes];
			this.moves = [...this.correctionMoves];
			this.stages = [...this.correctionStages];
			this.stageMoves = this.moves.map((moves, side) => Math.max(0, moves - this.config.periods.slice(0, this.stages[side]).reduce((n, p) => n + p.moves, 0)));
			this.turnStart = [...this.times];
			this.pausedLever = this.lever;
			if (this.flag !== null && this.times[this.flag] > 0) this.flag = null;
			this.phase = "paused";
			return;
		}
		const c = copy(this.draft);
		const end = c.periods.findIndex((p) => p.method === "END");
		if (end >= 0) c.periods = c.periods.slice(0, end);
		const terminal = c.periods.findIndex((p) => [
			"BYO",
			"CAN-BYO",
			"UPCNT",
			"HOURGLASS"
		].includes(p.method));
		if (terminal >= 0) c.periods = c.periods.slice(0, terminal + 1);
		if (this.family === "zmf" && this.zmfSection === "tournament") c.periods = c.periods.slice(0, this.tournamentCount === 101 || this.tournamentCount < 100 && c.periods[1]?.moves > 0 ? 3 : 2);
		if (!validConfig(c) || c.periods[0].time.some((t) => t <= 0) && c.periods[0].method !== "UPCNT") {
			this.notice = "Set a non-zero starting time for both players.";
			return;
		}
		this.untimed = this.untimed && JSON.stringify(c.periods) === JSON.stringify(this.config.periods);
		this.config = c;
		if (this.family === "dgt") this.manual[this.option] = copy(c);
		this.reset();
		this.revision++;
	}
	snapshot() {
		const running = this.phase === "running";
		const display = {
			title: this.gameBound ? "Game clock" : this.family === "dgt" ? `Option ${String(this.option).padStart(2, "0")}` : "TapNSet Pro",
			left: formatHardwareTime(this.times[0]),
			right: formatHardwareTime(this.times[1]),
			footer: "",
			editing: false,
			off: this.phase === "off",
			lever: this.lever,
			leds: this.config.leds
		};
		if (this.showMoves || this.now < this.movesUntil) {
			display.left = String(this.config.counter ? this.moves[0] : this.stages[0] + 1).padStart(3, "0");
			display.right = String(this.config.counter ? this.moves[1] : this.stages[1] + 1).padStart(3, "0");
			display.title = this.config.counter ? "Moves" : "Period";
		}
		if (this.phase === "option") {
			const preview = this.option < 25 ? dgtPreset(this.option) : this.manual[this.option];
			display.title = `Select option ${String(this.option).padStart(2, "0")}`;
			display.editing = true;
			display.left = preview ? formatHardwareTime(this.initial(preview.periods[0], 0)) : "—";
			display.right = this.option === 25 ? "PC" : this.option >= 26 ? "SET" : preview ? formatHardwareTime(this.initial(preview.periods[0], 1)) : "—";
		}
		if (this.phase === "setup" || this.phase === "correction") {
			display.editing = true;
			if (this.family === "zmf" && this.phase === "setup" && !this.zmfEditing) {
				display.title = "Setup";
				display.left = this.zmfMenu < 0 ? "Quick time" : this.menuNames()[this.zmfMenu];
				display.right = "";
			} else {
				const f = this.fields()[this.field];
				if (f) {
					display.title = `${this.phase === "correction" ? "Correct · " : ""}${f.label}`;
					display.left = f.choices ? f.choices[f.value] : f.kind ? formatFieldTime(f.value, f.kind) : String(f.value).padStart(f.width || 1, "0");
					display.right = "";
					if (this.family === "dgt" && !f.choices) display.cursor = {
						side: f.side || 0,
						index: this.digit
					};
					if (f.side !== void 0) {
						let values;
						if (this.phase === "correction") values = f.id.startsWith("time") ? this.correctionTimes : f.id.startsWith("move") ? this.correctionMoves : void 0;
						else {
							const m = /^p(\d)\.(time|extra|moments)/.exec(f.id);
							if (m) {
								const p = this.draft.periods[+m[1]];
								values = m[2] === "time" ? p.time : m[2] === "extra" ? [p.extra[0] / 1e3, p.extra[1] / 1e3] : p.moments;
							}
						}
						if (values) {
							const format = (n) => f.kind ? formatFieldTime(n, f.kind) : String(n).padStart(f.width || 1, "0");
							display.left = format(values[0]);
							display.right = format(values[1]);
						}
					}
				}
			}
		}
		if (this.phase === "computer") {
			display.title = "Option 25";
			display.left = "PC";
			display.right = "—";
			display.footer = "Waiting for e-Board";
		} else if (this.phase === "off") display.left = display.right = display.title = "";
		else {
			const p = this.current();
			display.footer = [
				this.config.freeze ? "FREEZE" : "",
				this.config.sound ? "♪" : "",
				`P${this.stages[0] + 1}/${this.stages[1] + 1}`,
				this.phase === "running" ? "▶" : this.started ? "Ⅱ" : "Ready",
				this.flag !== null ? `${this.flag ? "R" : "L"} ⚑` : this.periodFlag !== null && this.now < this.periodFlagUntil ? `${this.periodFlag ? "R" : "L"} ▵` : ""
			].filter(Boolean).join("  ");
			if (p.method === "US-DLY" && this.delay[this.lever] > 0 && running) {
				const seconds = Math.ceil(this.delay[this.lever] / 1e3);
				display.footer += `  DLY ${seconds}`;
				if (this.family === "zmf" && (this.config.delayDisplay === "C" || this.config.delayDisplay === "F" && Math.floor(this.now / 500) % 2 === 0)) if (this.lever === 0) display.left = String(seconds);
				else display.right = String(seconds);
			}
		}
		return {
			display,
			clock: {
				available: true,
				active: ![
					"off",
					"computer",
					"setup",
					"option"
				].includes(this.phase),
				paused: !running,
				mode: this.current().method === "UPCNT" ? "up" : "down",
				whiteMs: Math.abs(this.times[1]),
				blackMs: Math.abs(this.times[0]),
				running: running ? this.lever ? "w" : "b" : null,
				label: this.notice || display.title,
				canSetTimeControl: false
			}
		};
	}
};
function timeDigits(ms, kind) {
	const seconds = Math.floor(ms / 1e3);
	return kind === "time" ? `${Math.floor(seconds / 3600)}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}${String(seconds % 60).padStart(2, "0")}` : kind === "hm" ? `${String(Math.floor(seconds / 3600)).padStart(2, "0")}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}` : `${String(Math.floor(seconds / 60)).padStart(2, "0")}${String(seconds % 60).padStart(2, "0")}`;
}
function digitsTime(s, kind) {
	return kind === "time" ? (+s[0] * 3600 + +s.slice(1, 3) * 60 + +s.slice(3)) * 1e3 : kind === "hm" ? (+s.slice(0, 2) * 3600 + +s.slice(2) * 60) * 1e3 : (+s.slice(0, 2) * 60 + +s.slice(2)) * 1e3;
}
function formatFieldTime(ms, kind) {
	const s = timeDigits(ms, kind);
	return kind === "time" ? `${s[0]}:${s.slice(1, 3)}:${s.slice(3)}` : `${s.slice(0, 2)}:${s.slice(2)}`;
}
function validConfig(value) {
	const c = value;
	return !!c && Array.isArray(c.periods) && c.periods.length > 0 && c.periods.length <= 4 && ["PRE", "POST"].includes(c.increment) && [
		"F",
		"C",
		"t"
	].includes(c.delayDisplay) && [
		"freeze",
		"sound",
		"leds",
		"counter",
		"tournament"
	].every((k) => typeof c[k] === "boolean") && c.periods.every((p) => p && [
		"TIME",
		"FISCH",
		"DELAY",
		"US-DLY",
		"BYO",
		"CAN-BYO",
		"UPCNT",
		"HOURGLASS"
	].includes(p.method) && [
		p.time,
		p.extra,
		p.moments
	].every((a) => Array.isArray(a) && a.length === 2 && a.every((n) => Number.isFinite(n) && n >= 0 && n <= 35994e4)) && Number.isInteger(p.moves) && p.moves >= 0 && p.moves <= 999);
}
function readHardwareDisplay(value) {
	const d = value;
	if (!d || ![
		"title",
		"left",
		"right",
		"footer"
	].every((k) => typeof d[k] === "string") || ![0, 1].includes(d.lever)) return null;
	return {
		title: d.title.slice(0, 80),
		left: d.left.slice(0, 80),
		right: d.right.slice(0, 80),
		footer: d.footer.slice(0, 100),
		editing: d.editing === true,
		off: d.off === true,
		lever: d.lever,
		leds: d.leds === true,
		cursor: d.cursor && [0, 1].includes(d.cursor.side) && Number.isInteger(d.cursor.index) && d.cursor.index >= 0 && d.cursor.index < 10 ? d.cursor : void 0
	};
}
//#endregion
export { ClockHardware, dgtPreset, formatHardwareTime, readHardwareDisplay, validConfig };
