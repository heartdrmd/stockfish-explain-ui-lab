//#region lib/broadcast-endpoints.ts
function broadcastTablePath(path) {
	return /^\/broadcast\/[A-Za-z0-9]{8}\/(?:players(?:\/[^/?#]{1,240})?|teams\/standings)$/.test(path) && !/%(?:2f|5c|00)/i.test(path) && !path.includes("..") && !path.includes("\\");
}
//#endregion
//#region lib/broadcast-proxy.ts
/** Small, read-only table bridge. Live PGNs and model assets never pass here. */
async function broadcastDataResponse(request) {
	const url = new URL(request.url), path = url.searchParams.get("path") || "";
	const headers = {
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff"
	};
	const error = (message, status) => Response.json({ error: message }, {
		status,
		headers
	});
	if (request.method !== "GET") return error("Method not allowed.", 405);
	if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) return error("Invalid origin.", 403);
	if (!broadcastTablePath(path)) return error("Choose a valid broadcast table.", 400);
	const authorization = request.headers.get("authorization");
	if (authorization && !/^Bearer [A-Za-z0-9_-]{1,1024}$/.test(authorization)) return error("Reconnect Lichess.", 401);
	try {
		const upstream = await fetch("https://lichess.org" + path, {
			redirect: "manual",
			signal: AbortSignal.timeout(15e3),
			headers: {
				Accept: "application/json",
				...authorization ? { Authorization: authorization } : {}
			}
		});
		if (!upstream.ok) {
			await upstream.body?.cancel();
			return error(upstream.status === 429 ? "Lichess is busy. Please wait one minute." : upstream.status === 401 || upstream.status === 403 ? "Connect Lichess to read this tournament." : "This broadcast table is unavailable.", upstream.status >= 400 ? upstream.status : 502);
		}
		if (!upstream.headers.get("content-type")?.includes("application/json")) {
			await upstream.body?.cancel();
			return error("The broadcast table is unavailable.", 502);
		}
		const reader = upstream.body?.getReader();
		if (!reader) return error("The broadcast table is unavailable.", 502);
		let size = 0, text = "";
		const decoder = new TextDecoder();
		try {
			while (true) {
				const part = await reader.read();
				if (part.done) break;
				size += part.value.length;
				if (size > 2e6) return error("This broadcast table is too large.", 502);
				text += decoder.decode(part.value, { stream: true });
			}
			text += decoder.decode();
			JSON.parse(text);
			return new Response(text, { headers: {
				...headers,
				"Content-Type": "application/json"
			} });
		} finally {
			await reader.cancel().catch(() => {});
			reader.releaseLock();
		}
	} catch (failure) {
		console.warn("[Broadcast tables]", failure instanceof Error ? failure.message : "Upstream unavailable");
		return error("Could not reach Lichess. Try again shortly.", 502);
	}
}
//#endregion
export { broadcastDataResponse };
