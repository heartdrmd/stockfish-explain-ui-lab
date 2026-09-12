//#region lib/clock-styles.ts
var CLOCK_STYLES = [
	{
		id: "dgt-3000-3d",
		label: "DGT 3000 · 3D"
	},
	{
		id: "zmf-pro-3d",
		label: "ZMF TapNSet Pro · 3D"
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
//#endregion
export { CLOCK_STYLES, isClockStyle };
