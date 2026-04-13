export class OriginValidationError extends Error {
	constructor(message = "Request origin is not allowed.") {
		super(message);
		this.name = "OriginValidationError";
	}
}

type RequestMetadata = {
	ip: string | null;
	userAgent: string | null;
	origin: string | null;
};

function normalizeOrigin(value: string): string | null {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

export function getRequestMetadata(request: Request): RequestMetadata {
	return {
		ip: request.headers.get("cf-connecting-ip"),
		userAgent: request.headers.get("user-agent"),
		origin: request.headers.get("origin"),
	};
}

export function getRateLimitBucket(request: Request, fallback = "unknown"): string {
	const ip = request.headers.get("cf-connecting-ip")?.trim();
	return ip && ip.length > 0 ? ip : fallback;
}

export function assertTrustedOrigin(request: Request, extraAllowedOrigins: string[] = []): void {
	const requestOrigin = request.headers.get("origin");
	if (!requestOrigin) {
		return;
	}

	const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
	const allowed = new Set<string>();
	const requestUrlOrigin = normalizeOrigin(request.url);
	if (requestUrlOrigin) {
		allowed.add(requestUrlOrigin);
	}

	for (const value of extraAllowedOrigins) {
		const normalized = normalizeOrigin(value);
		if (normalized) {
			allowed.add(normalized);
		}
	}

	if (!normalizedRequestOrigin || !allowed.has(normalizedRequestOrigin)) {
		throw new OriginValidationError();
	}
}
