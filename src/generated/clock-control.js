//#region lib/clock-control.ts
function usesClockBudget(clock) {
	return clock.active && clock.displayOnly !== true;
}
function startUntimedDisplay(clock, turn, now) {
	if (clock.active) throw new Error("The existing game clock is already running.");
	if (!["w", "b"].includes(turn) || !Number.isFinite(now)) throw new Error("The board is not ready for a clock.");
	Object.assign(clock, {
		active: true,
		mode: "up",
		displayOnly: true,
		paused: false,
		initialMs: 0,
		msWhite: 0,
		msBlack: 0,
		incMs: 0,
		tickingFor: turn,
		lastTickAt: now
	});
}
var CLOCK_CONTROL_PRESETS = [
	[1, 0],
	[3, 0],
	[3, 2],
	[5, 0],
	[5, 3],
	[10, 0],
	[10, 5],
	[15, 10],
	[30, 0],
	[60, 0]
];
function readClockControl(value) {
	const c = value;
	if (!c || !Number.isInteger(c.minutes) || c.minutes < 1 || c.minutes > 999 || !Number.isInteger(c.incrementSeconds) || c.incrementSeconds < 0 || c.incrementSeconds > 60) return null;
	return {
		minutes: c.minutes,
		incrementSeconds: c.incrementSeconds
	};
}
function resetClockControl(clock, value, turn, now) {
	const control = readClockControl(value);
	if (!control) throw new Error("Use 1–999 whole minutes and 0–60 seconds increment.");
	if (!clock.active || !["up", "down"].includes(clock.mode) || !["w", "b"].includes(turn)) throw new Error("Add a clock before setting its time.");
	if (!Number.isFinite(now)) throw new Error("The clock could not be updated.");
	const initialMs = control.minutes * 6e4;
	Object.assign(clock, {
		mode: "down",
		displayOnly: false,
		initialMs,
		msWhite: initialMs,
		msBlack: initialMs,
		incMs: control.incrementSeconds * 1e3,
		tickingFor: turn,
		lastTickAt: now
	});
	return control;
}
//#endregion
export { CLOCK_CONTROL_PRESETS, readClockControl, resetClockControl, startUntimedDisplay, usesClockBudget };
