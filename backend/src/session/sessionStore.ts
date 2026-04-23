import crypto from 'crypto';

/**
 * In-memory session store.
 * Each session expires after SESSION_TTL_MS (default 8 hours).
 * For production, replace with Redis or a DB-backed store.
 */

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface SessionEntry {
    context: Record<string, any>;
    expiresAt: number;
}

const store = new Map<string, SessionEntry>();

/**
 * Store a context object and return a short opaque session ID.
 */
export function createSession(context: Record<string, any>): string {
    // Prune expired sessions lazily
    const now = Date.now();
    for (const [id, entry] of store) {
        if (entry.expiresAt <= now) store.delete(id);
    }

    const sessionId = crypto.randomBytes(16).toString('base64url'); // ~22 chars, URL-safe
    store.set(sessionId, { context, expiresAt: now + SESSION_TTL_MS });
    return sessionId;
}

/**
 * Look up a session by ID. Returns null if missing or expired.
 */
export function getSession(sessionId: string): Record<string, any> | null {
    const entry = store.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        store.delete(sessionId);
        return null;
    }
    // Sliding window — refresh TTL on access
    entry.expiresAt = Date.now() + SESSION_TTL_MS;
    return entry.context;
}

/**
 * Total live sessions (useful for health checks).
 */
export function sessionCount(): number {
    return store.size;
}
