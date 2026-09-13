//#region node_modules/chess.js/dist/esm/chess.js
function rootNode(comment) {
	return comment !== null ? {
		comment,
		variations: []
	} : { variations: [] };
}
function node(move, suffix, nag, comment, variations) {
	const node = {
		move,
		variations
	};
	if (suffix) node.suffix = suffix;
	if (nag) node.nag = nag;
	if (comment !== null) node.comment = comment;
	return node;
}
function lineToTree(...nodes) {
	const [root, ...rest] = nodes;
	let parent = root;
	for (const child of rest) if (child !== null) {
		parent.variations = [child, ...child.variations];
		child.variations = [];
		parent = child;
	}
	return root;
}
function pgn(headers, game) {
	if (game.marker && game.marker.comment) {
		let node = game.root;
		while (true) {
			const next = node.variations[0];
			if (!next) {
				node.comment = game.marker.comment;
				break;
			}
			node = next;
		}
	}
	return {
		headers,
		root: game.root,
		result: (game.marker && game.marker.result) ?? void 0
	};
}
function peg$subclass(child, parent) {
	function C() {
		this.constructor = child;
	}
	C.prototype = parent.prototype;
	child.prototype = new C();
}
function peg$SyntaxError(message, expected, found, location) {
	var self = Error.call(this, message);
	// istanbul ignore next Check is a necessary evil to support older environments
	if (Object.setPrototypeOf) Object.setPrototypeOf(self, peg$SyntaxError.prototype);
	self.expected = expected;
	self.found = found;
	self.location = location;
	self.name = "SyntaxError";
	return self;
}
peg$subclass(peg$SyntaxError, Error);
function peg$padEnd(str, targetLength, padString) {
	padString = padString || " ";
	if (str.length > targetLength) return str;
	targetLength -= str.length;
	padString += padString.repeat(targetLength);
	return str + padString.slice(0, targetLength);
}
peg$SyntaxError.prototype.format = function(sources) {
	var str = "Error: " + this.message;
	if (this.location) {
		var src = null;
		var k;
		for (k = 0; k < sources.length; k++) if (sources[k].source === this.location.source) {
			src = sources[k].text.split(/\r\n|\n|\r/g);
			break;
		}
		var s = this.location.start;
		var offset_s = this.location.source && typeof this.location.source.offset === "function" ? this.location.source.offset(s) : s;
		var loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
		if (src) {
			var e = this.location.end;
			var filler = peg$padEnd("", offset_s.line.toString().length, " ");
			var line = src[s.line - 1];
			var hatLen = (s.line === e.line ? e.column : line.length + 1) - s.column || 1;
			str += "\n --> " + loc + "\n" + filler + " |\n" + offset_s.line + " | " + line + "\n" + filler + " | " + peg$padEnd("", s.column - 1, " ") + peg$padEnd("", hatLen, "^");
		} else str += "\n at " + loc;
	}
	return str;
};
peg$SyntaxError.buildMessage = function(expected, found) {
	var DESCRIBE_EXPECTATION_FNS = {
		literal: function(expectation) {
			return "\"" + literalEscape(expectation.text) + "\"";
		},
		class: function(expectation) {
			var escapedParts = expectation.parts.map(function(part) {
				return Array.isArray(part) ? classEscape(part[0]) + "-" + classEscape(part[1]) : classEscape(part);
			});
			return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]";
		},
		any: function() {
			return "any character";
		},
		end: function() {
			return "end of input";
		},
		other: function(expectation) {
			return expectation.description;
		}
	};
	function hex(ch) {
		return ch.charCodeAt(0).toString(16).toUpperCase();
	}
	function literalEscape(s) {
		return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
			return "\\x0" + hex(ch);
		}).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
			return "\\x" + hex(ch);
		});
	}
	function classEscape(s) {
		return s.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
			return "\\x0" + hex(ch);
		}).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
			return "\\x" + hex(ch);
		});
	}
	function describeExpectation(expectation) {
		return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
	}
	function describeExpected(expected) {
		var descriptions = expected.map(describeExpectation);
		var i, j;
		descriptions.sort();
		if (descriptions.length > 0) {
			for (i = 1, j = 1; i < descriptions.length; i++) if (descriptions[i - 1] !== descriptions[i]) {
				descriptions[j] = descriptions[i];
				j++;
			}
			descriptions.length = j;
		}
		switch (descriptions.length) {
			case 1: return descriptions[0];
			case 2: return descriptions[0] + " or " + descriptions[1];
			default: return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
		}
	}
	function describeFound(found) {
		return found ? "\"" + literalEscape(found) + "\"" : "end of input";
	}
	return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};
