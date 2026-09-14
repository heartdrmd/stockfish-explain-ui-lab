//#region lib/notation-input.ts
function isHistoryInputTarget(target) {
	return !!target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=\"false\"]),[role=\"dialog\"],dialog,[role=\"slider\"],[role=\"spinbutton\"],[role=\"separator\"],[role=\"combobox\"],[role=\"listbox\"],[role=\"menu\"],[role=\"tablist\"],[role=\"radiogroup\"],.game-clock,.clock-view-panel,#practice-clock,#clock-top-controls,.clock-float-drag,[data-history-input=\"ignore\"]");
}
function installNotationInput(target, navigate, { enabled = () => true, keyboard = true, selector = "[data-move-notation]", wheelCapture = false } = {}) {
	let lastMove = -Infinity, lastEvent = -Infinity, accumulated = 0, direction = 0;
	const available = (event) => enabled() && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !isHistoryInputTarget(event.target);
	const keydown = (event) => {
		if (!available(event) || event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		event.stopImmediatePropagation();
		navigate(event.key === "ArrowLeft" ? -1 : 1);
	};
	const wheel = (event) => {
		if (!available(event) || event.buttons || !event.target?.closest?.(selector) || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		event.preventDefault();
		event.stopPropagation();
		const now = event.timeStamp, next = Math.sign(event.deltaY);
		if (next !== direction || now - lastEvent > 180) {
			accumulated = 0;
			lastMove = -Infinity;
		}
		direction = next;
		lastEvent = now;
		if (now - lastMove < 120) return;
		accumulated += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1);
		if (Math.abs(accumulated) < 8) return;
		accumulated = 0;
		lastMove = now;
		navigate(next);
	};
	if (keyboard) target.addEventListener("keydown", keydown, { capture: true });
	target.addEventListener("wheel", wheel, {
		passive: false,
		capture: wheelCapture
	});
	return () => {
		target.removeEventListener("keydown", keydown, { capture: true });
		target.removeEventListener("wheel", wheel, { capture: wheelCapture });
	};
}
//#endregion
export { installNotationInput, isHistoryInputTarget };
