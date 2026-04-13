import { isIP } from "node:net";

const MAX_SOURCE_URL_LENGTH = 2048;

export class SourceValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SourceValidationError";
	}
}

function normalizePort(url: URL): void {
	if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
		url.port = "";
	}
}

function assertProtocol(url: URL): void {
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new SourceValidationError("Only http and https source URLs are allowed.");
	}
}

function assertNoCredentials(url: URL): void {
	if (url.username || url.password) {
		throw new SourceValidationError("Source URLs must not include embedded credentials.");
	}
}

function isBlockedHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal") ||
		normalized === "metadata.google.internal"
	);
}

function assertIpv4IsPublic(hostname: string): void {
	const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
	if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
		throw new SourceValidationError("Invalid IPv4 address.");
	}

	const [a, b] = parts;

	if (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	) {
		throw new SourceValidationError("Private or local IPv4 targets are not allowed.");
	}
}

function assertIpv6IsPublic(hostname: string): void {
	const normalized = hostname.toLowerCase();
	if (
		normalized === "::1" ||
		normalized === "::" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe8") ||
		normalized.startsWith("fe9") ||
		normalized.startsWith("fea") ||
		normalized.startsWith("feb")
	) {
		throw new SourceValidationError("Private or local IPv6 targets are not allowed.");
	}
}

function assertSafeHost(url: URL): void {
	if (isBlockedHostname(url.hostname)) {
		throw new SourceValidationError("Local or internal hostnames are not allowed.");
	}

	const ipType = isIP(url.hostname);
	if (ipType === 4) {
		assertIpv4IsPublic(url.hostname);
	}
	if (ipType === 6) {
		assertIpv6IsPublic(url.hostname);
	}
}

export function normalizeSourceUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		throw new SourceValidationError("Source URL is required.");
	}
	if (trimmed.length > MAX_SOURCE_URL_LENGTH) {
		throw new SourceValidationError("Source URL is too long.");
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new SourceValidationError("Source URL is invalid.");
	}

	assertProtocol(url);
	assertNoCredentials(url);
	assertSafeHost(url);
	url.hash = "";
	normalizePort(url);

	return url.toString();
}

export function assertSafeFetchTarget(input: string): URL {
	const normalized = normalizeSourceUrl(input);
	return new URL(normalized);
}

export function assertSafeRedirectChain(urls: string[]): void {
	for (const url of urls) {
		assertSafeFetchTarget(url);
	}
}