function peg$parse(input, options) {
	options = options !== void 0 ? options : {};
	var peg$FAILED = {};
	var peg$source = options.grammarSource;
	var peg$startRuleFunctions = { pgn: peg$parsepgn };
	var peg$startRuleFunction = peg$parsepgn;
	var peg$c0 = "[";
	var peg$c1 = "\"";
	var peg$c2 = "]";
	var peg$c3 = ".";
	var peg$c4 = "O-O-O";
	var peg$c5 = "O-O";
	var peg$c6 = "0-0-0";
	var peg$c7 = "0-0";
	var peg$c8 = "$";
	var peg$c9 = "{";
	var peg$c10 = "}";
	var peg$c11 = ";";
	var peg$c12 = "(";
	var peg$c13 = ")";
	var peg$c14 = "1-0";
	var peg$c15 = "0-1";
	var peg$c16 = "1/2-1/2";
	var peg$c17 = "*";
	var peg$r0 = /^[a-zA-Z]/;
	var peg$r1 = /^[^"]/;
	var peg$r2 = /^[0-9]/;
	var peg$r3 = /^[.]/;
	var peg$r4 = /^[a-zA-Z1-8\-=]/;
	var peg$r5 = /^[+#]/;
	var peg$r6 = /^[!?]/;
	var peg$r7 = /^[^}]/;
	var peg$r8 = /^[^\r\n]/;
	var peg$r9 = /^[ \t\r\n]/;
	var peg$e0 = peg$otherExpectation("tag pair");
	var peg$e1 = peg$literalExpectation("[", false);
	var peg$e2 = peg$literalExpectation("\"", false);
	var peg$e3 = peg$literalExpectation("]", false);
	var peg$e4 = peg$otherExpectation("tag name");
	var peg$e5 = peg$classExpectation([["a", "z"], ["A", "Z"]], false, false);
	var peg$e6 = peg$otherExpectation("tag value");
	var peg$e7 = peg$classExpectation(["\""], true, false);
	var peg$e8 = peg$otherExpectation("move number");
	var peg$e9 = peg$classExpectation([["0", "9"]], false, false);
	var peg$e10 = peg$literalExpectation(".", false);
	var peg$e11 = peg$classExpectation(["."], false, false);
	var peg$e12 = peg$otherExpectation("standard algebraic notation");
	var peg$e13 = peg$literalExpectation("O-O-O", false);
	var peg$e14 = peg$literalExpectation("O-O", false);
	var peg$e15 = peg$literalExpectation("0-0-0", false);
	var peg$e16 = peg$literalExpectation("0-0", false);
	var peg$e17 = peg$classExpectation([
		["a", "z"],
		["A", "Z"],
		["1", "8"],
		"-",
		"="
	], false, false);
	var peg$e18 = peg$classExpectation(["+", "#"], false, false);
	var peg$e19 = peg$otherExpectation("suffix annotation");
	var peg$e20 = peg$classExpectation(["!", "?"], false, false);
	var peg$e21 = peg$otherExpectation("NAG");
	var peg$e22 = peg$literalExpectation("$", false);
	var peg$e23 = peg$otherExpectation("brace comment");
	var peg$e24 = peg$literalExpectation("{", false);
	var peg$e25 = peg$classExpectation(["}"], true, false);
	var peg$e26 = peg$literalExpectation("}", false);
	var peg$e27 = peg$otherExpectation("rest of line comment");
	var peg$e28 = peg$literalExpectation(";", false);
	var peg$e29 = peg$classExpectation(["\r", "\n"], true, false);
	var peg$e30 = peg$otherExpectation("variation");
	var peg$e31 = peg$literalExpectation("(", false);
	var peg$e32 = peg$literalExpectation(")", false);
	var peg$e33 = peg$otherExpectation("game termination marker");
	var peg$e34 = peg$literalExpectation("1-0", false);
	var peg$e35 = peg$literalExpectation("0-1", false);
	var peg$e36 = peg$literalExpectation("1/2-1/2", false);
	var peg$e37 = peg$literalExpectation("*", false);
	var peg$e38 = peg$otherExpectation("whitespace");
	var peg$e39 = peg$classExpectation([
		" ",
		"	",
		"\r",
		"\n"
	], false, false);
	var peg$f0 = function(headers, game) {
		return pgn(headers, game);
	};
	var peg$f1 = function(tagPairs) {
		return Object.fromEntries(tagPairs);
	};
	var peg$f2 = function(tagName, tagValue) {
		return [tagName, tagValue];
	};
	var peg$f3 = function(root, marker) {
		return {
			root,
			marker
		};
	};
	var peg$f4 = function(comment, moves) {
		return lineToTree(rootNode(comment), ...moves.flat());
	};
	var peg$f5 = function(san, suffix, nag, comment, variations) {
		return node(san, suffix, nag, comment, variations);
	};
	var peg$f6 = function(nag) {
		return nag;
	};
	var peg$f7 = function(comment) {
		return comment.replace(/[\r\n]+/g, " ");
	};
	var peg$f8 = function(comment) {
		return comment.trim();
	};
	var peg$f9 = function(line) {
		return line;
	};
	var peg$f10 = function(result, comment) {
		return {
			result,
			comment
		};
	};
	var peg$currPos = options.peg$currPos | 0;
	var peg$posDetailsCache = [{
		line: 1,
		column: 1
	}];
	var peg$maxFailPos = peg$currPos;
	var peg$maxFailExpected = options.peg$maxFailExpected || [];
	var peg$silentFails = options.peg$silentFails | 0;
	var peg$result;
	if (options.startRule) {
		if (!(options.startRule in peg$startRuleFunctions)) throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
		peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
	}
	function peg$literalExpectation(text, ignoreCase) {
		return {
			type: "literal",
			text,
			ignoreCase
		};
	}
	function peg$classExpectation(parts, inverted, ignoreCase) {
		return {
			type: "class",
			parts,
			inverted,
			ignoreCase
		};
	}
	function peg$endExpectation() {
		return { type: "end" };
	}
	function peg$otherExpectation(description) {
		return {
			type: "other",
			description
		};
	}
	function peg$computePosDetails(pos) {
		var details = peg$posDetailsCache[pos];
		var p;
		if (details) return details;
		else {
			if (pos >= peg$posDetailsCache.length) p = peg$posDetailsCache.length - 1;
			else {
				p = pos;
				while (!peg$posDetailsCache[--p]);
			}
			details = peg$posDetailsCache[p];
			details = {
				line: details.line,
				column: details.column
			};
			while (p < pos) {
				if (input.charCodeAt(p) === 10) {
					details.line++;
					details.column = 1;
				} else details.column++;
				p++;
			}
			peg$posDetailsCache[pos] = details;
			return details;
		}
	}
	function peg$computeLocation(startPos, endPos, offset) {
		var startPosDetails = peg$computePosDetails(startPos);
		var endPosDetails = peg$computePosDetails(endPos);
		return {
			source: peg$source,
			start: {
				offset: startPos,
				line: startPosDetails.line,
				column: startPosDetails.column
			},
			end: {
				offset: endPos,
				line: endPosDetails.line,
				column: endPosDetails.column
			}
		};
	}
	function peg$fail(expected) {
		if (peg$currPos < peg$maxFailPos) return;
		if (peg$currPos > peg$maxFailPos) {
			peg$maxFailPos = peg$currPos;
			peg$maxFailExpected = [];
		}
		peg$maxFailExpected.push(expected);
	}
	function peg$buildStructuredError(expected, found, location) {
		return new peg$SyntaxError(peg$SyntaxError.buildMessage(expected, found), expected, found, location);
	}
	function peg$parsepgn() {
		var s0 = peg$currPos;
		s0 = peg$f0(peg$parsetagPairSection(), peg$parsemoveTextSection());
		return s0;
	}
	function peg$parsetagPairSection() {
		var s0 = peg$currPos, s1 = [], s2 = peg$parsetagPair();
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = peg$parsetagPair();
		}
		s2 = peg$parse_();
		s0 = peg$f1(s1);
		return s0;
	}
	function peg$parsetagPair() {
		var s0, s2, s4, s6, s7, s8, s10;
		peg$silentFails++;
		s0 = peg$currPos;
		peg$parse_();
		if (input.charCodeAt(peg$currPos) === 91) {
			s2 = peg$c0;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e1);
		}
		if (s2 !== peg$FAILED) {
			peg$parse_();
			s4 = peg$parsetagName();
			if (s4 !== peg$FAILED) {
				peg$parse_();
				if (input.charCodeAt(peg$currPos) === 34) {
					s6 = peg$c1;
					peg$currPos++;
				} else {
					s6 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e2);
				}
				if (s6 !== peg$FAILED) {
					s7 = peg$parsetagValue();
					if (input.charCodeAt(peg$currPos) === 34) {
						s8 = peg$c1;
						peg$currPos++;
					} else {
						s8 = peg$FAILED;
						if (peg$silentFails === 0) peg$fail(peg$e2);
					}
					if (s8 !== peg$FAILED) {
						peg$parse_();
						if (input.charCodeAt(peg$currPos) === 93) {
							s10 = peg$c2;
							peg$currPos++;
						} else {
							s10 = peg$FAILED;
							if (peg$silentFails === 0) peg$fail(peg$e3);
						}
						if (s10 !== peg$FAILED) s0 = peg$f2(s4, s7);
						else {
							peg$currPos = s0;
							s0 = peg$FAILED;
						}
					} else {
						peg$currPos = s0;
						s0 = peg$FAILED;
					}
				} else {
					peg$currPos = s0;
					s0 = peg$FAILED;
				}
			} else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			if (peg$silentFails === 0) peg$fail(peg$e0);
		}
		return s0;
	}
	function peg$parsetagName() {
		var s0, s1, s2;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r0.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e5);
		}
		if (s2 !== peg$FAILED) while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = input.charAt(peg$currPos);
			if (peg$r0.test(s2)) peg$currPos++;
			else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e5);
			}
		}
		else s1 = peg$FAILED;
		if (s1 !== peg$FAILED) s0 = input.substring(s0, peg$currPos);
		else s0 = s1;
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e4);
		}
		return s0;
	}
	function peg$parsetagValue() {
		var s0, s1, s2;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r1.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e7);
		}
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = input.charAt(peg$currPos);
			if (peg$r1.test(s2)) peg$currPos++;
			else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e7);
			}
		}
		s0 = input.substring(s0, peg$currPos);
		peg$silentFails--;
		s1 = peg$FAILED;
		if (peg$silentFails === 0) peg$fail(peg$e6);
		return s0;
	}
	function peg$parsemoveTextSection() {
		var s0 = peg$currPos, s1 = peg$parseline(), s3;
		peg$parse_();
		s3 = peg$parsegameTerminationMarker();
		if (s3 === peg$FAILED) s3 = null;
		peg$parse_();
		s0 = peg$f3(s1, s3);
		return s0;
	}
	function peg$parseline() {
		var s0 = peg$currPos, s1 = peg$parsecomment(), s2, s3;
		if (s1 === peg$FAILED) s1 = null;
		s2 = [];
		s3 = peg$parsemove();
		while (s3 !== peg$FAILED) {
			s2.push(s3);
			s3 = peg$parsemove();
		}
		s0 = peg$f4(s1, s2);
		return s0;
	}
	function peg$parsemove() {
		var s0 = peg$currPos, s4, s5, s6, s7, s8, s9, s10;
		peg$parse_();
		peg$parsemoveNumber();
		peg$parse_();
		s4 = peg$parsesan();
		if (s4 !== peg$FAILED) {
			s5 = peg$parsesuffixAnnotation();
			if (s5 === peg$FAILED) s5 = null;
			s6 = [];
			s7 = peg$parsenag();
			while (s7 !== peg$FAILED) {
				s6.push(s7);
				s7 = peg$parsenag();
			}
			s7 = peg$parse_();
			s8 = peg$parsecomment();
			if (s8 === peg$FAILED) s8 = null;
			s9 = [];
			s10 = peg$parsevariation();
			while (s10 !== peg$FAILED) {
				s9.push(s10);
				s10 = peg$parsevariation();
			}
			s0 = peg$f5(s4, s5, s6, s8, s9);
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		return s0;
	}
	function peg$parsemoveNumber() {
		var s0, s1, s2, s3, s4, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r2.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e9);
		}
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = input.charAt(peg$currPos);
			if (peg$r2.test(s2)) peg$currPos++;
			else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e9);
			}
		}
		if (input.charCodeAt(peg$currPos) === 46) {
			s2 = peg$c3;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e10);
		}
		if (s2 !== peg$FAILED) {
			s3 = peg$parse_();
			s4 = [];
			s5 = input.charAt(peg$currPos);
			if (peg$r3.test(s5)) peg$currPos++;
			else {
				s5 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e11);
			}
			while (s5 !== peg$FAILED) {
				s4.push(s5);
				s5 = input.charAt(peg$currPos);
				if (peg$r3.test(s5)) peg$currPos++;
				else {
					s5 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e11);
				}
			}
			s1 = [
				s1,
				s2,
				s3,
				s4
			];
			s0 = s1;
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e8);
		}
		return s0;
	}
	function peg$parsesan() {
		var s0, s1, s2, s3, s4, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = peg$currPos;
		if (input.substr(peg$currPos, 5) === peg$c4) {
			s2 = peg$c4;
			peg$currPos += 5;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e13);
		}
		if (s2 === peg$FAILED) {
			if (input.substr(peg$currPos, 3) === peg$c5) {
				s2 = peg$c5;
				peg$currPos += 3;
			} else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e14);
			}
			if (s2 === peg$FAILED) {
				if (input.substr(peg$currPos, 5) === peg$c6) {
					s2 = peg$c6;
					peg$currPos += 5;
				} else {
					s2 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e15);
				}
				if (s2 === peg$FAILED) {
					if (input.substr(peg$currPos, 3) === peg$c7) {
						s2 = peg$c7;
						peg$currPos += 3;
					} else {
						s2 = peg$FAILED;
						if (peg$silentFails === 0) peg$fail(peg$e16);
					}
					if (s2 === peg$FAILED) {
						s2 = peg$currPos;
						s3 = input.charAt(peg$currPos);
						if (peg$r0.test(s3)) peg$currPos++;
						else {
							s3 = peg$FAILED;
							if (peg$silentFails === 0) peg$fail(peg$e5);
						}
						if (s3 !== peg$FAILED) {
							s4 = [];
							s5 = input.charAt(peg$currPos);
							if (peg$r4.test(s5)) peg$currPos++;
							else {
								s5 = peg$FAILED;
								if (peg$silentFails === 0) peg$fail(peg$e17);
							}
							if (s5 !== peg$FAILED) while (s5 !== peg$FAILED) {
								s4.push(s5);
								s5 = input.charAt(peg$currPos);
								if (peg$r4.test(s5)) peg$currPos++;
								else {
									s5 = peg$FAILED;
									if (peg$silentFails === 0) peg$fail(peg$e17);
								}
							}
							else s4 = peg$FAILED;
							if (s4 !== peg$FAILED) {
								s3 = [s3, s4];
								s2 = s3;
							} else {
								peg$currPos = s2;
								s2 = peg$FAILED;
							}
						} else {
							peg$currPos = s2;
							s2 = peg$FAILED;
						}
					}
				}
			}
		}
		if (s2 !== peg$FAILED) {
			s3 = input.charAt(peg$currPos);
			if (peg$r5.test(s3)) peg$currPos++;
			else {
				s3 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e18);
			}
			if (s3 === peg$FAILED) s3 = null;
			s2 = [s2, s3];
			s1 = s2;
		} else {
			peg$currPos = s1;
			s1 = peg$FAILED;
		}
		if (s1 !== peg$FAILED) s0 = input.substring(s0, peg$currPos);
		else s0 = s1;
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e12);
		}
		return s0;
	}
	function peg$parsesuffixAnnotation() {
		var s0, s1, s2;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r6.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e20);
		}
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			if (s1.length >= 2) s2 = peg$FAILED;
			else {
				s2 = input.charAt(peg$currPos);
				if (peg$r6.test(s2)) peg$currPos++;
				else {
					s2 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e20);
				}
			}
		}
		if (s1.length < 1) {
			peg$currPos = s0;
			s0 = peg$FAILED;
		} else s0 = s1;
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e19);
		}
		return s0;
	}
	function peg$parsenag() {
		var s0, s2, s3, s4, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		peg$parse_();
		if (input.charCodeAt(peg$currPos) === 36) {
			s2 = peg$c8;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e22);
		}
		if (s2 !== peg$FAILED) {
			s3 = peg$currPos;
			s4 = [];
			s5 = input.charAt(peg$currPos);
			if (peg$r2.test(s5)) peg$currPos++;
			else {
				s5 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e9);
			}
			if (s5 !== peg$FAILED) while (s5 !== peg$FAILED) {
				s4.push(s5);
				s5 = input.charAt(peg$currPos);
				if (peg$r2.test(s5)) peg$currPos++;
				else {
					s5 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e9);
				}
			}
			else s4 = peg$FAILED;
			if (s4 !== peg$FAILED) s3 = input.substring(s3, peg$currPos);
			else s3 = s4;
			if (s3 !== peg$FAILED) s0 = peg$f6(s3);
			else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			if (peg$silentFails === 0) peg$fail(peg$e21);
		}
		return s0;
	}
	function peg$parsecomment() {
		var s0 = peg$parsebraceComment();
		if (s0 === peg$FAILED) s0 = peg$parserestOfLineComment();
		return s0;
	}
	function peg$parsebraceComment() {
		var s0, s1, s2, s3, s4;
		peg$silentFails++;
		s0 = peg$currPos;
		if (input.charCodeAt(peg$currPos) === 123) {
			s1 = peg$c9;
			peg$currPos++;
		} else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e24);
		}
		if (s1 !== peg$FAILED) {
			s2 = peg$currPos;
			s3 = [];
			s4 = input.charAt(peg$currPos);
			if (peg$r7.test(s4)) peg$currPos++;
			else {
				s4 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e25);
			}
			while (s4 !== peg$FAILED) {
				s3.push(s4);
				s4 = input.charAt(peg$currPos);
				if (peg$r7.test(s4)) peg$currPos++;
				else {
					s4 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e25);
				}
			}
			s2 = input.substring(s2, peg$currPos);
			if (input.charCodeAt(peg$currPos) === 125) {
				s3 = peg$c10;
				peg$currPos++;
			} else {
				s3 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e26);
			}
			if (s3 !== peg$FAILED) s0 = peg$f7(s2);
			else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e23);
		}
		return s0;
	}
	function peg$parserestOfLineComment() {
		var s0, s1, s2, s3, s4;
		peg$silentFails++;
		s0 = peg$currPos;
		if (input.charCodeAt(peg$currPos) === 59) {
			s1 = peg$c11;
			peg$currPos++;
		} else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e28);
		}
		if (s1 !== peg$FAILED) {
			s2 = peg$currPos;
			s3 = [];
			s4 = input.charAt(peg$currPos);
			if (peg$r8.test(s4)) peg$currPos++;
			else {
				s4 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e29);
			}
			while (s4 !== peg$FAILED) {
				s3.push(s4);
				s4 = input.charAt(peg$currPos);
				if (peg$r8.test(s4)) peg$currPos++;
				else {
					s4 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e29);
				}
			}
			s2 = input.substring(s2, peg$currPos);
			s0 = peg$f8(s2);
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e27);
		}
		return s0;
	}
	function peg$parsevariation() {
		var s0, s2, s3, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		peg$parse_();
		if (input.charCodeAt(peg$currPos) === 40) {
			s2 = peg$c12;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e31);
		}
		if (s2 !== peg$FAILED) {
			s3 = peg$parseline();
			if (s3 !== peg$FAILED) {
				peg$parse_();
				if (input.charCodeAt(peg$currPos) === 41) {
					s5 = peg$c13;
					peg$currPos++;
				} else {
					s5 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e32);
				}
				if (s5 !== peg$FAILED) s0 = peg$f9(s3);
				else {
					peg$currPos = s0;
					s0 = peg$FAILED;
				}
			} else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			if (peg$silentFails === 0) peg$fail(peg$e30);
		}
		return s0;
	}
	function peg$parsegameTerminationMarker() {
		var s0, s1, s3;
		peg$silentFails++;
		s0 = peg$currPos;
		if (input.substr(peg$currPos, 3) === peg$c14) {
			s1 = peg$c14;
			peg$currPos += 3;
		} else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e34);
		}
		if (s1 === peg$FAILED) {
			if (input.substr(peg$currPos, 3) === peg$c15) {
				s1 = peg$c15;
				peg$currPos += 3;
			} else {
				s1 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e35);
			}
			if (s1 === peg$FAILED) {
				if (input.substr(peg$currPos, 7) === peg$c16) {
					s1 = peg$c16;
					peg$currPos += 7;
				} else {
					s1 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e36);
				}
				if (s1 === peg$FAILED) if (input.charCodeAt(peg$currPos) === 42) {
					s1 = peg$c17;
					peg$currPos++;
				} else {
					s1 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e37);
				}
			}
		}
		if (s1 !== peg$FAILED) {
			peg$parse_();
			s3 = peg$parsecomment();
			if (s3 === peg$FAILED) s3 = null;
			s0 = peg$f10(s1, s3);
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e33);
		}
		return s0;
	}
	function peg$parse_() {
		var s0, s1;
		peg$silentFails++;
		s0 = [];
		s1 = input.charAt(peg$currPos);
		if (peg$r9.test(s1)) peg$currPos++;
		else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e39);
		}
		while (s1 !== peg$FAILED) {
			s0.push(s1);
			s1 = input.charAt(peg$currPos);
			if (peg$r9.test(s1)) peg$currPos++;
			else {
				s1 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e39);
			}
		}
		peg$silentFails--;
		s1 = peg$FAILED;
		if (peg$silentFails === 0) peg$fail(peg$e38);
		return s0;
	}
	peg$result = peg$startRuleFunction();
	if (options.peg$library) return {
		peg$result,
		peg$currPos,
		peg$FAILED,
		peg$maxFailExpected,
		peg$maxFailPos
	};
	if (peg$result !== peg$FAILED && peg$currPos === input.length) return peg$result;
	else {
		if (peg$result !== peg$FAILED && peg$currPos < input.length) peg$fail(peg$endExpectation());
		throw peg$buildStructuredError(peg$maxFailExpected, peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null, peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos));
	}
}
/**
* @license
* Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
* All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*
* 1. Redistributions of source code must retain the above copyright notice,
*    this list of conditions and the following disclaimer.
* 2. Redistributions in binary form must reproduce the above copyright notice,
*    this list of conditions and the following disclaimer in the documentation
*    and/or other materials provided with the distribution.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
* POSSIBILITY OF SUCH DAMAGE.
*/
var MASK64 = 18446744073709551615n;
function rotl(x, k) {
	return (x << k | x >> 64n - k) & 18446744073709551615n;
}
function wrappingMul(x, y) {
	return x * y & MASK64;
}
function xoroshiro128(state) {
	return function() {
		let s0 = BigInt(state & MASK64);
		let s1 = BigInt(state >> 64n & MASK64);
		const result = wrappingMul(rotl(wrappingMul(s0, 5n), 7n), 9n);
		s1 ^= s0;
		s0 = (rotl(s0, 24n) ^ s1 ^ s1 << 16n) & MASK64;
		s1 = rotl(s1, 37n);
		state = s1 << 64n | s0;
		return result;
	};
}
var rand = xoroshiro128(214711438343225530594246349426526445598n);
var PIECE_KEYS = Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => Array.from({ length: 128 }, () => rand())));
var EP_KEYS = Array.from({ length: 8 }, () => rand());
var CASTLING_KEYS = Array.from({ length: 16 }, () => rand());
var SIDE_KEY = rand();
var DEFAULT_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var Move = class {
	color;
	from;
	to;
	piece;
	captured;
	promotion;
	/**
	* @deprecated This field is deprecated and will be removed in version 2.0.0.
	* Please use move descriptor functions instead: `isCapture`, `isPromotion`,
	* `isEnPassant`, `isKingsideCastle`, `isQueensideCastle`, `isCastle`, and
	* `isBigPawn`
	*/
	flags;
	san;
	lan;
	before;
	after;
	constructor(chess, internal) {
		const { color, piece, from, to, flags, captured, promotion } = internal;
		const fromAlgebraic = algebraic(from);
		const toAlgebraic = algebraic(to);
		this.color = color;
		this.piece = piece;
		this.from = fromAlgebraic;
		this.to = toAlgebraic;
		this.san = chess["_moveToSan"](internal, chess["_moves"]({ legal: true }));
		this.lan = fromAlgebraic + toAlgebraic;
		this.before = chess.fen();
		chess["_makeMove"](internal);
		this.after = chess.fen();
		chess["_undoMove"]();
		this.flags = "";
		for (const flag in BITS) if (BITS[flag] & flags) this.flags += FLAGS[flag];
		if (captured) this.captured = captured;
		if (promotion) {
			this.promotion = promotion;
			this.lan += promotion;
		}
	}
	isCapture() {
		return this.flags.indexOf(FLAGS["CAPTURE"]) > -1;
	}
	isPromotion() {
		return this.flags.indexOf(FLAGS["PROMOTION"]) > -1;
	}
	isEnPassant() {
		return this.flags.indexOf(FLAGS["EP_CAPTURE"]) > -1;
	}
	isKingsideCastle() {
		return this.flags.indexOf(FLAGS["KSIDE_CASTLE"]) > -1;
	}
	isQueensideCastle() {
		return this.flags.indexOf(FLAGS["QSIDE_CASTLE"]) > -1;
	}
	isBigPawn() {
		return this.flags.indexOf(FLAGS["BIG_PAWN"]) > -1;
	}
};
var EMPTY = -1;
var FLAGS = {
	NORMAL: "n",
	CAPTURE: "c",
	BIG_PAWN: "b",
	EP_CAPTURE: "e",
	PROMOTION: "p",
	KSIDE_CASTLE: "k",
	QSIDE_CASTLE: "q",
	NULL_MOVE: "-"
};
var BITS = {
	NORMAL: 1,
	CAPTURE: 2,
	BIG_PAWN: 4,
	EP_CAPTURE: 8,
	PROMOTION: 16,
	KSIDE_CASTLE: 32,
	QSIDE_CASTLE: 64,
	NULL_MOVE: 128
};
var SEVEN_TAG_ROSTER = {
	Event: "?",
	Site: "?",
	Date: "????.??.??",
	Round: "?",
	White: "?",
	Black: "?",
	Result: "*"
};
/**
* These nulls are placeholders to fix the order of tags (as they appear in PGN spec); null values will be
* eliminated in getHeaders()
*/
var SUPLEMENTAL_TAGS = {
	WhiteTitle: null,
	BlackTitle: null,
	WhiteElo: null,
	BlackElo: null,
	WhiteUSCF: null,
	BlackUSCF: null,
	WhiteNA: null,
	BlackNA: null,
	WhiteType: null,
	BlackType: null,
	EventDate: null,
	EventSponsor: null,
	Section: null,
	Stage: null,
	Board: null,
	Opening: null,
	Variation: null,
	SubVariation: null,
	ECO: null,
	NIC: null,
	Time: null,
	UTCTime: null,
	UTCDate: null,
	TimeControl: null,
	SetUp: null,
	FEN: null,
	Termination: null,
	Annotator: null,
	Mode: null,
	PlyCount: null
};
var HEADER_TEMPLATE = {
	...SEVEN_TAG_ROSTER,
	...SUPLEMENTAL_TAGS
};
var Ox88 = {
	a8: 0,
	b8: 1,
	c8: 2,
	d8: 3,
	e8: 4,
	f8: 5,
	g8: 6,
	h8: 7,
	a7: 16,
	b7: 17,
	c7: 18,
	d7: 19,
	e7: 20,
	f7: 21,
	g7: 22,
	h7: 23,
	a6: 32,
	b6: 33,
	c6: 34,
	d6: 35,
	e6: 36,
	f6: 37,
	g6: 38,
	h6: 39,
	a5: 48,
	b5: 49,
	c5: 50,
	d5: 51,
	e5: 52,
	f5: 53,
	g5: 54,
	h5: 55,
	a4: 64,
	b4: 65,
	c4: 66,
	d4: 67,
	e4: 68,
	f4: 69,
	g4: 70,
	h4: 71,
	a3: 80,
	b3: 81,
	c3: 82,
	d3: 83,
	e3: 84,
	f3: 85,
	g3: 86,
	h3: 87,
	a2: 96,
	b2: 97,
	c2: 98,
	d2: 99,
	e2: 100,
	f2: 101,
	g2: 102,
	h2: 103,
	a1: 112,
	b1: 113,
	c1: 114,
	d1: 115,
	e1: 116,
	f1: 117,
	g1: 118,
	h1: 119
};
var PAWN_OFFSETS = {
	b: [
		16,
		32,
		17,
		15
	],
	w: [
		-16,
		-32,
		-17,
		-15
	]
};
var PIECE_OFFSETS = {
	n: [
		-18,
		-33,
		-31,
		-14,
		18,
		33,
		31,
		14
	],
	b: [
		-17,
		-15,
		17,
		15
	],
	r: [
		-16,
		1,
		16,
		-1
	],
	q: [
		-17,
		-16,
		-15,
		1,
		17,
		16,
		15,
		-1
	],
	k: [
		-17,
		-16,
		-15,
		1,
		17,
		16,
		15,
		-1
	]
};
var ATTACKS = [
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	24,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	2,
	24,
	2,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	2,
	53,
	56,
	53,
	2,
	0,
	0,
	0,
	0,
	0,
	0,
	24,
	24,
	24,
	24,
	24,
	24,
	56,
	0,
	56,
	24,
	24,
	24,
	24,
	24,
	24,
	0,
	0,
	0,
	0,
	0,
	0,
	2,
	53,
	56,
	53,
	2,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	2,
	24,
	2,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	24,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	0,
	20
];
var RAYS = [
	17,
	0,
	0,
	0,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	0,
	0,
	0,
	15,
	0,
	0,
	17,
	0,
	0,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	17,
	0,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	0,
	0,
	16,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	0,
	16,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	16,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	-16,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	-16,
	0,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	-16,
	0,
	0,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	0,
	-17,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	0,
	0,
	-17,
	0,
	0,
	-15,
	0,
	0,
	0,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	0,
	0,
	0,
	-17
];
var PIECE_MASKS = {
	p: 1,
	n: 2,
	b: 4,
	r: 8,
	q: 16,
	k: 32
};
var SYMBOLS = "pnbrqkPNBRQK";
var PROMOTIONS = [
	"n",
	"b",
	"r",
	"q"
];
var RANK_1 = 7;
var RANK_2 = 6;
var RANK_7 = 1;
var RANK_8 = 0;
var SIDES = {
	["k"]: BITS.KSIDE_CASTLE,
	["q"]: BITS.QSIDE_CASTLE
};
var ROOKS = {
	w: [{
		square: Ox88.a1,
		flag: BITS.QSIDE_CASTLE
	}, {
		square: Ox88.h1,
		flag: BITS.KSIDE_CASTLE
	}],
	b: [{
		square: Ox88.a8,
		flag: BITS.QSIDE_CASTLE
	}, {
		square: Ox88.h8,
		flag: BITS.KSIDE_CASTLE
	}]
};
var SECOND_RANK = {
	b: RANK_7,
	w: RANK_2
};
var SAN_NULLMOVE = "--";
function rank(square) {
	return square >> 4;
}
function file(square) {
	return square & 15;
}
function isDigit(c) {
	return "0123456789".indexOf(c) !== -1;
}
function algebraic(square) {
	const f = file(square);
	const r = rank(square);
	return "abcdefgh".substring(f, f + 1) + "87654321".substring(r, r + 1);
}
function swapColor(color) {
	return color === "w" ? "b" : "w";
}
function validateFen(fen) {
	const tokens = fen.split(/\s+/);
	if (tokens.length !== 6) return {
		ok: false,
		error: "Invalid FEN: must contain six space-delimited fields"
	};
	const moveNumber = parseInt(tokens[5], 10);
	if (isNaN(moveNumber) || moveNumber <= 0) return {
		ok: false,
		error: "Invalid FEN: move number must be a positive integer"
	};
	const halfMoves = parseInt(tokens[4], 10);
	if (isNaN(halfMoves) || halfMoves < 0) return {
		ok: false,
		error: "Invalid FEN: half move counter number must be a non-negative integer"
	};
	if (!/^(-|[abcdefgh][36])$/.test(tokens[3])) return {
		ok: false,
		error: "Invalid FEN: en-passant square is invalid"
	};
	if (/[^kKqQ-]/.test(tokens[2])) return {
		ok: false,
		error: "Invalid FEN: castling availability is invalid"
	};
	if (!/^(w|b)$/.test(tokens[1])) return {
		ok: false,
		error: "Invalid FEN: side-to-move is invalid"
	};
	const rows = tokens[0].split("/");
	if (rows.length !== 8) return {
		ok: false,
		error: "Invalid FEN: piece data does not contain 8 '/'-delimited rows"
	};
	for (let i = 0; i < rows.length; i++) {
		let sumFields = 0;
		let previousWasNumber = false;
		for (let k = 0; k < rows[i].length; k++) if (isDigit(rows[i][k])) {
			if (previousWasNumber) return {
				ok: false,
				error: "Invalid FEN: piece data is invalid (consecutive number)"
			};
			sumFields += parseInt(rows[i][k], 10);
			previousWasNumber = true;
		} else {
			if (!/^[prnbqkPRNBQK]$/.test(rows[i][k])) return {
				ok: false,
				error: "Invalid FEN: piece data is invalid (invalid piece)"
			};
			sumFields += 1;
			previousWasNumber = false;
		}
		if (sumFields !== 8) return {
			ok: false,
			error: "Invalid FEN: piece data is invalid (too many squares in rank)"
		};
	}
	if (tokens[3][1] == "3" && tokens[1] == "w" || tokens[3][1] == "6" && tokens[1] == "b") return {
		ok: false,
		error: "Invalid FEN: illegal en-passant square"
	};
	for (const { color, regex } of [{
		color: "white",
		regex: /K/g
	}, {
		color: "black",
		regex: /k/g
	}]) {
		if (!regex.test(tokens[0])) return {
			ok: false,
			error: `Invalid FEN: missing ${color} king`
		};
		if ((tokens[0].match(regex) || []).length > 1) return {
			ok: false,
			error: `Invalid FEN: too many ${color} kings`
		};
	}
	if (Array.from(rows[0] + rows[7]).some((char) => char.toUpperCase() === "P")) return {
		ok: false,
		error: "Invalid FEN: some pawns are on the edge rows"
	};
	return { ok: true };
}
function getDisambiguator(move, moves) {
	const from = move.from;
	const to = move.to;
	const piece = move.piece;
	let ambiguities = 0;
	let sameRank = 0;
	let sameFile = 0;
	for (let i = 0, len = moves.length; i < len; i++) {
		const ambigFrom = moves[i].from;
		const ambigTo = moves[i].to;
		if (piece === moves[i].piece && from !== ambigFrom && to === ambigTo) {
			ambiguities++;
			if (rank(from) === rank(ambigFrom)) sameRank++;
			if (file(from) === file(ambigFrom)) sameFile++;
		}
	}
	if (ambiguities > 0) if (sameRank > 0 && sameFile > 0) return algebraic(from);
	else if (sameFile > 0) return algebraic(from).charAt(1);
	else return algebraic(from).charAt(0);
	return "";
}
function addMove(moves, color, from, to, piece, captured = void 0, flags = BITS.NORMAL) {
	const r = rank(to);
	if (piece === "p" && (r === RANK_1 || r === RANK_8)) for (let i = 0; i < PROMOTIONS.length; i++) {
		const promotion = PROMOTIONS[i];
		moves.push({
			color,
			from,
			to,
			piece,
			captured,
			promotion,
			flags: flags | BITS.PROMOTION
		});
	}
	else moves.push({
		color,
		from,
		to,
		piece,
		captured,
		flags
	});
}
function inferPieceType(san) {
	let pieceType = san.charAt(0);
	if (pieceType >= "a" && pieceType <= "h") {
		if (san.match(/[a-h]\d.*[a-h]\d/)) return;
		return "p";
	}
	pieceType = pieceType.toLowerCase();
	if (pieceType === "o") return "k";
	return pieceType;
}
function strippedSan(move) {
	return move.replace(/=/, "").replace(/[+#]?[?!]*$/, "");
}
var Chess$1 = class {
	_board = new Array(128);
	_turn = "w";
	_header = {};
	_kings = {
		w: EMPTY,
		b: EMPTY
	};
	_epSquare = -1;
	_halfMoves = 0;
	_moveNumber = 0;
	_history = [];
	_comments = {};
	_castling = {
		w: 0,
		b: 0
	};
	_hash = 0n;
	_positionCount = /* @__PURE__ */ new Map();
	constructor(fen = DEFAULT_POSITION, { skipValidation = false } = {}) {
		this.load(fen, { skipValidation });
	}
	clear({ preserveHeaders = false } = {}) {
		this._board = new Array(128);
		this._kings = {
			w: EMPTY,
			b: EMPTY
		};
		this._turn = "w";
		this._castling = {
			w: 0,
			b: 0
		};
		this._epSquare = EMPTY;
		this._halfMoves = 0;
		this._moveNumber = 1;
		this._history = [];
		this._comments = {};
		this._header = preserveHeaders ? this._header : { ...HEADER_TEMPLATE };
		this._hash = this._computeHash();
		this._positionCount = /* @__PURE__ */ new Map();
		this._header["SetUp"] = null;
		this._header["FEN"] = null;
	}
	load(fen, { skipValidation = false, preserveHeaders = false } = {}) {
		let tokens = fen.split(/\s+/);
		if (tokens.length >= 2 && tokens.length < 6) fen = tokens.concat([
			"-",
			"-",
			"0",
			"1"
		].slice(-(6 - tokens.length))).join(" ");
		tokens = fen.split(/\s+/);
		if (!skipValidation) {
			const { ok, error } = validateFen(fen);
			if (!ok) throw new Error(error);
		}
		const position = tokens[0];
		let square = 0;
		this.clear({ preserveHeaders });
		for (let i = 0; i < position.length; i++) {
			const piece = position.charAt(i);
			if (piece === "/") square += 8;
			else if (isDigit(piece)) square += parseInt(piece, 10);
			else {
				const color = piece < "a" ? "w" : "b";
				this._put({
					type: piece.toLowerCase(),
					color
				}, algebraic(square));
				square++;
			}
		}
		this._turn = tokens[1];
		if (tokens[2].indexOf("K") > -1) this._castling.w |= BITS.KSIDE_CASTLE;
		if (tokens[2].indexOf("Q") > -1) this._castling.w |= BITS.QSIDE_CASTLE;
		if (tokens[2].indexOf("k") > -1) this._castling.b |= BITS.KSIDE_CASTLE;
		if (tokens[2].indexOf("q") > -1) this._castling.b |= BITS.QSIDE_CASTLE;
		this._epSquare = tokens[3] === "-" ? EMPTY : Ox88[tokens[3]];
		this._halfMoves = parseInt(tokens[4], 10);
		this._moveNumber = parseInt(tokens[5], 10);
		this._hash = this._computeHash();
		this._updateSetup(fen);
		this._incPositionCount();
	}
	fen({ forceEnpassantSquare = false } = {}) {
		let empty = 0;
		let fen = "";
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (this._board[i]) {
				if (empty > 0) {
					fen += empty;
					empty = 0;
				}
				const { color, type: piece } = this._board[i];
				fen += color === "w" ? piece.toUpperCase() : piece.toLowerCase();
			} else empty++;
			if (i + 1 & 136) {
				if (empty > 0) fen += empty;
				if (i !== Ox88.h1) fen += "/";
				empty = 0;
				i += 8;
			}
		}
		let castling = "";
		if (this._castling["w"] & BITS.KSIDE_CASTLE) castling += "K";
		if (this._castling["w"] & BITS.QSIDE_CASTLE) castling += "Q";
		if (this._castling["b"] & BITS.KSIDE_CASTLE) castling += "k";
		if (this._castling["b"] & BITS.QSIDE_CASTLE) castling += "q";
		castling = castling || "-";
		let epSquare = "-";
		if (this._epSquare !== EMPTY) if (forceEnpassantSquare) epSquare = algebraic(this._epSquare);
		else {
			const bigPawnSquare = this._epSquare + (this._turn === "w" ? 16 : -16);
			const squares = [bigPawnSquare + 1, bigPawnSquare - 1];
			for (const square of squares) {
				if (square & 136) continue;
				const color = this._turn;
				if (this._board[square]?.color === color && this._board[square]?.type === "p") {
					this._makeMove({
						color,
						from: square,
						to: this._epSquare,
						piece: "p",
						captured: "p",
						flags: BITS.EP_CAPTURE
					});
					const isLegal = !this._isKingAttacked(color);
					this._undoMove();
					if (isLegal) {
						epSquare = algebraic(this._epSquare);
						break;
					}
				}
			}
		}
		return [
			fen,
			this._turn,
			castling,
			epSquare,
			this._halfMoves,
			this._moveNumber
		].join(" ");
	}
	_pieceKey(i) {
		if (!this._board[i]) return 0n;
		const { color, type } = this._board[i];
		const colorIndex = {
			w: 0,
			b: 1
		}[color];
		const typeIndex = {
			p: 0,
			n: 1,
			b: 2,
			r: 3,
			q: 4,
			k: 5
		}[type];
		return PIECE_KEYS[colorIndex][typeIndex][i];
	}
	_epKey() {
		return this._epSquare === EMPTY ? 0n : EP_KEYS[this._epSquare & 7];
	}
	_castlingKey() {
		return CASTLING_KEYS[this._castling.w >> 5 | this._castling.b >> 3];
	}
	_computeHash() {
		let hash = 0n;
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (i & 136) {
				i += 7;
				continue;
			}
			if (this._board[i]) hash ^= this._pieceKey(i);
		}
		hash ^= this._epKey();
		hash ^= this._castlingKey();
		if (this._turn === "b") hash ^= SIDE_KEY;
		return hash;
	}
	_updateSetup(fen) {
		if (this._history.length > 0) return;
		if (fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			this._header["SetUp"] = "1";
			this._header["FEN"] = fen;
		} else {
			this._header["SetUp"] = null;
			this._header["FEN"] = null;
		}
	}
	reset() {
		this.load(DEFAULT_POSITION);
	}
	get(square) {
		return this._board[Ox88[square]];
	}
	findPiece(piece) {
		const squares = [];
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (i & 136) {
				i += 7;
				continue;
			}
			if (!this._board[i] || this._board[i]?.color !== piece.color) continue;
			if (this._board[i].color === piece.color && this._board[i].type === piece.type) squares.push(algebraic(i));
		}
		return squares;
	}
	put({ type, color }, square) {
		if (this._put({
			type,
			color
		}, square)) {
			this._updateCastlingRights();
			this._updateEnPassantSquare();
			this._updateSetup(this.fen());
			return true;
		}
		return false;
	}
	_set(sq, piece) {
		this._hash ^= this._pieceKey(sq);
		this._board[sq] = piece;
		this._hash ^= this._pieceKey(sq);
	}
	_put({ type, color }, square) {
		if (SYMBOLS.indexOf(type.toLowerCase()) === -1) return false;
		if (!(square in Ox88)) return false;
		const sq = Ox88[square];
		if (type == "k" && !(this._kings[color] == EMPTY || this._kings[color] == sq)) return false;
		const currentPieceOnSquare = this._board[sq];
		if (currentPieceOnSquare && currentPieceOnSquare.type === "k") this._kings[currentPieceOnSquare.color] = EMPTY;
		this._set(sq, {
			type,
			color
		});
		if (type === "k") this._kings[color] = sq;
		return true;
	}
	_clear(sq) {
		this._hash ^= this._pieceKey(sq);
		delete this._board[sq];
	}
	remove(square) {
		const piece = this.get(square);
		this._clear(Ox88[square]);
		if (piece && piece.type === "k") this._kings[piece.color] = EMPTY;
		this._updateCastlingRights();
		this._updateEnPassantSquare();
		this._updateSetup(this.fen());
		return piece;
	}
	_updateCastlingRights() {
		this._hash ^= this._castlingKey();
		const whiteKingInPlace = this._board[Ox88.e1]?.type === "k" && this._board[Ox88.e1]?.color === "w";
		const blackKingInPlace = this._board[Ox88.e8]?.type === "k" && this._board[Ox88.e8]?.color === "b";
		if (!whiteKingInPlace || this._board[Ox88.a1]?.type !== "r" || this._board[Ox88.a1]?.color !== "w") this._castling.w &= -65;
		if (!whiteKingInPlace || this._board[Ox88.h1]?.type !== "r" || this._board[Ox88.h1]?.color !== "w") this._castling.w &= -33;
		if (!blackKingInPlace || this._board[Ox88.a8]?.type !== "r" || this._board[Ox88.a8]?.color !== "b") this._castling.b &= -65;
		if (!blackKingInPlace || this._board[Ox88.h8]?.type !== "r" || this._board[Ox88.h8]?.color !== "b") this._castling.b &= -33;
		this._hash ^= this._castlingKey();
	}
	_updateEnPassantSquare() {
		if (this._epSquare === EMPTY) return;
		const startSquare = this._epSquare + (this._turn === "w" ? -16 : 16);
		const currentSquare = this._epSquare + (this._turn === "w" ? 16 : -16);
		const attackers = [currentSquare + 1, currentSquare - 1];
		if (this._board[startSquare] !== null || this._board[this._epSquare] !== null || this._board[currentSquare]?.color !== swapColor(this._turn) || this._board[currentSquare]?.type !== "p") {
			this._hash ^= this._epKey();
			this._epSquare = EMPTY;
			return;
		}
		const canCapture = (square) => !(square & 136) && this._board[square]?.color === this._turn && this._board[square]?.type === "p";
		if (!attackers.some(canCapture)) {
			this._hash ^= this._epKey();
			this._epSquare = EMPTY;
		}
	}
	_attacked(color, square, verbose) {
		const attackers = [];
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (i & 136) {
				i += 7;
				continue;
			}
			if (this._board[i] === void 0 || this._board[i].color !== color) continue;
			const piece = this._board[i];
			const difference = i - square;
			if (difference === 0) continue;
			const index = difference + 119;
			if (ATTACKS[index] & PIECE_MASKS[piece.type]) {
				if (piece.type === "p") {
					if (difference > 0 && piece.color === "w" || difference <= 0 && piece.color === "b") if (!verbose) return true;
					else attackers.push(algebraic(i));
					continue;
				}
				if (piece.type === "n" || piece.type === "k") if (!verbose) return true;
				else {
					attackers.push(algebraic(i));
					continue;
				}
				const offset = RAYS[index];
				let j = i + offset;
				let blocked = false;
				while (j !== square) {
					if (this._board[j] != null) {
						blocked = true;
						break;
					}
					j += offset;
				}
				if (!blocked) if (!verbose) return true;
				else {
					attackers.push(algebraic(i));
					continue;
				}
			}
		}
		if (verbose) return attackers;
		else return false;
	}
	attackers(square, attackedBy) {
		if (!attackedBy) return this._attacked(this._turn, Ox88[square], true);
		else return this._attacked(attackedBy, Ox88[square], true);
	}
	_isKingAttacked(color) {
		const square = this._kings[color];
		return square === -1 ? false : this._attacked(swapColor(color), square);
	}
	hash() {
		return this._hash.toString(16);
	}
	isAttacked(square, attackedBy) {
		return this._attacked(attackedBy, Ox88[square]);
	}
	isCheck() {
		return this._isKingAttacked(this._turn);
	}
	inCheck() {
		return this.isCheck();
	}
	isCheckmate() {
		return this.isCheck() && this._moves().length === 0;
	}
	isStalemate() {
		return !this.isCheck() && this._moves().length === 0;
	}
	isInsufficientMaterial() {
		const pieces = {
			b: 0,
			n: 0,
			r: 0,
			q: 0,
			k: 0,
			p: 0
		};
		const bishops = [];
		let numPieces = 0;
		let squareColor = 0;
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			squareColor = (squareColor + 1) % 2;
			if (i & 136) {
				i += 7;
				continue;
			}
			const piece = this._board[i];
			if (piece) {
				pieces[piece.type] = piece.type in pieces ? pieces[piece.type] + 1 : 1;
				if (piece.type === "b") bishops.push(squareColor);
				numPieces++;
			}
		}
		if (numPieces === 2) return true;
		else if (numPieces === 3 && (pieces["b"] === 1 || pieces["n"] === 1)) return true;
		else if (numPieces === pieces["b"] + 2) {
			let sum = 0;
			const len = bishops.length;
			for (let i = 0; i < len; i++) sum += bishops[i];
			if (sum === 0 || sum === len) return true;
		}
		return false;
	}
	isThreefoldRepetition() {
		return this._getPositionCount(this._hash) >= 3;
	}
	isDrawByFiftyMoves() {
		return this._halfMoves >= 100;
	}
	isDraw() {
		return this.isDrawByFiftyMoves() || this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition();
	}
	isGameOver() {
		return this.isCheckmate() || this.isDraw();
	}
	moves({ verbose = false, square = void 0, piece = void 0 } = {}) {
		const moves = this._moves({
			square,
			piece
		});
		if (verbose) return moves.map((move) => new Move(this, move));
		else return moves.map((move) => this._moveToSan(move, moves));
	}
	_moves({ legal = true, piece = void 0, square = void 0 } = {}) {
		const forSquare = square ? square.toLowerCase() : void 0;
		const forPiece = piece?.toLowerCase();
		const moves = [];
		const us = this._turn;
		const them = swapColor(us);
		let firstSquare = Ox88.a8;
		let lastSquare = Ox88.h1;
		let singleSquare = false;
		if (forSquare) if (!(forSquare in Ox88)) return [];
		else {
			firstSquare = lastSquare = Ox88[forSquare];
			singleSquare = true;
		}
		for (let from = firstSquare; from <= lastSquare; from++) {
			if (from & 136) {
				from += 7;
				continue;
			}
			if (!this._board[from] || this._board[from].color === them) continue;
			const { type } = this._board[from];
			let to;
			if (type === "p") {
				if (forPiece && forPiece !== type) continue;
				to = from + PAWN_OFFSETS[us][0];
				if (!this._board[to]) {
					addMove(moves, us, from, to, "p");
					to = from + PAWN_OFFSETS[us][1];
					if (SECOND_RANK[us] === rank(from) && !this._board[to]) addMove(moves, us, from, to, "p", void 0, BITS.BIG_PAWN);
				}
				for (let j = 2; j < 4; j++) {
					to = from + PAWN_OFFSETS[us][j];
					if (to & 136) continue;
					if (this._board[to]?.color === them) addMove(moves, us, from, to, "p", this._board[to].type, BITS.CAPTURE);
					else if (to === this._epSquare) addMove(moves, us, from, to, "p", "p", BITS.EP_CAPTURE);
				}
			} else {
				if (forPiece && forPiece !== type) continue;
				for (let j = 0, len = PIECE_OFFSETS[type].length; j < len; j++) {
					const offset = PIECE_OFFSETS[type][j];
					to = from;
					while (true) {
						to += offset;
						if (to & 136) break;
						if (!this._board[to]) addMove(moves, us, from, to, type);
						else {
							if (this._board[to].color === us) break;
							addMove(moves, us, from, to, type, this._board[to].type, BITS.CAPTURE);
							break;
						}
						if (type === "n" || type === "k") break;
					}
				}
			}
		}
		if (forPiece === void 0 || forPiece === "k") {
			if (!singleSquare || lastSquare === this._kings[us]) {
				if (this._castling[us] & BITS.KSIDE_CASTLE) {
					const castlingFrom = this._kings[us];
					const castlingTo = castlingFrom + 2;
					if (!this._board[castlingFrom + 1] && !this._board[castlingTo] && !this._attacked(them, this._kings[us]) && !this._attacked(them, castlingFrom + 1) && !this._attacked(them, castlingTo)) addMove(moves, us, this._kings[us], castlingTo, "k", void 0, BITS.KSIDE_CASTLE);
				}
				if (this._castling[us] & BITS.QSIDE_CASTLE) {
					const castlingFrom = this._kings[us];
					const castlingTo = castlingFrom - 2;
					if (!this._board[castlingFrom - 1] && !this._board[castlingFrom - 2] && !this._board[castlingFrom - 3] && !this._attacked(them, this._kings[us]) && !this._attacked(them, castlingFrom - 1) && !this._attacked(them, castlingTo)) addMove(moves, us, this._kings[us], castlingTo, "k", void 0, BITS.QSIDE_CASTLE);
				}
			}
		}
		if (!legal || this._kings[us] === -1) return moves;
		const legalMoves = [];
		for (let i = 0, len = moves.length; i < len; i++) {
			this._makeMove(moves[i]);
			if (!this._isKingAttacked(us)) legalMoves.push(moves[i]);
			this._undoMove();
		}
		return legalMoves;
	}
	move(move, { strict = false } = {}) {
		let moveObj = null;
		if (typeof move === "string") moveObj = this._moveFromSan(move, strict);
		else if (move === null) moveObj = this._moveFromSan(SAN_NULLMOVE, strict);
		else if (typeof move === "object") {
			const moves = this._moves();
			for (let i = 0, len = moves.length; i < len; i++) if (move.from === algebraic(moves[i].from) && move.to === algebraic(moves[i].to) && (!("promotion" in moves[i]) || move.promotion === moves[i].promotion)) {
				moveObj = moves[i];
				break;
			}
		}
		if (!moveObj) if (typeof move === "string") throw new Error(`Invalid move: ${move}`);
		else throw new Error(`Invalid move: ${JSON.stringify(move)}`);
		if (this.isCheck() && moveObj.flags & BITS.NULL_MOVE) throw new Error("Null move not allowed when in check");
		const prettyMove = new Move(this, moveObj);
		this._makeMove(moveObj);
		this._incPositionCount();
		return prettyMove;
	}
	_push(move) {
		this._history.push({
			move,
			kings: {
				b: this._kings.b,
				w: this._kings.w
			},
			turn: this._turn,
			castling: {
				b: this._castling.b,
				w: this._castling.w
			},
			epSquare: this._epSquare,
			halfMoves: this._halfMoves,
			moveNumber: this._moveNumber
		});
	}
	_movePiece(from, to) {
		this._hash ^= this._pieceKey(from);
		this._board[to] = this._board[from];
		delete this._board[from];
		this._hash ^= this._pieceKey(to);
	}
	_makeMove(move) {
		const us = this._turn;
		const them = swapColor(us);
		this._push(move);
		if (move.flags & BITS.NULL_MOVE) {
			if (us === "b") this._moveNumber++;
			this._halfMoves++;
			this._turn = them;
			this._epSquare = EMPTY;
			return;
		}
		this._hash ^= this._epKey();
		this._hash ^= this._castlingKey();
		if (move.captured) this._hash ^= this._pieceKey(move.to);
		this._movePiece(move.from, move.to);
		if (move.flags & BITS.EP_CAPTURE) if (this._turn === "b") this._clear(move.to - 16);
		else this._clear(move.to + 16);
		if (move.promotion) {
			this._clear(move.to);
			this._set(move.to, {
				type: move.promotion,
				color: us
			});
		}
		if (this._board[move.to].type === "k") {
			this._kings[us] = move.to;
			if (move.flags & BITS.KSIDE_CASTLE) {
				const castlingTo = move.to - 1;
				const castlingFrom = move.to + 1;
				this._movePiece(castlingFrom, castlingTo);
			} else if (move.flags & BITS.QSIDE_CASTLE) {
				const castlingTo = move.to + 1;
				const castlingFrom = move.to - 2;
				this._movePiece(castlingFrom, castlingTo);
			}
			this._castling[us] = 0;
		}
		if (this._castling[us]) {
			for (let i = 0, len = ROOKS[us].length; i < len; i++) if (move.from === ROOKS[us][i].square && this._castling[us] & ROOKS[us][i].flag) {
				this._castling[us] ^= ROOKS[us][i].flag;
				break;
			}
		}
		if (this._castling[them]) {
			for (let i = 0, len = ROOKS[them].length; i < len; i++) if (move.to === ROOKS[them][i].square && this._castling[them] & ROOKS[them][i].flag) {
				this._castling[them] ^= ROOKS[them][i].flag;
				break;
			}
		}
		this._hash ^= this._castlingKey();
		if (move.flags & BITS.BIG_PAWN) {
			let epSquare;
			if (us === "b") epSquare = move.to - 16;
			else epSquare = move.to + 16;
			if (!(move.to - 1 & 136) && this._board[move.to - 1]?.type === "p" && this._board[move.to - 1]?.color === them || !(move.to + 1 & 136) && this._board[move.to + 1]?.type === "p" && this._board[move.to + 1]?.color === them) {
				this._epSquare = epSquare;
				this._hash ^= this._epKey();
			} else this._epSquare = EMPTY;
		} else this._epSquare = EMPTY;
		if (move.piece === "p") this._halfMoves = 0;
		else if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) this._halfMoves = 0;
		else this._halfMoves++;
		if (us === "b") this._moveNumber++;
		this._turn = them;
		this._hash ^= SIDE_KEY;
	}
	undo() {
		const hash = this._hash;
		const move = this._undoMove();
		if (move) {
			const prettyMove = new Move(this, move);
			this._decPositionCount(hash);
			return prettyMove;
		}
		return null;
	}
	_undoMove() {
		const old = this._history.pop();
		if (old === void 0) return null;
		this._hash ^= this._epKey();
		this._hash ^= this._castlingKey();
		const move = old.move;
		this._kings = old.kings;
		this._turn = old.turn;
		this._castling = old.castling;
		this._epSquare = old.epSquare;
		this._halfMoves = old.halfMoves;
		this._moveNumber = old.moveNumber;
		this._hash ^= this._epKey();
		this._hash ^= this._castlingKey();
		this._hash ^= SIDE_KEY;
		const us = this._turn;
		const them = swapColor(us);
		if (move.flags & BITS.NULL_MOVE) return move;
		this._movePiece(move.to, move.from);
		if (move.piece) {
			this._clear(move.from);
			this._set(move.from, {
				type: move.piece,
				color: us
			});
		}
		if (move.captured) if (move.flags & BITS.EP_CAPTURE) {
			let index;
			if (us === "b") index = move.to - 16;
			else index = move.to + 16;
			this._set(index, {
				type: "p",
				color: them
			});
		} else this._set(move.to, {
			type: move.captured,
			color: them
		});
		if (move.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
			let castlingTo, castlingFrom;
			if (move.flags & BITS.KSIDE_CASTLE) {
				castlingTo = move.to + 1;
				castlingFrom = move.to - 1;
			} else {
				castlingTo = move.to - 2;
				castlingFrom = move.to + 1;
			}
			this._movePiece(castlingFrom, castlingTo);
		}
		return move;
	}
	pgn({ newline = "\n", maxWidth = 0 } = {}) {
		const result = [];
		let headerExists = false;
		for (const i in this._header) {
			if (this._header[i]) result.push(`[${i} "${this._header[i]}"]` + newline);
			headerExists = true;
		}
		if (headerExists && this._history.length) result.push(newline);
		const appendComment = (moveString) => {
			const comment = this._comments[this.fen()];
			if (typeof comment !== "undefined") {
				const delimiter = moveString.length > 0 ? " " : "";
				moveString = `${moveString}${delimiter}{${comment}}`;
			}
			return moveString;
		};
		const reversedHistory = [];
		while (this._history.length > 0) reversedHistory.push(this._undoMove());
		const moves = [];
		let moveString = "";
		if (reversedHistory.length === 0) moves.push(appendComment(""));
		while (reversedHistory.length > 0) {
			moveString = appendComment(moveString);
			const move = reversedHistory.pop();
			if (!move) break;
			if (!this._history.length && move.color === "b") {
				const prefix = `${this._moveNumber}. ...`;
				moveString = moveString ? `${moveString} ${prefix}` : prefix;
			} else if (move.color === "w") {
				if (moveString.length) moves.push(moveString);
				moveString = this._moveNumber + ".";
			}
			moveString = moveString + " " + this._moveToSan(move, this._moves({ legal: true }));
			this._makeMove(move);
		}
		if (moveString.length) moves.push(appendComment(moveString));
		moves.push(this._header.Result || "*");
		if (maxWidth === 0) return result.join("") + moves.join(" ");
		const strip = function() {
			if (result.length > 0 && result[result.length - 1] === " ") {
				result.pop();
				return true;
			}
			return false;
		};
		const wrapComment = function(width, move) {
			for (const token of move.split(" ")) {
				if (!token) continue;
				if (width + token.length > maxWidth) {
					while (strip()) width--;
					result.push(newline);
					width = 0;
				}
				result.push(token);
				width += token.length;
				result.push(" ");
				width++;
			}
			if (strip()) width--;
			return width;
		};
		let currentWidth = 0;
		for (let i = 0; i < moves.length; i++) {
			if (currentWidth + moves[i].length > maxWidth) {
				if (moves[i].includes("{")) {
					currentWidth = wrapComment(currentWidth, moves[i]);
					continue;
				}
			}
			if (currentWidth + moves[i].length > maxWidth && i !== 0) {
				if (result[result.length - 1] === " ") result.pop();
				result.push(newline);
				currentWidth = 0;
			} else if (i !== 0) {
				result.push(" ");
				currentWidth++;
			}
			result.push(moves[i]);
			currentWidth += moves[i].length;
		}
		return result.join("");
	}
	/**
	* @deprecated Use `setHeader` and `getHeaders` instead. This method will return null header tags (which is not what you want)
	*/
	header(...args) {
		for (let i = 0; i < args.length; i += 2) if (typeof args[i] === "string" && typeof args[i + 1] === "string") this._header[args[i]] = args[i + 1];
		return this._header;
	}
	setHeader(key, value) {
		this._header[key] = value ?? SEVEN_TAG_ROSTER[key] ?? null;
		return this.getHeaders();
	}
	removeHeader(key) {
		if (key in this._header) {
			this._header[key] = SEVEN_TAG_ROSTER[key] || null;
			return true;
		}
		return false;
	}
	getHeaders() {
		const nonNullHeaders = {};
		for (const [key, value] of Object.entries(this._header)) if (value !== null) nonNullHeaders[key] = value;
		return nonNullHeaders;
	}
	loadPgn(pgn, { strict = false, newlineChar = "\r?\n" } = {}) {
		if (newlineChar !== "\r?\n") pgn = pgn.replace(new RegExp(newlineChar, "g"), "\n");
		const parsedPgn = peg$parse(pgn);
		this.reset();
		const headers = parsedPgn.headers;
		let fen = "";
		for (const key in headers) {
			if (key.toLowerCase() === "fen") fen = headers[key];
			this.header(key, headers[key]);
		}
		if (!strict) {
			if (fen) this.load(fen, { preserveHeaders: true });
		} else if (headers["SetUp"] === "1") {
			if (!("FEN" in headers)) throw new Error("Invalid PGN: FEN tag must be supplied with SetUp tag");
			this.load(headers["FEN"], { preserveHeaders: true });
		}
		let node = parsedPgn.root;
		while (node) {
			if (node.move) {
				const move = this._moveFromSan(node.move, strict);
				if (move == null) throw new Error(`Invalid move in PGN: ${node.move}`);
				else {
					this._makeMove(move);
					this._incPositionCount();
				}
			}
			if (node.comment !== void 0) this._comments[this.fen()] = node.comment;
			node = node.variations[0];
		}
		const result = parsedPgn.result;
		if (result && Object.keys(this._header).length && this._header["Result"] !== result) this.setHeader("Result", result);
	}
	_moveToSan(move, moves) {
		let output = "";
		if (move.flags & BITS.KSIDE_CASTLE) output = "O-O";
		else if (move.flags & BITS.QSIDE_CASTLE) output = "O-O-O";
		else if (move.flags & BITS.NULL_MOVE) return SAN_NULLMOVE;
		else {
			if (move.piece !== "p") {
				const disambiguator = getDisambiguator(move, moves);
				output += move.piece.toUpperCase() + disambiguator;
			}
			if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
				if (move.piece === "p") output += algebraic(move.from)[0];
				output += "x";
			}
			output += algebraic(move.to);
			if (move.promotion) output += "=" + move.promotion.toUpperCase();
		}
		this._makeMove(move);
		if (this.isCheck()) if (this.isCheckmate()) output += "#";
		else output += "+";
		this._undoMove();
		return output;
	}
	_moveFromSan(move, strict = false) {
		let cleanMove = strippedSan(move);
		if (!strict) {
			if (cleanMove === "0-0") cleanMove = "O-O";
			else if (cleanMove === "0-0-0") cleanMove = "O-O-O";
		}
		if (cleanMove == SAN_NULLMOVE) return {
			color: this._turn,
			from: 0,
			to: 0,
			piece: "k",
			flags: BITS.NULL_MOVE
		};
		let pieceType = inferPieceType(cleanMove);
		let moves = this._moves({
			legal: true,
			piece: pieceType
		});
		for (let i = 0, len = moves.length; i < len; i++) if (cleanMove === strippedSan(this._moveToSan(moves[i], moves))) return moves[i];
		if (strict) return null;
		let piece = void 0;
		let matches = void 0;
		let from = void 0;
		let to = void 0;
		let promotion = void 0;
		let overlyDisambiguated = false;
		matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
		if (matches) {
			piece = matches[1];
			from = matches[2];
			to = matches[3];
			promotion = matches[4];
			if (from.length == 1) overlyDisambiguated = true;
		} else {
			matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/);
			if (matches) {
				piece = matches[1];
				from = matches[2];
				to = matches[3];
				promotion = matches[4];
				if (from.length == 1) overlyDisambiguated = true;
			}
		}
		pieceType = inferPieceType(cleanMove);
		moves = this._moves({
			legal: true,
			piece: piece ? piece : pieceType
		});
		if (!to) return null;
		for (let i = 0, len = moves.length; i < len; i++) if (!from) {
			if (cleanMove === strippedSan(this._moveToSan(moves[i], moves)).replace("x", "")) return moves[i];
		} else if ((!piece || piece.toLowerCase() == moves[i].piece) && Ox88[from] == moves[i].from && Ox88[to] == moves[i].to && (!promotion || promotion.toLowerCase() == moves[i].promotion)) return moves[i];
		else if (overlyDisambiguated) {
			const square = algebraic(moves[i].from);
			if ((!piece || piece.toLowerCase() == moves[i].piece) && Ox88[to] == moves[i].to && (from == square[0] || from == square[1]) && (!promotion || promotion.toLowerCase() == moves[i].promotion)) return moves[i];
		}
		return null;
	}
	ascii() {
		let s = "   +------------------------+\n";
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (file(i) === 0) s += " " + "87654321"[rank(i)] + " |";
			if (this._board[i]) {
				const piece = this._board[i].type;
				const symbol = this._board[i].color === "w" ? piece.toUpperCase() : piece.toLowerCase();
				s += " " + symbol + " ";
			} else s += " . ";
			if (i + 1 & 136) {
				s += "|\n";
				i += 8;
			}
		}
		s += "   +------------------------+\n";
		s += "     a  b  c  d  e  f  g  h";
		return s;
	}
	perft(depth) {
		const moves = this._moves({ legal: false });
		let nodes = 0;
		const color = this._turn;
		for (let i = 0, len = moves.length; i < len; i++) {
			this._makeMove(moves[i]);
			if (!this._isKingAttacked(color)) if (depth - 1 > 0) nodes += this.perft(depth - 1);
			else nodes++;
			this._undoMove();
		}
		return nodes;
	}
	setTurn(color) {
		if (this._turn == color) return false;
		this.move("--");
		return true;
	}
	turn() {
		return this._turn;
	}
	board() {
		const output = [];
		let row = [];
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (this._board[i] == null) row.push(null);
			else row.push({
				square: algebraic(i),
				type: this._board[i].type,
				color: this._board[i].color
			});
			if (i + 1 & 136) {
				output.push(row);
				row = [];
				i += 8;
			}
		}
		return output;
	}
	squareColor(square) {
		if (square in Ox88) {
			const sq = Ox88[square];
			return (rank(sq) + file(sq)) % 2 === 0 ? "light" : "dark";
		}
		return null;
	}
	history({ verbose = false } = {}) {
		const reversedHistory = [];
		const moveHistory = [];
		while (this._history.length > 0) reversedHistory.push(this._undoMove());
		while (true) {
			const move = reversedHistory.pop();
			if (!move) break;
			if (verbose) moveHistory.push(new Move(this, move));
			else moveHistory.push(this._moveToSan(move, this._moves()));
			this._makeMove(move);
		}
		return moveHistory;
	}
	_getPositionCount(hash) {
		return this._positionCount.get(hash) ?? 0;
	}
	_incPositionCount() {
		this._positionCount.set(this._hash, (this._positionCount.get(this._hash) ?? 0) + 1);
	}
	_decPositionCount(hash) {
		const currentCount = this._positionCount.get(hash) ?? 0;
		if (currentCount === 1) this._positionCount.delete(hash);
		else this._positionCount.set(hash, currentCount - 1);
	}
	_pruneComments() {
		const reversedHistory = [];
		const currentComments = {};
		const copyComment = (fen) => {
			if (fen in this._comments) currentComments[fen] = this._comments[fen];
		};
		while (this._history.length > 0) reversedHistory.push(this._undoMove());
		copyComment(this.fen());
		while (true) {
			const move = reversedHistory.pop();
			if (!move) break;
			this._makeMove(move);
			copyComment(this.fen());
		}
		this._comments = currentComments;
	}
	getComment() {
		return this._comments[this.fen()];
	}
	setComment(comment) {
		this._comments[this.fen()] = comment.replace("{", "[").replace("}", "]");
	}
	/**
	* @deprecated Renamed to `removeComment` for consistency
	*/
	deleteComment() {
		return this.removeComment();
	}
	removeComment() {
		const comment = this._comments[this.fen()];
		delete this._comments[this.fen()];
		return comment;
	}
	getComments() {
		this._pruneComments();
		return Object.keys(this._comments).map((fen) => {
			return {
				fen,
				comment: this._comments[fen]
			};
		});
	}
	/**
	* @deprecated Renamed to `removeComments` for consistency
	*/
	deleteComments() {
		return this.removeComments();
	}
	removeComments() {
		this._pruneComments();
		return Object.keys(this._comments).map((fen) => {
			const comment = this._comments[fen];
			delete this._comments[fen];
			return {
				fen,
				comment
			};
		});
	}
	setCastlingRights(color, rights) {
		for (const side of ["k", "q"]) if (rights[side] !== void 0) if (rights[side]) this._castling[color] |= SIDES[side];
		else this._castling[color] &= ~SIDES[side];
		this._updateCastlingRights();
		const result = this.getCastlingRights(color);
		return (rights["k"] === void 0 || rights["k"] === result["k"]) && (rights["q"] === void 0 || rights["q"] === result["q"]);
	}
	getCastlingRights(color) {
		return {
			["k"]: (this._castling[color] & SIDES["k"]) !== 0,
			["q"]: (this._castling[color] & SIDES["q"]) !== 0
		};
	}
	moveNumber() {
		return this._moveNumber;
	}
};
//#endregion
//#region node_modules/@badrap/result/dist/mjs/index.mjs
var _Result = class {
	unwrap(ok, err) {
		const r = this._chain((value) => Result.ok(ok ? ok(value) : value), (error) => err ? Result.ok(err(error)) : Result.err(error));
		if (r.isErr) throw r.error;
		return r.value;
	}
	map(ok, err) {
		return this._chain((value) => Result.ok(ok(value)), (error) => Result.err(err ? err(error) : error));
	}
	chain(ok, err) {
		return this._chain(ok, err !== null && err !== void 0 ? err : ((error) => Result.err(error)));
	}
};
var _Ok = class extends _Result {
	constructor(value) {
		super();
		this.value = value;
		this.isOk = true;
		this.isErr = false;
	}
	_chain(ok, _err) {
		return ok(this.value);
	}
};
var _Err = class extends _Result {
	constructor(error) {
		super();
		this.error = error;
		this.isOk = false;
		this.isErr = true;
	}
	_chain(_ok, err) {
		return err(this.error);
	}
};
var Result;
(function(Result) {
	function ok(value) {
		return new _Ok(value);
	}
	Result.ok = ok;
	function err(error) {
		return new _Err(error || /* @__PURE__ */ new Error());
	}
	Result.err = err;
	function all(obj) {
		if (Array.isArray(obj)) {
			const res = [];
			for (let i = 0; i < obj.length; i++) {
				const item = obj[i];
				if (item.isErr) return item;
				res.push(item.value);
			}
			return Result.ok(res);
		}
		const res = {};
		const keys = Object.keys(obj);
		for (let i = 0; i < keys.length; i++) {
			const item = obj[keys[i]];
			if (item.isErr) return item;
			res[keys[i]] = item.value;
		}
		return Result.ok(res);
	}
	Result.all = all;
})(Result || (Result = {}));
//#endregion
//#region node_modules/chessops/dist/esm/squareSet.js
var popcnt32 = (n) => {
	n = n - (n >>> 1 & 1431655765);
	n = (n & 858993459) + (n >>> 2 & 858993459);
	return Math.imul(n + (n >>> 4) & 252645135, 16843009) >> 24;
};
var bswap32 = (n) => {
	n = n >>> 8 & 16711935 | (n & 16711935) << 8;
	return n >>> 16 & 65535 | (n & 65535) << 16;
};
var rbit32 = (n) => {
	n = n >>> 1 & 1431655765 | (n & 1431655765) << 1;
	n = n >>> 2 & 858993459 | (n & 858993459) << 2;
	n = n >>> 4 & 252645135 | (n & 252645135) << 4;
	return bswap32(n);
};
/**
* An immutable set of squares, implemented as a bitboard.
*/
var SquareSet = class SquareSet {
	constructor(lo, hi) {
		this.lo = lo | 0;
		this.hi = hi | 0;
	}
	static fromSquare(square) {
		return square >= 32 ? new SquareSet(0, 1 << square - 32) : new SquareSet(1 << square, 0);
	}
	static fromRank(rank) {
		return new SquareSet(255, 0).shl64(8 * rank);
	}
	static fromFile(file) {
		return new SquareSet(16843009 << file, 16843009 << file);
	}
	static empty() {
		return new SquareSet(0, 0);
	}
	static full() {
		return new SquareSet(4294967295, 4294967295);
	}
	static corners() {
		return new SquareSet(129, 2164260864);
	}
	static center() {
		return new SquareSet(402653184, 24);
	}
	static backranks() {
		return new SquareSet(255, 4278190080);
	}
	static backrank(color) {
		return color === "white" ? new SquareSet(255, 0) : new SquareSet(0, 4278190080);
	}
	static lightSquares() {
		return new SquareSet(1437226410, 1437226410);
	}
	static darkSquares() {
		return new SquareSet(2857740885, 2857740885);
	}
	complement() {
		return new SquareSet(~this.lo, ~this.hi);
	}
	xor(other) {
		return new SquareSet(this.lo ^ other.lo, this.hi ^ other.hi);
	}
	union(other) {
		return new SquareSet(this.lo | other.lo, this.hi | other.hi);
	}
	intersect(other) {
		return new SquareSet(this.lo & other.lo, this.hi & other.hi);
	}
	diff(other) {
		return new SquareSet(this.lo & ~other.lo, this.hi & ~other.hi);
	}
	intersects(other) {
		return this.intersect(other).nonEmpty();
	}
	isDisjoint(other) {
		return this.intersect(other).isEmpty();
	}
	supersetOf(other) {
		return other.diff(this).isEmpty();
	}
	subsetOf(other) {
		return this.diff(other).isEmpty();
	}
	shr64(shift) {
		if (shift >= 64) return SquareSet.empty();
		if (shift >= 32) return new SquareSet(this.hi >>> shift - 32, 0);
		if (shift > 0) return new SquareSet(this.lo >>> shift ^ this.hi << 32 - shift, this.hi >>> shift);
		return this;
	}
	shl64(shift) {
		if (shift >= 64) return SquareSet.empty();
		if (shift >= 32) return new SquareSet(0, this.lo << shift - 32);
		if (shift > 0) return new SquareSet(this.lo << shift, this.hi << shift ^ this.lo >>> 32 - shift);
		return this;
	}
	bswap64() {
		return new SquareSet(bswap32(this.hi), bswap32(this.lo));
	}
	rbit64() {
		return new SquareSet(rbit32(this.hi), rbit32(this.lo));
	}
	minus64(other) {
		const lo = this.lo - other.lo;
		const c = (lo & other.lo & 1) + (other.lo >>> 1) + (lo >>> 1) >>> 31;
		return new SquareSet(lo, this.hi - (other.hi + c));
	}
	equals(other) {
		return this.lo === other.lo && this.hi === other.hi;
	}
	size() {
		return popcnt32(this.lo) + popcnt32(this.hi);
	}
	isEmpty() {
		return this.lo === 0 && this.hi === 0;
	}
	nonEmpty() {
		return this.lo !== 0 || this.hi !== 0;
	}
	has(square) {
		return (square >= 32 ? this.hi & 1 << square - 32 : this.lo & 1 << square) !== 0;
	}
	set(square, on) {
		return on ? this.with(square) : this.without(square);
	}
	with(square) {
		return square >= 32 ? new SquareSet(this.lo, this.hi | 1 << square - 32) : new SquareSet(this.lo | 1 << square, this.hi);
	}
	without(square) {
		return square >= 32 ? new SquareSet(this.lo, this.hi & ~(1 << square - 32)) : new SquareSet(this.lo & ~(1 << square), this.hi);
	}
	toggle(square) {
		return square >= 32 ? new SquareSet(this.lo, this.hi ^ 1 << square - 32) : new SquareSet(this.lo ^ 1 << square, this.hi);
	}
	last() {
		if (this.hi !== 0) return 63 - Math.clz32(this.hi);
		if (this.lo !== 0) return 31 - Math.clz32(this.lo);
	}
	first() {
		if (this.lo !== 0) return 31 - Math.clz32(this.lo & -this.lo);
		if (this.hi !== 0) return 63 - Math.clz32(this.hi & -this.hi);
	}
	withoutFirst() {
		if (this.lo !== 0) return new SquareSet(this.lo & this.lo - 1, this.hi);
		return new SquareSet(0, this.hi & this.hi - 1);
	}
	moreThanOne() {
		return this.hi !== 0 && this.lo !== 0 || (this.lo & this.lo - 1) !== 0 || (this.hi & this.hi - 1) !== 0;
	}
	singleSquare() {
		return this.moreThanOne() ? void 0 : this.last();
	}
	*[Symbol.iterator]() {
		let lo = this.lo;
		let hi = this.hi;
		while (lo !== 0) {
			const idx = 31 - Math.clz32(lo & -lo);
			lo ^= 1 << idx;
			yield idx;
		}
		while (hi !== 0) {
			const idx = 31 - Math.clz32(hi & -hi);
			hi ^= 1 << idx;
			yield 32 + idx;
		}
	}
	*reversed() {
		let lo = this.lo;
		let hi = this.hi;
		while (hi !== 0) {
			const idx = 31 - Math.clz32(hi);
			hi ^= 1 << idx;
			yield 32 + idx;
		}
		while (lo !== 0) {
			const idx = 31 - Math.clz32(lo);
			lo ^= 1 << idx;
			yield idx;
		}
	}
};
//#endregion
//#region node_modules/chessops/dist/esm/types.js
var FILE_NAMES = [
	"a",
	"b",
	"c",
	"d",
	"e",
	"f",
	"g",
	"h"
];
var RANK_NAMES = [
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8"
];
var COLORS = ["white", "black"];
var ROLES = [
	"pawn",
	"knight",
	"bishop",
	"rook",
	"queen",
	"king"
];
var CASTLING_SIDES = ["a", "h"];
var isDrop = (v) => "role" in v;
//#endregion
//#region node_modules/chessops/dist/esm/util.js
var defined = (v) => v !== void 0;
var opposite = (color) => color === "white" ? "black" : "white";
var squareRank = (square) => square >> 3;
var squareFile = (square) => square & 7;
var squareFromCoords = (file, rank) => 0 <= file && file < 8 && 0 <= rank && rank < 8 ? file + 8 * rank : void 0;
var roleToChar = (role) => {
	switch (role) {
		case "pawn": return "p";
		case "knight": return "n";
		case "bishop": return "b";
		case "rook": return "r";
		case "queen": return "q";
		case "king": return "k";
	}
};
function charToRole(ch) {
	switch (ch.toLowerCase()) {
		case "p": return "pawn";
		case "n": return "knight";
		case "b": return "bishop";
		case "r": return "rook";
		case "q": return "queen";
		case "k": return "king";
		default: return;
	}
}
function parseSquare(str) {
	if (str.length !== 2) return;
	return squareFromCoords(str.charCodeAt(0) - "a".charCodeAt(0), str.charCodeAt(1) - "1".charCodeAt(0));
}
var makeSquare = (square) => FILE_NAMES[squareFile(square)] + RANK_NAMES[squareRank(square)];
var parseUci = (str) => {
	if (str[1] === "@" && str.length === 4) {
		const role = charToRole(str[0]);
		const to = parseSquare(str.slice(2));
		if (role && defined(to)) return {
			role,
			to
		};
	} else if (str.length === 4 || str.length === 5) {
		const from = parseSquare(str.slice(0, 2));
		const to = parseSquare(str.slice(2, 4));
		let promotion;
		if (str.length === 5) {
			promotion = charToRole(str[4]);
			if (!promotion) return;
		}
		if (defined(from) && defined(to)) return {
			from,
			to,
			promotion
		};
	}
};
var kingCastlesTo = (color, side) => color === "white" ? side === "a" ? 2 : 6 : side === "a" ? 58 : 62;
var rookCastlesTo = (color, side) => color === "white" ? side === "a" ? 3 : 5 : side === "a" ? 59 : 61;
//#endregion
//#region node_modules/chessops/dist/esm/attacks.js
/**
* Compute attacks and rays.
*
* These are low-level functions that can be used to implement chess rules.
*
* Implementation notes: Sliding attacks are computed using
* [Hyperbola Quintessence](https://www.chessprogramming.org/Hyperbola_Quintessence).
* Magic Bitboards would deliver slightly faster lookups, but also require
* initializing considerably larger attack tables. On the web, initialization
* time is important, so the chosen method may strike a better balance.
*
* @packageDocumentation
*/
var computeRange = (square, deltas) => {
	let range = SquareSet.empty();
	for (const delta of deltas) {
		const sq = square + delta;
		if (0 <= sq && sq < 64 && Math.abs(squareFile(square) - squareFile(sq)) <= 2) range = range.with(sq);
	}
	return range;
};
var tabulate = (f) => {
	const table = [];
	for (let square = 0; square < 64; square++) table[square] = f(square);
	return table;
};
var KING_ATTACKS = tabulate((sq) => computeRange(sq, [
	-9,
	-8,
	-7,
	-1,
	1,
	7,
	8,
	9
]));
var KNIGHT_ATTACKS = tabulate((sq) => computeRange(sq, [
	-17,
	-15,
	-10,
	-6,
	6,
	10,
	15,
	17
]));
var PAWN_ATTACKS = {
	white: tabulate((sq) => computeRange(sq, [7, 9])),
	black: tabulate((sq) => computeRange(sq, [-7, -9]))
};
/**
* Gets squares attacked or defended by a king on `square`.
*/
var kingAttacks = (square) => KING_ATTACKS[square];
/**
* Gets squares attacked or defended by a knight on `square`.
*/
var knightAttacks = (square) => KNIGHT_ATTACKS[square];
/**
* Gets squares attacked or defended by a pawn of the given `color`
* on `square`.
*/
var pawnAttacks = (color, square) => PAWN_ATTACKS[color][square];
var FILE_RANGE = tabulate((sq) => SquareSet.fromFile(squareFile(sq)).without(sq));
var RANK_RANGE = tabulate((sq) => SquareSet.fromRank(squareRank(sq)).without(sq));
var DIAG_RANGE = tabulate((sq) => {
	const diag = new SquareSet(134480385, 2151686160);
	const shift = 8 * (squareRank(sq) - squareFile(sq));
	return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});
