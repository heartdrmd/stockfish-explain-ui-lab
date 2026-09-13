//#region lib/clock-styles.ts
var CLOCK_STYLES = [
	{
		id: "dgt-3000-3d",
		label: "DGT 3000 · Atelier 3D"
	},
	{
		id: "zmf-pro-3d",
		label: "ZMF TapNSet Pro · Atelier 3D"
	},
	{
		id: "dgt-3000-3d-blue",
		label: "DGT 3000 · 3D blue active side"
	},
	{
		id: "zmf-pro-3d-blue",
		label: "ZMF TapNSet Pro · 3D blue active side"
	},
	{
		id: "dgt",
		label: "DGT · red LCD"
	},
	{
		id: "dgt-contrast",
		label: "DGT · high contrast"
	},
	{
		id: "dgt-classic",
		label: "DGT · classic casing"
	},
	{
		id: "dgt-3000",
		label: "DGT 3000 · high contrast"
	},
	{
		id: "zmf",
		label: "ZMF · blue LED"
	},
	{
		id: "zmf-classic",
		label: "ZMF · classic LCD"
	},
	{
		id: "zmf-pro",
		label: "ZMF TapNSet Pro · metal"
	},
	{
		id: "wood",
		label: "Wood · classic dials"
	},
	{
		id: "minimal",
		label: "Simple digital"
	}
];
function isClockStyle(value) {
	return CLOCK_STYLES.some((style) => style.id === value);
}
function is3DClockStyle(style) {
	return style === "dgt-3000-3d" || style === "zmf-pro-3d" || isBlueActiveClockStyle(style);
}
function isBlueActiveClockStyle(style) {
	return style === "dgt-3000-3d-blue" || style === "zmf-pro-3d-blue";
}
//#endregion
export { CLOCK_STYLES, is3DClockStyle, isBlueActiveClockStyle, isClockStyle };