var ANTI_DIAG_RANGE = tabulate((sq) => {
	const diag = new SquareSet(270549120, 16909320);
	const shift = 8 * (squareRank(sq) + squareFile(sq) - 7);
	return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});
var hyperbola = (sq, range, occupied) => {
	const o = range.intersect(occupied);
	const fwd = o.minus64(SquareSet.fromSquare(sq));
	const rev = o.bswap64().minus64(SquareSet.fromSquare(56 ^ sq));
	return fwd.xor(rev.bswap64()).intersect(range);
};
var rankAttacks = (sq, occupied) => {
	const range = RANK_RANGE[sq];
	const o = range.intersect(occupied);
	const fwd = o.minus64(SquareSet.fromSquare(sq));
	const rev = o.rbit64().minus64(SquareSet.fromSquare(63 - sq));
	return fwd.xor(rev.rbit64()).intersect(range);
};
/**
* Gets squares attacked or defended by a bishop on `square`, given `occupied`
* squares.
*/
var bishopAttacks = (square, occupied) => {
	return hyperbola(square, DIAG_RANGE[square], occupied).xor(hyperbola(square, ANTI_DIAG_RANGE[square], occupied));
};
/**
* Gets squares attacked or defended by a rook on `square`, given `occupied`
* squares.
*/
var rookAttacks = (square, occupied) => hyperbola(square, FILE_RANGE[square], occupied).xor(rankAttacks(square, occupied));
/**
* Gets squares attacked or defended by a queen on `square`, given `occupied`
* squares.
*/
var queenAttacks = (square, occupied) => bishopAttacks(square, occupied).xor(rookAttacks(square, occupied));
/**
* Gets squares attacked or defended by a `piece` on `square`, given
* `occupied` squares.
*/
var attacks = (piece, square, occupied) => {
	switch (piece.role) {
		case "pawn": return pawnAttacks(piece.color, square);
		case "knight": return knightAttacks(square);
		case "bishop": return bishopAttacks(square, occupied);
		case "rook": return rookAttacks(square, occupied);
		case "queen": return queenAttacks(square, occupied);
		case "king": return kingAttacks(square);
	}
};
/**
* Gets all squares of the rank, file or diagonal with the two squares
* `a` and `b`, or an empty set if they are not aligned.
*/
var ray = (a, b) => {
	const other = SquareSet.fromSquare(b);
	if (RANK_RANGE[a].intersects(other)) return RANK_RANGE[a].with(a);
	if (ANTI_DIAG_RANGE[a].intersects(other)) return ANTI_DIAG_RANGE[a].with(a);
	if (DIAG_RANGE[a].intersects(other)) return DIAG_RANGE[a].with(a);
	if (FILE_RANGE[a].intersects(other)) return FILE_RANGE[a].with(a);
	return SquareSet.empty();
};
/**
* Gets all squares between `a` and `b` (bounds not included), or an empty set
* if they are not on the same rank, file or diagonal.
*/
var between = (a, b) => ray(a, b).intersect(SquareSet.full().shl64(a).xor(SquareSet.full().shl64(b))).withoutFirst();
//#endregion
//#region node_modules/chessops/dist/esm/board.js
/**
* Piece positions on a board.
*
* Properties are sets of squares, like `board.occupied` for all occupied
* squares, `board[color]` for all pieces of that color, and `board[role]`
* for all pieces of that role. When modifying the properties directly, take
* care to keep them consistent.
*/
var Board = class Board {
	constructor() {}
	static default() {
		const board = new Board();
		board.reset();
		return board;
	}
	/**
	* Resets all pieces to the default starting position for standard chess.
	*/
	reset() {
		this.occupied = new SquareSet(65535, 4294901760);
		this.promoted = SquareSet.empty();
		this.white = new SquareSet(65535, 0);
		this.black = new SquareSet(0, 4294901760);
		this.pawn = new SquareSet(65280, 16711680);
		this.knight = new SquareSet(66, 1107296256);
		this.bishop = new SquareSet(36, 603979776);
		this.rook = new SquareSet(129, 2164260864);
		this.queen = new SquareSet(8, 134217728);
		this.king = new SquareSet(16, 268435456);
	}
	static empty() {
		const board = new Board();
		board.clear();
		return board;
	}
	clear() {
		this.occupied = SquareSet.empty();
		this.promoted = SquareSet.empty();
		for (const color of COLORS) this[color] = SquareSet.empty();
		for (const role of ROLES) this[role] = SquareSet.empty();
	}
	clone() {
		const board = new Board();
		board.occupied = this.occupied;
		board.promoted = this.promoted;
		for (const color of COLORS) board[color] = this[color];
		for (const role of ROLES) board[role] = this[role];
		return board;
	}
	getColor(square) {
		if (this.white.has(square)) return "white";
		if (this.black.has(square)) return "black";
	}
	getRole(square) {
		for (const role of ROLES) if (this[role].has(square)) return role;
	}
	get(square) {
		const color = this.getColor(square);
		if (!color) return;
		return {
			color,
			role: this.getRole(square),
			promoted: this.promoted.has(square)
		};
	}
	/**
	* Removes and returns the piece from the given `square`, if any.
	*/
	take(square) {
		const piece = this.get(square);
		if (piece) {
			this.occupied = this.occupied.without(square);
			this[piece.color] = this[piece.color].without(square);
			this[piece.role] = this[piece.role].without(square);
			if (piece.promoted) this.promoted = this.promoted.without(square);
		}
		return piece;
	}
	/**
	* Put `piece` onto `square`, potentially replacing an existing piece.
	* Returns the existing piece, if any.
	*/
	set(square, piece) {
		const old = this.take(square);
		this.occupied = this.occupied.with(square);
		this[piece.color] = this[piece.color].with(square);
		this[piece.role] = this[piece.role].with(square);
		if (piece.promoted) this.promoted = this.promoted.with(square);
		return old;
	}
	has(square) {
		return this.occupied.has(square);
	}
	*[Symbol.iterator]() {
		for (const square of this.occupied) yield [square, this.get(square)];
	}
	pieces(color, role) {
		return this[color].intersect(this[role]);
	}
	rooksAndQueens() {
		return this.rook.union(this.queen);
	}
	bishopsAndQueens() {
		return this.bishop.union(this.queen);
	}
	steppers() {
		return this.knight.union(this.pawn).union(this.king);
	}
	sliders() {
		return this.bishop.union(this.rook).union(this.queen);
	}
	/**
	* Finds the unique king of the given `color`, if any.
	*/
	kingOf(color) {
		return this.pieces(color, "king").singleSquare();
	}
};
//#endregion
//#region node_modules/chessops/dist/esm/chess.js
var IllegalSetup;
(function(IllegalSetup) {
	IllegalSetup["Empty"] = "ERR_EMPTY";
	IllegalSetup["OppositeCheck"] = "ERR_OPPOSITE_CHECK";
	IllegalSetup["PawnsOnBackrank"] = "ERR_PAWNS_ON_BACKRANK";
	IllegalSetup["Kings"] = "ERR_KINGS";
	IllegalSetup["Variant"] = "ERR_VARIANT";
})(IllegalSetup || (IllegalSetup = {}));
var PositionError = class extends Error {};
var attacksTo = (square, attacker, board, occupied) => board[attacker].intersect(rookAttacks(square, occupied).intersect(board.rooksAndQueens()).union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens())).union(knightAttacks(square).intersect(board.knight)).union(kingAttacks(square).intersect(board.king)).union(pawnAttacks(opposite(attacker), square).intersect(board.pawn)));
var Castles = class Castles {
	constructor() {}
	static default() {
		const castles = new Castles();
		castles.castlingRights = SquareSet.corners();
		castles.rook = {
			white: {
				a: 0,
				h: 7
			},
			black: {
				a: 56,
				h: 63
			}
		};
		castles.path = {
			white: {
				a: new SquareSet(14, 0),
				h: new SquareSet(96, 0)
			},
			black: {
				a: new SquareSet(0, 234881024),
				h: new SquareSet(0, 1610612736)
			}
		};
		return castles;
	}
	static empty() {
		const castles = new Castles();
		castles.castlingRights = SquareSet.empty();
		castles.rook = {
			white: {
				a: void 0,
				h: void 0
			},
			black: {
				a: void 0,
				h: void 0
			}
		};
		castles.path = {
			white: {
				a: SquareSet.empty(),
				h: SquareSet.empty()
			},
			black: {
				a: SquareSet.empty(),
				h: SquareSet.empty()
			}
		};
		return castles;
	}
	clone() {
		const castles = new Castles();
		castles.castlingRights = this.castlingRights;
		castles.rook = {
			white: {
				a: this.rook.white.a,
				h: this.rook.white.h
			},
			black: {
				a: this.rook.black.a,
				h: this.rook.black.h
			}
		};
		castles.path = {
			white: {
				a: this.path.white.a,
				h: this.path.white.h
			},
			black: {
				a: this.path.black.a,
				h: this.path.black.h
			}
		};
		return castles;
	}
	add(color, side, king, rook) {
		const kingTo = kingCastlesTo(color, side);
		const rookTo = rookCastlesTo(color, side);
		this.castlingRights = this.castlingRights.with(rook);
		this.rook[color][side] = rook;
		this.path[color][side] = between(rook, rookTo).with(rookTo).union(between(king, kingTo).with(kingTo)).without(king).without(rook);
	}
	static fromSetup(setup) {
		const castles = Castles.empty();
		const rooks = setup.castlingRights.intersect(setup.board.rook);
		for (const color of COLORS) {
			const backrank = SquareSet.backrank(color);
			const king = setup.board.kingOf(color);
			if (!defined(king) || !backrank.has(king)) continue;
			const side = rooks.intersect(setup.board[color]).intersect(backrank);
			const aSide = side.first();
			if (defined(aSide) && aSide < king) castles.add(color, "a", king, aSide);
			const hSide = side.last();
			if (defined(hSide) && king < hSide) castles.add(color, "h", king, hSide);
		}
		return castles;
	}
	discardRook(square) {
		if (this.castlingRights.has(square)) {
			this.castlingRights = this.castlingRights.without(square);
			for (const color of COLORS) for (const side of CASTLING_SIDES) if (this.rook[color][side] === square) this.rook[color][side] = void 0;
		}
	}
	discardColor(color) {
		this.castlingRights = this.castlingRights.diff(SquareSet.backrank(color));
		this.rook[color].a = void 0;
		this.rook[color].h = void 0;
	}
};
var Position = class {
	constructor(rules) {
		this.rules = rules;
	}
	reset() {
		this.board = Board.default();
		this.pockets = void 0;
		this.turn = "white";
		this.castles = Castles.default();
		this.epSquare = void 0;
		this.remainingChecks = void 0;
		this.halfmoves = 0;
		this.fullmoves = 1;
	}
	setupUnchecked(setup) {
		this.board = setup.board.clone();
		this.board.promoted = SquareSet.empty();
		this.pockets = void 0;
		this.turn = setup.turn;
		this.castles = Castles.fromSetup(setup);
		this.epSquare = validEpSquare(this, setup.epSquare);
		this.remainingChecks = void 0;
		this.halfmoves = setup.halfmoves;
		this.fullmoves = setup.fullmoves;
	}
	kingAttackers(square, attacker, occupied) {
		return attacksTo(square, attacker, this.board, occupied);
	}
	playCaptureAt(square, captured) {
		this.halfmoves = 0;
		if (captured.role === "rook") this.castles.discardRook(square);
		if (this.pockets) this.pockets[opposite(captured.color)][captured.promoted ? "pawn" : captured.role]++;
	}
	ctx() {
		const variantEnd = this.isVariantEnd();
		const king = this.board.kingOf(this.turn);
		if (!defined(king)) return {
			king,
			blockers: SquareSet.empty(),
			checkers: SquareSet.empty(),
			variantEnd,
			mustCapture: false
		};
		const snipers = rookAttacks(king, SquareSet.empty()).intersect(this.board.rooksAndQueens()).union(bishopAttacks(king, SquareSet.empty()).intersect(this.board.bishopsAndQueens())).intersect(this.board[opposite(this.turn)]);
		let blockers = SquareSet.empty();
		for (const sniper of snipers) {
			const b = between(king, sniper).intersect(this.board.occupied);
			if (!b.moreThanOne()) blockers = blockers.union(b);
		}
		const checkers = this.kingAttackers(king, opposite(this.turn), this.board.occupied);
		return {
			king,
			blockers,
			checkers,
			variantEnd,
			mustCapture: false
		};
	}
	clone() {
		var _a, _b;
		const pos = new this.constructor();
		pos.board = this.board.clone();
		pos.pockets = (_a = this.pockets) === null || _a === void 0 ? void 0 : _a.clone();
		pos.turn = this.turn;
		pos.castles = this.castles.clone();
		pos.epSquare = this.epSquare;
		pos.remainingChecks = (_b = this.remainingChecks) === null || _b === void 0 ? void 0 : _b.clone();
		pos.halfmoves = this.halfmoves;
		pos.fullmoves = this.fullmoves;
		return pos;
	}
	validate() {
		if (this.board.occupied.isEmpty()) return Result.err(new PositionError(IllegalSetup.Empty));
		if (this.board.king.size() !== 2) return Result.err(new PositionError(IllegalSetup.Kings));
		if (!defined(this.board.kingOf(this.turn))) return Result.err(new PositionError(IllegalSetup.Kings));
		const otherKing = this.board.kingOf(opposite(this.turn));
		if (!defined(otherKing)) return Result.err(new PositionError(IllegalSetup.Kings));
		if (this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) return Result.err(new PositionError(IllegalSetup.OppositeCheck));
		if (SquareSet.backranks().intersects(this.board.pawn)) return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
		return Result.ok(void 0);
	}
	dropDests(_ctx) {
		return SquareSet.empty();
	}
	dests(square, ctx) {
		ctx = ctx || this.ctx();
		if (ctx.variantEnd) return SquareSet.empty();
		const piece = this.board.get(square);
		if (!piece || piece.color !== this.turn) return SquareSet.empty();
		let pseudo, legal;
		if (piece.role === "pawn") {
			pseudo = pawnAttacks(this.turn, square).intersect(this.board[opposite(this.turn)]);
			const delta = this.turn === "white" ? 8 : -8;
			const step = square + delta;
			if (0 <= step && step < 64 && !this.board.occupied.has(step)) {
				pseudo = pseudo.with(step);
				const canDoubleStep = this.turn === "white" ? square < 16 : square >= 48;
				const doubleStep = step + delta;
				if (canDoubleStep && !this.board.occupied.has(doubleStep)) pseudo = pseudo.with(doubleStep);
			}
			if (defined(this.epSquare) && canCaptureEp(this, square, ctx)) legal = SquareSet.fromSquare(this.epSquare);
		} else if (piece.role === "bishop") pseudo = bishopAttacks(square, this.board.occupied);
		else if (piece.role === "knight") pseudo = knightAttacks(square);
		else if (piece.role === "rook") pseudo = rookAttacks(square, this.board.occupied);
		else if (piece.role === "queen") pseudo = queenAttacks(square, this.board.occupied);
		else pseudo = kingAttacks(square);
		pseudo = pseudo.diff(this.board[this.turn]);
		if (defined(ctx.king)) {
			if (piece.role === "king") {
				const occ = this.board.occupied.without(square);
				for (const to of pseudo) if (this.kingAttackers(to, opposite(this.turn), occ).nonEmpty()) pseudo = pseudo.without(to);
				return pseudo.union(castlingDest(this, "a", ctx)).union(castlingDest(this, "h", ctx));
			}
			if (ctx.checkers.nonEmpty()) {
				const checker = ctx.checkers.singleSquare();
				if (!defined(checker)) return SquareSet.empty();
				pseudo = pseudo.intersect(between(checker, ctx.king).with(checker));
			}
			if (ctx.blockers.has(square)) pseudo = pseudo.intersect(ray(square, ctx.king));
		}
		if (legal) pseudo = pseudo.union(legal);
		return pseudo;
	}
	isVariantEnd() {
		return false;
	}
	variantOutcome(_ctx) {}
	hasInsufficientMaterial(color) {
		if (this.board[color].intersect(this.board.pawn.union(this.board.rooksAndQueens())).nonEmpty()) return false;
		if (this.board[color].intersects(this.board.knight)) return this.board[color].size() <= 2 && this.board[opposite(color)].diff(this.board.king).diff(this.board.queen).isEmpty();
		if (this.board[color].intersects(this.board.bishop)) return (!this.board.bishop.intersects(SquareSet.darkSquares()) || !this.board.bishop.intersects(SquareSet.lightSquares())) && this.board.pawn.isEmpty() && this.board.knight.isEmpty();
		return true;
	}
	toSetup() {
		var _a, _b;
		return {
			board: this.board.clone(),
			pockets: (_a = this.pockets) === null || _a === void 0 ? void 0 : _a.clone(),
			turn: this.turn,
			castlingRights: this.castles.castlingRights,
			epSquare: legalEpSquare(this),
			remainingChecks: (_b = this.remainingChecks) === null || _b === void 0 ? void 0 : _b.clone(),
			halfmoves: Math.min(this.halfmoves, 150),
			fullmoves: Math.min(Math.max(this.fullmoves, 1), 9999)
		};
	}
	isInsufficientMaterial() {
		return COLORS.every((color) => this.hasInsufficientMaterial(color));
	}
	hasDests(ctx) {
		ctx = ctx || this.ctx();
		for (const square of this.board[this.turn]) if (this.dests(square, ctx).nonEmpty()) return true;
		return this.dropDests(ctx).nonEmpty();
	}
	isLegal(move, ctx) {
		if (isDrop(move)) {
			if (!this.pockets || this.pockets[this.turn][move.role] <= 0) return false;
			if (move.role === "pawn" && SquareSet.backranks().has(move.to)) return false;
			return this.dropDests(ctx).has(move.to);
		} else {
			if (move.promotion === "pawn") return false;
			if (move.promotion === "king" && this.rules !== "antichess") return false;
			if (!!move.promotion !== (this.board.pawn.has(move.from) && SquareSet.backranks().has(move.to))) return false;
			const dests = this.dests(move.from, ctx);
			return dests.has(move.to) || dests.has(normalizeMove(this, move).to);
		}
	}
	isCheck() {
		const king = this.board.kingOf(this.turn);
		return defined(king) && this.kingAttackers(king, opposite(this.turn), this.board.occupied).nonEmpty();
	}
	isEnd(ctx) {
		if (ctx ? ctx.variantEnd : this.isVariantEnd()) return true;
		return this.isInsufficientMaterial() || !this.hasDests(ctx);
	}
	isCheckmate(ctx) {
		ctx = ctx || this.ctx();
		return !ctx.variantEnd && ctx.checkers.nonEmpty() && !this.hasDests(ctx);
	}
	isStalemate(ctx) {
		ctx = ctx || this.ctx();
		return !ctx.variantEnd && ctx.checkers.isEmpty() && !this.hasDests(ctx);
	}
	outcome(ctx) {
		const variantOutcome = this.variantOutcome(ctx);
		if (variantOutcome) return variantOutcome;
		ctx = ctx || this.ctx();
		if (this.isCheckmate(ctx)) return { winner: opposite(this.turn) };
		else if (this.isInsufficientMaterial() || this.isStalemate(ctx)) return { winner: void 0 };
		else return;
	}
	allDests(ctx) {
		ctx = ctx || this.ctx();
		const d = /* @__PURE__ */ new Map();
		if (ctx.variantEnd) return d;
		for (const square of this.board[this.turn]) d.set(square, this.dests(square, ctx));
		return d;
	}
	play(move) {
		const turn = this.turn;
		const epSquare = this.epSquare;
		const castling = castlingSide(this, move);
		this.epSquare = void 0;
		this.halfmoves += 1;
		if (turn === "black") this.fullmoves += 1;
		this.turn = opposite(turn);
		if (isDrop(move)) {
			this.board.set(move.to, {
				role: move.role,
				color: turn
			});
			if (this.pockets) this.pockets[turn][move.role]--;
			if (move.role === "pawn") this.halfmoves = 0;
		} else {
			const piece = this.board.take(move.from);
			if (!piece) return;
			let epCapture;
			if (piece.role === "pawn") {
				this.halfmoves = 0;
				if (move.to === epSquare) epCapture = this.board.take(move.to + (turn === "white" ? -8 : 8));
				const delta = move.from - move.to;
				if (Math.abs(delta) === 16 && 8 <= move.from && move.from <= 55) this.epSquare = move.from + move.to >> 1;
				if (move.promotion) {
					piece.role = move.promotion;
					piece.promoted = !!this.pockets;
				}
			} else if (piece.role === "rook") this.castles.discardRook(move.from);
			else if (piece.role === "king") {
				if (castling) {
					const rookFrom = this.castles.rook[turn][castling];
					if (defined(rookFrom)) {
						const rook = this.board.take(rookFrom);
						this.board.set(kingCastlesTo(turn, castling), piece);
						if (rook) this.board.set(rookCastlesTo(turn, castling), rook);
					}
				}
				this.castles.discardColor(turn);
			}
			if (!castling) {
				const capture = this.board.set(move.to, piece) || epCapture;
				if (capture) this.playCaptureAt(move.to, capture);
			}
		}
		if (this.remainingChecks) {
			if (this.isCheck()) this.remainingChecks[turn] = Math.max(this.remainingChecks[turn] - 1, 0);
		}
	}
};
var Chess = class extends Position {
	constructor() {
		super("chess");
	}
	static default() {
		const pos = new this();
		pos.reset();
		return pos;
	}
	static fromSetup(setup) {
		const pos = new this();
		pos.setupUnchecked(setup);
		return pos.validate().map((_) => pos);
	}
	clone() {
		return super.clone();
	}
};
var validEpSquare = (pos, square) => {
	if (!defined(square)) return;
	const epRank = pos.turn === "white" ? 5 : 2;
	const forward = pos.turn === "white" ? 8 : -8;
	if (squareRank(square) !== epRank) return;
	if (pos.board.occupied.has(square + forward)) return;
	const pawn = square - forward;
	if (!pos.board.pawn.has(pawn) || !pos.board[opposite(pos.turn)].has(pawn)) return;
	return square;
};
var legalEpSquare = (pos) => {
	if (!defined(pos.epSquare)) return;
	const ctx = pos.ctx();
	const candidates = pos.board.pieces(pos.turn, "pawn").intersect(pawnAttacks(opposite(pos.turn), pos.epSquare));
	for (const candidate of candidates) if (pos.dests(candidate, ctx).has(pos.epSquare)) return pos.epSquare;
};
var canCaptureEp = (pos, pawnFrom, ctx) => {
	if (!defined(pos.epSquare)) return false;
	if (!pawnAttacks(pos.turn, pawnFrom).has(pos.epSquare)) return false;
	if (!defined(ctx.king)) return true;
	const delta = pos.turn === "white" ? 8 : -8;
	const captured = pos.epSquare - delta;
	return pos.kingAttackers(ctx.king, opposite(pos.turn), pos.board.occupied.toggle(pawnFrom).toggle(captured).with(pos.epSquare)).without(captured).isEmpty();
};
var castlingDest = (pos, side, ctx) => {
	if (!defined(ctx.king) || ctx.checkers.nonEmpty()) return SquareSet.empty();
	const rook = pos.castles.rook[pos.turn][side];
	if (!defined(rook)) return SquareSet.empty();
	if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied)) return SquareSet.empty();
	const kingTo = kingCastlesTo(pos.turn, side);
	const kingPath = between(ctx.king, kingTo);
	const occ = pos.board.occupied.without(ctx.king);
	for (const sq of kingPath) if (pos.kingAttackers(sq, opposite(pos.turn), occ).nonEmpty()) return SquareSet.empty();
	const rookTo = rookCastlesTo(pos.turn, side);
	const after = pos.board.occupied.toggle(ctx.king).toggle(rook).toggle(rookTo);
	if (pos.kingAttackers(kingTo, opposite(pos.turn), after).nonEmpty()) return SquareSet.empty();
	return SquareSet.fromSquare(rook);
};
var castlingSide = (pos, move) => {
	if (isDrop(move)) return;
	const delta = move.to - move.from;
	if (Math.abs(delta) !== 2 && !pos.board[pos.turn].has(move.to)) return;
	if (!pos.board.king.has(move.from)) return;
	return delta > 0 ? "h" : "a";
};
var normalizeMove = (pos, move) => {
	const side = castlingSide(pos, move);
	if (!side) return move;
	const rookFrom = pos.castles.rook[pos.turn][side];
	return {
		from: move.from,
		to: defined(rookFrom) ? rookFrom : move.to
	};
};
//#endregion
//#region node_modules/chessops/dist/esm/setup.js
var MaterialSide = class MaterialSide {
	constructor() {}
	static empty() {
		const m = new MaterialSide();
		for (const role of ROLES) m[role] = 0;
		return m;
	}
	static fromBoard(board, color) {
		const m = new MaterialSide();
		for (const role of ROLES) m[role] = board.pieces(color, role).size();
		return m;
	}
	clone() {
		const m = new MaterialSide();
		for (const role of ROLES) m[role] = this[role];
		return m;
	}
	equals(other) {
		return ROLES.every((role) => this[role] === other[role]);
	}
	add(other) {
		const m = new MaterialSide();
		for (const role of ROLES) m[role] = this[role] + other[role];
		return m;
	}
	subtract(other) {
		const m = new MaterialSide();
		for (const role of ROLES) m[role] = this[role] - other[role];
		return m;
	}
	nonEmpty() {
		return ROLES.some((role) => this[role] > 0);
	}
	isEmpty() {
		return !this.nonEmpty();
	}
	hasPawns() {
		return this.pawn > 0;
	}
	hasNonPawns() {
		return this.knight > 0 || this.bishop > 0 || this.rook > 0 || this.queen > 0 || this.king > 0;
	}
	size() {
		return this.pawn + this.knight + this.bishop + this.rook + this.queen + this.king;
	}
};
var Material = class Material {
	constructor(white, black) {
		this.white = white;
		this.black = black;
	}
	static empty() {
		return new Material(MaterialSide.empty(), MaterialSide.empty());
	}
	static fromBoard(board) {
		return new Material(MaterialSide.fromBoard(board, "white"), MaterialSide.fromBoard(board, "black"));
	}
	clone() {
		return new Material(this.white.clone(), this.black.clone());
	}
	equals(other) {
		return this.white.equals(other.white) && this.black.equals(other.black);
	}
	add(other) {
		return new Material(this.white.add(other.white), this.black.add(other.black));
	}
	subtract(other) {
		return new Material(this.white.subtract(other.white), this.black.subtract(other.black));
	}
	count(role) {
		return this.white[role] + this.black[role];
	}
	size() {
		return this.white.size() + this.black.size();
	}
	isEmpty() {
		return this.white.isEmpty() && this.black.isEmpty();
	}
	nonEmpty() {
		return !this.isEmpty();
	}
	hasPawns() {
		return this.white.hasPawns() || this.black.hasPawns();
	}
	hasNonPawns() {
		return this.white.hasNonPawns() || this.black.hasNonPawns();
	}
};
var RemainingChecks = class RemainingChecks {
	constructor(white, black) {
		this.white = white;
		this.black = black;
	}
	static default() {
		return new RemainingChecks(3, 3);
	}
	clone() {
		return new RemainingChecks(this.white, this.black);
	}
	equals(other) {
		return this.white === other.white && this.black === other.black;
	}
};
var InvalidFen;
(function(InvalidFen) {
	InvalidFen["Fen"] = "ERR_FEN";
	InvalidFen["Board"] = "ERR_BOARD";
	InvalidFen["Pockets"] = "ERR_POCKETS";
	InvalidFen["Turn"] = "ERR_TURN";
	InvalidFen["Castling"] = "ERR_CASTLING";
	InvalidFen["EpSquare"] = "ERR_EP_SQUARE";
	InvalidFen["RemainingChecks"] = "ERR_REMAINING_CHECKS";
	InvalidFen["Halfmoves"] = "ERR_HALFMOVES";
	InvalidFen["Fullmoves"] = "ERR_FULLMOVES";
})(InvalidFen || (InvalidFen = {}));
var FenError = class extends Error {};
var nthIndexOf = (haystack, needle, n) => {
	let index = haystack.indexOf(needle);
	while (n-- > 0) {
		if (index === -1) break;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return index;
};
var parseSmallUint = (str) => /^\d{1,4}$/.test(str) ? parseInt(str, 10) : void 0;
var charToPiece = (ch) => {
	const role = charToRole(ch);
	return role && {
		role,
		color: ch.toLowerCase() === ch ? "black" : "white"
	};
};
var parseBoardFen = (boardPart) => {
	const board = Board.empty();
	let rank = 7;
	let file = 0;
	for (let i = 0; i < boardPart.length; i++) {
		const c = boardPart[i];
		if (c === "/" && file === 8) {
			file = 0;
			rank--;
		} else {
			const step = parseInt(c, 10);
			if (step > 0) file += step;
			else {
				if (file >= 8 || rank < 0) return Result.err(new FenError(InvalidFen.Board));
				const square = file + rank * 8;
				const piece = charToPiece(c);
				if (!piece) return Result.err(new FenError(InvalidFen.Board));
				if (boardPart[i + 1] === "~") {
					piece.promoted = true;
					i++;
				}
				board.set(square, piece);
				file++;
			}
		}
	}
	if (rank !== 0 || file !== 8) return Result.err(new FenError(InvalidFen.Board));
	return Result.ok(board);
};
var parsePockets = (pocketPart) => {
	if (pocketPart.length > 64) return Result.err(new FenError(InvalidFen.Pockets));
	const pockets = Material.empty();
	for (const c of pocketPart) {
		const piece = charToPiece(c);
		if (!piece) return Result.err(new FenError(InvalidFen.Pockets));
		pockets[piece.color][piece.role]++;
	}
	return Result.ok(pockets);
};
var parseCastlingFen = (board, castlingPart) => {
	let castlingRights = SquareSet.empty();
	if (castlingPart === "-") return Result.ok(castlingRights);
	for (const c of castlingPart) {
		const lower = c.toLowerCase();
		const color = c === lower ? "black" : "white";
		const rank = color === "white" ? 0 : 7;
		if ("a" <= lower && lower <= "h") castlingRights = castlingRights.with(squareFromCoords(lower.charCodeAt(0) - "a".charCodeAt(0), rank));
		else if (lower === "k" || lower === "q") {
			const rooksAndKings = board[color].intersect(SquareSet.backrank(color)).intersect(board.rook.union(board.king));
			const candidate = lower === "k" ? rooksAndKings.last() : rooksAndKings.first();
			castlingRights = castlingRights.with(defined(candidate) && board.rook.has(candidate) ? candidate : squareFromCoords(lower === "k" ? 7 : 0, rank));
		} else return Result.err(new FenError(InvalidFen.Castling));
	}
	if (COLORS.some((color) => SquareSet.backrank(color).intersect(castlingRights).size() > 2)) return Result.err(new FenError(InvalidFen.Castling));
	return Result.ok(castlingRights);
};
var parseRemainingChecks = (part) => {
	const parts = part.split("+");
	if (parts.length === 3 && parts[0] === "") {
		const white = parseSmallUint(parts[1]);
		const black = parseSmallUint(parts[2]);
		if (!defined(white) || white > 3 || !defined(black) || black > 3) return Result.err(new FenError(InvalidFen.RemainingChecks));
		return Result.ok(new RemainingChecks(3 - white, 3 - black));
	} else if (parts.length === 2) {
		const white = parseSmallUint(parts[0]);
		const black = parseSmallUint(parts[1]);
		if (!defined(white) || white > 3 || !defined(black) || black > 3) return Result.err(new FenError(InvalidFen.RemainingChecks));
		return Result.ok(new RemainingChecks(white, black));
	} else return Result.err(new FenError(InvalidFen.RemainingChecks));
};
var parseFen = (fen) => {
	const parts = fen.split(/[\s_]+/);
	const boardPart = parts.shift();
	let board;
	let pockets = Result.ok(void 0);
	if (boardPart.endsWith("]")) {
		const pocketStart = boardPart.indexOf("[");
		if (pocketStart === -1) return Result.err(new FenError(InvalidFen.Fen));
		board = parseBoardFen(boardPart.slice(0, pocketStart));
		pockets = parsePockets(boardPart.slice(pocketStart + 1, -1));
	} else {
		const pocketStart = nthIndexOf(boardPart, "/", 7);
		if (pocketStart === -1) board = parseBoardFen(boardPart);
		else {
			board = parseBoardFen(boardPart.slice(0, pocketStart));
			pockets = parsePockets(boardPart.slice(pocketStart + 1));
		}
	}
	let turn;
	const turnPart = parts.shift();
	if (!defined(turnPart) || turnPart === "w") turn = "white";
	else if (turnPart === "b") turn = "black";
	else return Result.err(new FenError(InvalidFen.Turn));
	return board.chain((board) => {
		const castlingPart = parts.shift();
		const castlingRights = defined(castlingPart) ? parseCastlingFen(board, castlingPart) : Result.ok(SquareSet.empty());
		const epPart = parts.shift();
		let epSquare;
		if (defined(epPart) && epPart !== "-") {
			epSquare = parseSquare(epPart);
			if (!defined(epSquare)) return Result.err(new FenError(InvalidFen.EpSquare));
		}
		let halfmovePart = parts.shift();
		let earlyRemainingChecks;
		if (defined(halfmovePart) && halfmovePart.includes("+")) {
			earlyRemainingChecks = parseRemainingChecks(halfmovePart);
			halfmovePart = parts.shift();
		}
		const halfmoves = defined(halfmovePart) ? parseSmallUint(halfmovePart) : 0;
		if (!defined(halfmoves)) return Result.err(new FenError(InvalidFen.Halfmoves));
		const fullmovesPart = parts.shift();
		const fullmoves = defined(fullmovesPart) ? parseSmallUint(fullmovesPart) : 1;
		if (!defined(fullmoves)) return Result.err(new FenError(InvalidFen.Fullmoves));
		const remainingChecksPart = parts.shift();
		let remainingChecks = Result.ok(void 0);
		if (defined(remainingChecksPart)) {
			if (defined(earlyRemainingChecks)) return Result.err(new FenError(InvalidFen.RemainingChecks));
			remainingChecks = parseRemainingChecks(remainingChecksPart);
		} else if (defined(earlyRemainingChecks)) remainingChecks = earlyRemainingChecks;
		if (parts.length > 0) return Result.err(new FenError(InvalidFen.Fen));
		return pockets.chain((pockets) => castlingRights.chain((castlingRights) => remainingChecks.map((remainingChecks) => {
			return {
				board,
				pockets,
				turn,
				castlingRights,
				remainingChecks,
				epSquare,
				halfmoves,
				fullmoves: Math.max(1, fullmoves)
			};
		})));
	});
};
var makePiece = (piece) => {
	let r = roleToChar(piece.role);
	if (piece.color === "white") r = r.toUpperCase();
	if (piece.promoted) r += "~";
	return r;
};
var makeBoardFen = (board) => {
	let fen = "";
	let empty = 0;
	for (let rank = 7; rank >= 0; rank--) for (let file = 0; file < 8; file++) {
		const square = file + rank * 8;
		const piece = board.get(square);
		if (!piece) empty++;
		else {
			if (empty > 0) {
				fen += empty;
				empty = 0;
			}
			fen += makePiece(piece);
		}
		if (file === 7) {
			if (empty > 0) {
				fen += empty;
				empty = 0;
			}
			if (rank !== 0) fen += "/";
		}
	}
	return fen;
};
var makePocket = (material) => ROLES.map((role) => roleToChar(role).repeat(material[role])).join("");
var makePockets = (pocket) => makePocket(pocket.white).toUpperCase() + makePocket(pocket.black);
var makeCastlingFen = (board, castlingRights) => {
	let fen = "";
	for (const color of COLORS) {
		const backrank = SquareSet.backrank(color);
		let king = board.kingOf(color);
		if (defined(king) && !backrank.has(king)) king = void 0;
		const candidates = board.pieces(color, "rook").intersect(backrank);
		for (const rook of castlingRights.intersect(backrank).reversed()) if (rook === candidates.first() && defined(king) && rook < king) fen += color === "white" ? "Q" : "q";
		else if (rook === candidates.last() && defined(king) && king < rook) fen += color === "white" ? "K" : "k";
		else {
			const file = FILE_NAMES[squareFile(rook)];
			fen += color === "white" ? file.toUpperCase() : file;
		}
	}
	return fen || "-";
};
var makeRemainingChecks = (checks) => `${checks.white}+${checks.black}`;
var makeFen = (setup, opts) => [
	makeBoardFen(setup.board) + (setup.pockets ? `[${makePockets(setup.pockets)}]` : ""),
	setup.turn[0],
	makeCastlingFen(setup.board, setup.castlingRights),
	defined(setup.epSquare) ? makeSquare(setup.epSquare) : "-",
	...setup.remainingChecks ? [makeRemainingChecks(setup.remainingChecks)] : [],
	...(opts === null || opts === void 0 ? void 0 : opts.epd) ? [] : [Math.max(0, Math.min(setup.halfmoves, 9999)), Math.max(1, Math.min(setup.fullmoves, 9999))]
].join(" ");
//#endregion
//#region node_modules/chessops/dist/esm/san.js
var makeSanWithoutSuffix = (pos, move) => {
	let san = "";
	if (isDrop(move)) {
		if (move.role !== "pawn") san = roleToChar(move.role).toUpperCase();
		san += "@" + makeSquare(move.to);
	} else {
		const role = pos.board.getRole(move.from);
		if (!role) return "--";
		if (role === "king" && (pos.board[pos.turn].has(move.to) || Math.abs(move.to - move.from) === 2)) san = move.to > move.from ? "O-O" : "O-O-O";
		else {
			const capture = pos.board.occupied.has(move.to) || role === "pawn" && squareFile(move.from) !== squareFile(move.to);
			if (role !== "pawn") {
				san = roleToChar(role).toUpperCase();
				let others;
				if (role === "king") others = kingAttacks(move.to).intersect(pos.board.king);
				else if (role === "queen") others = queenAttacks(move.to, pos.board.occupied).intersect(pos.board.queen);
				else if (role === "rook") others = rookAttacks(move.to, pos.board.occupied).intersect(pos.board.rook);
				else if (role === "bishop") others = bishopAttacks(move.to, pos.board.occupied).intersect(pos.board.bishop);
				else others = knightAttacks(move.to).intersect(pos.board.knight);
				others = others.intersect(pos.board[pos.turn]).without(move.from);
				if (others.nonEmpty()) {
					const ctx = pos.ctx();
					for (const from of others) if (!pos.dests(from, ctx).has(move.to)) others = others.without(from);
					if (others.nonEmpty()) {
						let row = false;
						let column = others.intersects(SquareSet.fromRank(squareRank(move.from)));
						if (others.intersects(SquareSet.fromFile(squareFile(move.from)))) row = true;
						else column = true;
						if (column) san += FILE_NAMES[squareFile(move.from)];
						if (row) san += RANK_NAMES[squareRank(move.from)];
					}
				}
			} else if (capture) san = FILE_NAMES[squareFile(move.from)];
			if (capture) san += "x";
			san += makeSquare(move.to);
			if (move.promotion) san += "=" + roleToChar(move.promotion).toUpperCase();
		}
	}
	return san;
};
var makeSanAndPlay = (pos, move) => {
	var _a;
	const san = makeSanWithoutSuffix(pos, move);
	pos.play(move);
	if ((_a = pos.outcome()) === null || _a === void 0 ? void 0 : _a.winner) return san + "#";
	if (pos.isCheck()) return san + "+";
	return san;
};
var makeSan = (pos, move) => makeSanAndPlay(pos.clone(), move);
var parseSan = (pos, san) => {
	const ctx = pos.ctx();
	const match = san.match(/^([NBRQK])?([a-h])?([1-8])?[-x]?([a-h][1-8])(?:=?([nbrqkNBRQK]))?[+#]?$/);
	if (!match) {
		let castlingSide;
		if (san === "O-O" || san === "O-O+" || san === "O-O#") castlingSide = "h";
		else if (san === "O-O-O" || san === "O-O-O+" || san === "O-O-O#") castlingSide = "a";
		if (castlingSide) {
			const rook = pos.castles.rook[pos.turn][castlingSide];
			if (!defined(ctx.king) || !defined(rook) || !pos.dests(ctx.king, ctx).has(rook)) return;
			return {
				from: ctx.king,
				to: rook
			};
		}
		const match = san.match(/^([pnbrqkPNBRQK])?@([a-h][1-8])[+#]?$/);
		if (!match) return;
		const move = {
			role: match[1] ? charToRole(match[1]) : "pawn",
			to: parseSquare(match[2])
		};
		return pos.isLegal(move, ctx) ? move : void 0;
	}
	const role = match[1] ? charToRole(match[1]) : "pawn";
	const to = parseSquare(match[4]);
	const promotion = match[5] ? charToRole(match[5]) : void 0;
	if (!!promotion !== (role === "pawn" && SquareSet.backranks().has(to))) return;
	if (promotion === "king" && pos.rules !== "antichess") return;
	let candidates = pos.board.pieces(pos.turn, role);
	if (role === "pawn" && !match[2]) candidates = candidates.intersect(SquareSet.fromFile(squareFile(to)));
	else if (match[2]) candidates = candidates.intersect(SquareSet.fromFile(match[2].charCodeAt(0) - "a".charCodeAt(0)));
	if (match[3]) candidates = candidates.intersect(SquareSet.fromRank(match[3].charCodeAt(0) - "1".charCodeAt(0)));
	const pawnAdvance = role === "pawn" ? SquareSet.fromFile(squareFile(to)) : SquareSet.empty();
	candidates = candidates.intersect(pawnAdvance.union(attacks({
		color: opposite(pos.turn),
		role
	}, to, pos.board.occupied)));
	let from;
	for (const candidate of candidates) if (pos.dests(candidate, ctx).has(to)) {
		if (defined(from)) return;
		from = candidate;
	}
	if (!defined(from)) return;
	return {
		from,
		to,
		promotion
	};
};
//#endregion
//#region lib/watch-rules.ts
/** Lichess's rules, including king-to-rook castling input in Chess960. */
var Chess960Board = class {
	constructor(fen) {
		this.position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
	}
	fen() {
		return makeFen(this.position.toSetup());
	}
	turn() {
		return this.position.turn === "white" ? "w" : "b";
	}
	get(square) {
		const s = parseSquare(square), piece = this.position.board.get(s);
		return piece && {
			type: roleToChar(piece.role),
			color: piece.color === "white" ? "w" : "b"
		};
	}
	isGameOver() {
		return this.position.isEnd();
	}
	isCheckmate() {
		return this.position.isCheckmate();
	}
	isDraw() {
		return !!this.position.outcome() && !this.position.outcome()?.winner;
	}
	describe(move) {
		const side = castlingSide(this.position, move);
		return {
			from: makeSquare(move.from),
			to: makeSquare(move.to),
			landing: makeSquare(side ? kingCastlesTo(this.position.turn, side) : move.to),
			promotion: move.promotion ? roleToChar(move.promotion) : void 0,
			color: this.turn(),
			san: makeSan(this.position, move),
			before: this.fen()
		};
	}
	moves({ square }) {
		const from = parseSquare(square), piece = this.position.board.get(from);
		if (!piece || piece.color !== this.position.turn) return [];
		const choices = [];
		for (const to of this.position.dests(from)) {
			const promotions = piece.role === "pawn" && (to < 8 || to >= 56) ? [
				"queen",
				"rook",
				"bishop",
				"knight"
			] : [void 0];
			for (const promotion of promotions) choices.push(this.describe({
				from,
				to,
				...promotion ? { promotion } : {}
			}));
		}
		return choices;
	}
	move(text) {
		const move = parseUci(text) || parseSan(this.position, text);
		if (!move || !("from" in move) || !this.position.isLegal(move)) throw Error("Illegal Chess960 move.");
		const detail = this.describe(move);
		makeSanAndPlay(this.position, move);
		return {
			...detail,
			after: this.fen(),
			to: detail.landing
		};
	}
};
//#endregion
//#region lib/position.ts
var PIECE_NAMES$1 = {
	k: "king",
	q: "queen",
	b: "bishop",
	n: "knight",
	r: "rook",
	p: "pawn"
};
function parsePosition(raw, variant = "standard") {
	let fen = raw.trim().replace(/\s+/g, " ");
	if (fen.split(" ").length === 1) fen += " w - - 0 1";
	if (variant === "chess960") {
		const board = new Chess960Board(fen);
		const pieces = [...board.position.board].map(([square, p]) => ({
			name: p.role,
			side: p.color === "white" ? "w" : "b",
			square: makeSquare(square),
			x: (square % 8 - 3.5) * .055,
			z: (3.5 - Math.floor(square / 8)) * .055
		}));
		return {
			fen: board.fen(),
			turn: board.turn(),
			pieces,
			move: board.position.fullmoves
		};
	}
	const validation = validateFen(fen);
	if (!validation.ok) throw new Error(validation.error?.replace(/^Invalid FEN: /, "") || "Check the FEN and try again.");
	const chess = new Chess$1(fen);
	const pieces = [];
	for (const row of chess.board()) for (const p of row) if (p) {
		const file = p.square.charCodeAt(0) - 97;
		const rank = Number(p.square[1]) - 1;
		pieces.push({
			name: PIECE_NAMES$1[p.type],
			side: p.color,
			square: p.square,
			x: (file - 3.5) * .055,
			z: (3.5 - rank) * .055
		});
	}
	return {
		fen,
		turn: chess.turn(),
		pieces,
		move: Number(fen.split(" ")[5])
	};
}
//#endregion
//#region lib/practice.ts
function gameAt(line) {
	const game = new Chess$1(line.startFen);
	for (const move of line.moves.slice(0, line.cursor)) game.move(move);
	return game;
}
//#endregion
//#region lib/piece-lighting.ts
var PIECE_LIGHT_PRESETS = [
	{
		id: "studio",
		label: "Studio",
		direction: [
			-.7,
			.8,
			1
		],
		color: "#fff0db",
		fill: .28
	},
	{
		id: "side",
		label: "Side light",
		direction: [
			1,
			.3,
			.1
		],
		color: "#ffe5c2",
		fill: .08
	},
	{
		id: "soft",
		label: "Soft",
		direction: [
			-.5,
			1.2,
			.8
		],
		color: "#f4eee5",
		fill: .5
	},
	{
		id: "window",
		label: "North window",
		direction: [
			-1,
			1,
			.4
		],
		color: "#ecf2ff",
		fill: .4
	},
	{
		id: "evening",
		label: "Evening",
		direction: [
			-1,
			.45,
			.6
		],
		color: "#edbb87",
		fill: .08
	},
	{
		id: "carving",
		label: "Carving study",
		direction: [
			1,
			.25,
			.3
		],
		color: "#f3e9da",
		fill: .12
	},
	{
		id: "gallery",
		label: "Gallery softboxes",
		direction: [
			-.9,
			.85,
			-.45
		],
		color: "#f2ebe2",
		fill: .36
	},
	{
		id: "ebony",
		label: "Ebony study",
		direction: [
			-1,
			.7,
			-.8
		],
		color: "#e4edfa",
		fill: .18
	},
	{
		id: "night",
		label: "Night rim",
		direction: [
			.5,
			.4,
			-1
		],
		color: "#91baff",
		fill: .06
	}
];
var DEFAULT_PIECE_LIGHT = {
	preset: "studio",
	intensity: 0
};
//#endregion
//#region lib/appearance.ts
var PIECE_FINISHES = [
	{
		id: "burl",
		label: "Maple / walnut burl",
		light: "#c4a477",
		dark: "#55331f",
		surface: "wood",
		grainPattern: "burl"
	},
	{
		id: "cocobolo",
		label: "Boxwood / cocobolo",
		light: "#cba56b",
		dark: "#6b2817",
		surface: "wood",
		grainPattern: "ribbon"
	},
	{
		id: "birdseye",
		label: "Birdseye maple / ebony",
		light: "#ceb78c",
		dark: "#241c16",
		surface: "wood",
		grainPattern: "birdseye"
	},
	{
		id: "padauk",
		label: "Ash / African padauk",
		light: "#b9ab8d",
		dark: "#8b3a22",
		surface: "wood",
		grainPattern: "ribbon"
	},
	{
		id: "classic-v2",
		label: "Boxwood / ebony v2",
		light: "#cba56b",
		dark: "#211a13",
		surface: "wood"
	},
	{
		id: "classic",
		label: "Boxwood / ebony",
		light: "#cba56b",
		dark: "#211a13",
		surface: "wood"
	},
	{
		id: "walnut",
		label: "Walnut / ebony",
		light: "#986039",
		dark: "#17120e",
		surface: "wood"
	},
	{
		id: "rosewood",
		label: "Maple / rosewood",
		light: "#dfbf8e",
		dark: "#4b1811",
		surface: "wood"
	},
	{
		id: "ivory",
		label: "Ivory / obsidian",
		light: "#dedbd1",
		dark: "#080d12",
		surface: "ceramic"
	},
	{
		id: "jade",
		label: "Porcelain / jade",
		light: "#d9dfd0",
		dark: "#13503e",
		surface: "stone"
	},
	{
		id: "bronze",
		label: "Silver / bronze",
		light: "#bec7c9",
		dark: "#7d4321",
		surface: "metal"
	},
	{
		id: "honey",
		label: "Honey oak / ebony",
		light: "#b68749",
		dark: "#1a160f",
		surface: "wood"
	},
	{
		id: "mahogany",
		label: "Maple / mahogany",
		light: "#c8b18a",
		dark: "#71351f",
		surface: "wood"
	},
	{
		id: "olive",
		label: "Olivewood / wenge",
		light: "#aea06a",
		dark: "#302519",
		surface: "wood"
	}
];
var BOARD_FINISHES = [
	{
		id: "burl",
		label: "Walnut burl",
		light: "#bda17c",
		dark: "#523322",
		frame: "#302015",
		surface: "wood",
		grainPattern: "burl"
	},
	{
		id: "cocobolo",
		label: "Cocobolo & maple",
		light: "#c4ac83",
		dark: "#6b2f20",
		frame: "#3c1b12",
		surface: "wood",
		grainPattern: "ribbon"
	},
	{
		id: "birdseye",
		label: "Birdseye maple",
		light: "#c9b58f",
		dark: "#594535",
		frame: "#32271e",
		surface: "wood",
		grainPattern: "birdseye"
	},
	{
		id: "graphite",
		label: "Graphite & chalk",
		light: "#b6b9b6",
		dark: "#182020",
		frame: "#101616",
		surface: "ceramic"
	},
	{
		id: "midnight",
		label: "Midnight ceramic",
		light: "#b1bac7",
		dark: "#142438",
		frame: "#101b2b",
		surface: "ceramic"
	},
	{
		id: "travertine",
		label: "Travertine & basalt",
		light: "#b0a18b",
		dark: "#2a2a28",
		frame: "#1c1e1c",
		surface: "stone"
	},
	{
		id: "walnut",
		label: "Smoked walnut",
		light: "#af9061",
		dark: "#422315",
		frame: "#28150d",
		surface: "wood"
	},
	{
		id: "ebony",
		label: "Ebony & maple",
		light: "#c8b089",
		dark: "#0c0a08",
		frame: "#080706",
		surface: "wood"
	},
	{
		id: "rosewood",
		label: "Rosewood",
		light: "#b39b77",
		dark: "#48170f",
		frame: "#2d0d09",
		surface: "wood"
	},
	{
		id: "marble",
		label: "Black marble",
		light: "#b9b9b2",
		dark: "#121715",
		frame: "#0b1110",
		surface: "stone"
	},
	{
		id: "oak",
		label: "Honey oak",
		light: "#bda271",
		dark: "#72502d",
		frame: "#3c2819",
		surface: "wood"
	},
	{
		id: "olive",
		label: "Olivewood",
		light: "#b8ac7b",
		dark: "#4e5030",
		frame: "#30301c",
		surface: "wood"
	},
	{
		id: "cherry",
		label: "Cherry",
		light: "#c6a17f",
		dark: "#743d2c",
		frame: "#3c201a",
		surface: "wood"
	},
	{
		id: "club",
		label: "Club green",
		light: "#c8c9ab",
		dark: "#285249",
		frame: "#15382e",
		surface: "wood"
	},
	{
		id: "slate",
		label: "Slate blue",
		light: "#bac1c5",
		dark: "#344c63",
		frame: "#1b2b39",
		surface: "wood"
	},
	{
		id: "burgundy",
		label: "Burgundy",
		light: "#c7b79c",
		dark: "#652e39",
		frame: "#351921",
		surface: "wood"
	}
];
var LIGHT_PRESETS = [
	{
		id: "studio",
		label: "Studio",
		description: "Balanced wood & ebony",
		brightness: 82,
		rig: {
			key: 100,
			fill: 12,
			rim: 85,
			reflections: 60,
			direction: -50,
			height: 48,
			warmth: 35,
			softness: 65
		}
	},
	{
		id: "side",
		label: "Side light",
		description: "Deep directional shadows",
		brightness: 80,
		rig: {
			key: 108,
			fill: 5,
			rim: 115,
			reflections: 45,
			direction: -85,
			height: 27,
			warmth: 35,
			softness: 45
		}
	},
	{
		id: "soft",
		label: "Soft",
		description: "Gentle curves & reflections",
		brightness: 80,
		rig: {
			key: 80,
			fill: 28,
			rim: 70,
			reflections: 75,
			direction: -45,
			height: 52,
			warmth: 25,
			softness: 90
		}
	},
	{
		id: "window",
		label: "North window",
		description: "Cool, natural wood tones",
		brightness: 80,
		rig: {
			key: 88,
			fill: 20,
			rim: 50,
			reflections: 68,
			direction: 45,
			height: 38,
			warmth: 5,
			softness: 85
		}
	},
	{
		id: "evening",
		label: "Evening",
		description: "Warm, restrained highlights",
		brightness: 74,
		rig: {
			key: 85,
			fill: 8,
			rim: 55,
			reflections: 45,
			direction: -65,
			height: 32,
			warmth: 90,
			softness: 70
		}
	},
	{
		id: "carving",
		label: "Carving study",
		description: "Low light across the grooves",
		brightness: 80,
		rig: {
			key: 100,
			fill: 10,
			rim: 100,
			reflections: 52,
			direction: 75,
			height: 20,
			warmth: 20,
			softness: 30
		}
	},
	{
		id: "gallery",
		label: "Gallery softboxes",
		description: "Sculpture with a soft edge",
		brightness: 78,
		rig: {
			key: 92,
			fill: 9,
			rim: 112,
			reflections: 48,
			direction: -65,
			height: 40,
			warmth: 20,
			softness: 80
		}
	},
	{
		id: "ebony",
		label: "Ebony study",
		description: "Deep body, readable edges",
		brightness: 80,
		rig: {
			key: 98,
			fill: 8,
			rim: 135,
			reflections: 38,
			direction: -75,
			height: 42,
			warmth: 15,
			softness: 60
		}
	}
];
({ ...DEFAULT_PIECE_LIGHT }), PIECE_FINISHES.find((p) => p.id === "classic-v2"), BOARD_FINISHES.find((p) => p.id === "graphite"), { ...LIGHT_PRESETS[0].rig };
//#endregion
//#region lib/view-settings.ts
var PIECE_NAMES = [
	"king",
	"queen",
	"bishop",
	"knight",
	"rook",
	"pawn"
];
//#endregion
//#region lib/piece-motion.ts
var PIECE_MOTION_OPTIONS = [
	{
		ms: 0,
		label: "Off · instant"
	},
	{
		ms: 60,
		label: "Extra quick · 0.06s"
	},
	{
		ms: 100,
		label: "Quick · 0.10s"
	},
	{
		ms: 150,
		label: "Gentle · 0.15s"
	}
];
function isPieceMotionMs(value) {
	return PIECE_MOTION_OPTIONS.some((option) => option.ms === value);
}
//#endregion
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
//#endregion
//#region lib/clock-3d-settings.ts
var CLOCK_LIGHTS = [
	"Studio",
	"Side",
	"Daylight",
	"Warm",
	"Night"
];
function validClock3DViews(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.entries(value).every(([model, view]) => {
		if (!["dgt-3000", "zmf-pro"].includes(model) || !view || typeof view !== "object" || Array.isArray(view)) return false;
		const clean = readClock3DView(view);
		return Object.keys(view).length === Object.keys(clean).length - (view.vertical === void 0 ? 1 : 0) && Object.entries(clean).every(([key, setting]) => key === "vertical" && view[key] === void 0 ? true : view[key] === setting);
	});
}
var DEFAULT_CLOCK_3D = {
	yaw: -18,
	tilt: 20,
	zoom: 100,
	vertical: 0,
	light: "Studio",
	intensity: 100,
	fill: 35
};
function readClock3DView(value) {
	const v = value && typeof value === "object" ? value : {};
	const num = (key, min, max) => typeof v[key] === "number" && Number.isFinite(v[key]) ? Math.max(min, Math.min(max, v[key])) : DEFAULT_CLOCK_3D[key];
	return {
		...typeof v.dockX === "number" && Number.isFinite(v.dockX) && typeof v.dockY === "number" && Number.isFinite(v.dockY) ? {
			dockX: Math.max(-1e4, Math.min(1e4, v.dockX)),
			dockY: Math.max(-1e4, Math.min(1e4, v.dockY))
		} : {},
		...typeof v.fullscreenX === "number" && Number.isFinite(v.fullscreenX) && typeof v.fullscreenY === "number" && Number.isFinite(v.fullscreenY) ? {
			fullscreenX: Math.max(0, Math.min(100, v.fullscreenX)),
			fullscreenY: Math.max(0, Math.min(100, v.fullscreenY))
		} : {},
		yaw: num("yaw", -180, 180),
		tilt: num("tilt", -10, 80),
		zoom: num("zoom", 65, 510),
		vertical: num("vertical", -20, 40),
		light: CLOCK_LIGHTS.includes(v.light) ? v.light : DEFAULT_CLOCK_3D.light,
		intensity: num("intensity", 15, 220),
		fill: num("fill", 0, 150)
	};
}
//#endregion
//#region lib/clock-layout.ts
function isClockLayoutKey(value) {
	return typeof value === "string" && /^(fullscreen:(2d|3d)|window:(2d|3d):(left|right):(open|closed):(open|closed))$/.test(value);
}
function validClockLayouts(value) {
	return !!value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([key, views]) => isClockLayoutKey(key) && validClock3DViews(views));
}
//#endregion
//#region lib/saved-layout.ts
var finite = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
function validWorkspaceLayout(v) {
	const s = v;
	return !!s && [
		"left",
		"right",
		"dividers"
	].every((k) => typeof s[k] === "boolean") && (s.ratio === null || finite(s.ratio, .01, .99)) && (s.sideWidth === null || finite(s.sideWidth, 0, 560)) && finite(s.squareScale, .35, 1);
}
function validBoardLayout(v) {
	const s = v, vector = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, -9.999, 9.999));
	return !!s && [
		"3d",
		"classic",
		"materials"
	].includes(s.display) && ["white", "black"].includes(s.orientation) && ["orbit", "pan"].includes(s.navigation) && !!s.camera && vector(s.camera.position) && vector(s.camera.target) && (s.camera.autoFraming == null || typeof s.camera.autoFraming === "boolean") && finite(s.flatScale, 35, 100) && finite(s.flatPan, -50, 50) && finite(s.flatPanY, -50, 50);
}
function validSavedLayout(v) {
	const s = v;
	return !!s && typeof s.expanded === "boolean" && (s.window == null || validBoardLayout(s.window)) && (s.fullscreen == null || validBoardLayout(s.fullscreen)) && (s.workspace == null || validWorkspaceLayout(s.workspace));
}
//#endregion
//#region lib/flip-camera.ts
function cameraFacesBlack(camera) {
	return camera.position[2] < camera.target[2];
}
//#endregion
//#region lib/saved-view.ts
function savedViewId(id) {
	if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Choose a saved view to delete.");
	return id;
}
function savedBoardDisplay(saved) {
	return saved.boardDisplay ?? (/^2d/i.test(saved.name.trim()) ? saved.viewing?.flatStyle || "classic" : "3d");
}
function savedBoardOrientation(saved) {
	return saved.boardOrientation ?? (cameraFacesBlack(saved.camera) ? "black" : "white");
}
function validateView(raw) {
	const s = raw;
	if (s?.layout != null && !validSavedLayout(s.layout)) throw new Error("Invalid saved board layout.");
	if (s?.analysisDisplay != null && ![
		"off",
		"lines",
		"evaluation"
	].includes(s.analysisDisplay)) throw new Error("Invalid analysis display.");
	if (s?.showGraph != null && typeof s.showGraph !== "boolean") throw new Error("Invalid graph visibility.");
	if (s?.cameraDefaultRevision != null && (typeof s.cameraDefaultRevision !== "string" || s.cameraDefaultRevision.length > 80)) throw new Error("Invalid camera default revision.");
	if (!s || typeof s.name !== "string" || !s.name.trim() || s.name.length > 80 || !["studio", "board"].includes(s.mode) || ![
		"king",
		"queen",
		"bishop",
		"knight",
		"rook",
		"pawn"
	].includes(s.piece)) throw new Error("Choose a name for this view.");
	if (s.boardDisplay != null && ![
		"3d",
		"classic",
		"materials"
	].includes(s.boardDisplay) || s.boardOrientation != null && !["white", "black"].includes(s.boardOrientation)) throw new Error("Invalid board display.");
	parsePosition(s.fen);
	const v = (x) => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 10);
	if (!s.camera || !v(s.camera.position) || !v(s.camera.target) || s.camera.autoFraming != null && typeof s.camera.autoFraming !== "boolean") throw new Error("The camera view could not be saved.");
	if (!s.line || !Array.isArray(s.line.moves) || s.line.moves.length > 5e3 || !Number.isInteger(s.line.cursor) || s.line.cursor < 0 || s.line.cursor > s.line.moves.length) throw new Error("Invalid move history.");
	if (!s.line.moves.every((m) => typeof m === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) throw new Error("Invalid move history.");
	gameAt({
		...s.line,
		cursor: s.line.moves.length
	});
	if (gameAt(s.line).fen() !== parsePosition(s.fen).fen) throw new Error("The position and history do not match.");
	const a = s.appearance;
	const pair = (p) => p && typeof p.id === "string" && typeof p.label === "string" && p.label.length < 100 && [
		"wood",
		"ceramic",
		"stone",
		"metal"
	].includes(p.surface) && /^#[0-9a-f]{6}$/i.test(p.light) && /^#[0-9a-f]{6}$/i.test(p.dark) && (!p.frame || /^#[0-9a-f]{6}$/i.test(p.frame)) && (!p.grainPattern || [
		"straight",
		"burl",
		"ribbon",
		"birdseye"
	].includes(p.grainPattern));
	const range = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
	if (!a || [a.whitePieceLight, a.blackPieceLight].some((light) => light != null && (!PIECE_LIGHT_PRESETS.some((p) => p.id === light.preset) || !range(light.intensity, -100, 500))) || !pair(a.pieces) || !pair(a.board) || !range(a.brightness, 50, 115) || !range(a.grain, 0, 180) || !range(a.polish, 0, 100) || !["detail", "original"].includes(a.quality) || !LIGHT_PRESETS.map((p) => p.id).includes(a.lighting)) throw new Error("Invalid materials.");
	if (a.collection && ![
		"zagreb",
		"staunton",
		"dubrovnik",
		"bauhaus"
	].includes(a.collection) || a.boardShape && ![
		"classic",
		"slim",
		"floating"
	].includes(a.boardShape) || a.toneMapping && !["aces", "agx"].includes(a.toneMapping) || a.whiteLightness != null && !range(a.whiteLightness, 40, 200) || a.blackLightness != null && !range(a.blackLightness, 40, 200) || a.darkReflections != null && !range(a.darkReflections, 20, 120) || a.contactShadows != null && !range(a.contactShadows, 0, 150)) throw new Error("Invalid rendering settings.");
	if (!a.light || !Object.entries({
		key: [20, 140],
		fill: [0, 60],
		rim: [0, 150],
		reflections: [0, 120],
		direction: [-180, 180],
		height: [10, 85],
		warmth: [0, 100],
		softness: [0, 100]
	}).every(([k, [min, max]]) => range(a.light[k], min, max))) throw new Error("Invalid lighting.");
	if (s.practice && (!["computer", "both"].includes(s.practice.opponent) || !["w", "b"].includes(s.practice.side) || ![
		"easy",
		"club",
		"strong"
	].includes(s.practice.level))) throw new Error("Invalid practice settings.");
	if (s.viewing && (s.viewing.pieceMotionMs != null && !isPieceMotionMs(s.viewing.pieceMotionMs) || s.viewing.showAnalysis != null && typeof s.viewing.showAnalysis !== "boolean" || s.viewing.showClock != null && typeof s.viewing.showClock !== "boolean" || s.viewing.flatStyle != null && !["classic", "materials"].includes(s.viewing.flatStyle) || s.viewing.flatScale != null && !range(s.viewing.flatScale, 35, 100) || s.viewing.flatPanY != null && !range(s.viewing.flatPanY, -50, 50) || s.viewing.flatPan != null && !range(s.viewing.flatPan, -50, 50) || s.viewing.clockPlacement != null && !["left", "right"].includes(s.viewing.clockPlacement) || s.viewing.clockSide != null && ![
		"board",
		"player",
		"white",
		"black"
	].includes(s.viewing.clockSide) || s.viewing.railOrder != null && !["clock-first", "moves-first"].includes(s.viewing.railOrder) || s.viewing.clockStyle != null && !CLOCK_STYLES.some((style) => style.id === s.viewing.clockStyle) || s.viewing.clock3D != null && !validClock3DViews(s.viewing.clock3D) || s.viewing.clockLayouts != null && !validClockLayouts(s.viewing.clockLayouts) || !range(s.viewing.knightAngle, -180, 180) || s.viewing.pieceScales != null && (typeof s.viewing.pieceScales !== "object" || Array.isArray(s.viewing.pieceScales) || !Object.entries(s.viewing.pieceScales).every(([name, scale]) => PIECE_NAMES.includes(name) && range(scale, 60, 120))) || s.viewing.knightScale != null && !range(s.viewing.knightScale, 60, 120) || s.viewing.lowerControls != null && typeof s.viewing.lowerControls !== "boolean" || s.viewing.upperControls != null && typeof s.viewing.upperControls !== "boolean" || s.viewing.moveNavigation != null && typeof s.viewing.moveNavigation !== "boolean" || s.viewing.cameraLocked != null && typeof s.viewing.cameraLocked !== "boolean" || !range(s.viewing.perspective, 25, 55) || !["comfortable", "maximum"].includes(s.viewing.framing) || typeof s.viewing.coordinates !== "boolean")) throw new Error("Invalid viewing settings.");
	if (s.navigation != null && !["orbit", "pan"].includes(s.navigation) || s.showEvaluation != null && typeof s.showEvaluation !== "boolean" || s.showMoves != null && typeof s.showMoves !== "boolean") throw new Error("Invalid board controls.");
	return {
		...s,
		name: s.name.trim()
	};
}
//#endregion
export { savedBoardDisplay, savedBoardOrientation, savedViewId, validateView };
