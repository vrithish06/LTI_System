/**
 * OAuth2 Service
 *
 * Handles fetching Bearer access tokens from LMS platforms for:
 * - NRPS (Names and Role Provisioning Services) — roster sync
 * - AGS  (Assignment and Grade Services) — score passback
 *
 * Uses the "client_credentials" grant with a short-lived JWT assertion
 * signed by YOUR tool's private RSA key — this is the standard LTI 1.3
 * server-to-server authentication pattern.
 *
 * Tokens are cached in memory for their lifetime to avoid redundant requests.
 */
import { SignJWT, importPKCS8 } from 'jose';
import type { ILtiPlatform } from '../models/ltiPlatform.js';

interface CachedToken {
    token:     string;
    expiresAt: number; // unix ms
}

// In-memory cache keyed by `${issuer}:${scope}`
const tokenCache = new Map<string, CachedToken>();

export const NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
export const AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
export const AGS_LINEITEM_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';

/**
 * Requests (or returns a cached) OAuth2 Bearer token from an LMS platform.
 * Uses your tool's RSA private key to sign a client_credentials JWT assertion.
 */
export async function getLmsAccessToken(platform: ILtiPlatform, scope: string): Promise<string> {
    const cacheKey = `${platform.issuer}:${scope}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5000) {
        return cached.token;
    }

    const privateKeyPem = process.env.LTI_PRIVATE_KEY_PEM;
    if (!privateKeyPem) {
        throw new Error('LTI_PRIVATE_KEY_PEM is not set. Run the key generation script and add it to .env');
    }

    const privateKey = await importPKCS8(privateKeyPem.replace(/\\n/g, '\n'), 'RS256');
    const kid = process.env.LTI_KEY_ID || 'lti-tool-key-1';

    // Build client_credentials JWT assertion (expires in 60s)
    const assertion = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(platform.client_id)
        .setSubject(platform.client_id)
        .setAudience(platform.token_url)
        .setIssuedAt()
        .setExpirationTime('60s')
        .sign(privateKey);

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
        scope,
    });

    const resp = await fetch(platform.token_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OAuth2 token request failed (${resp.status}): ${text}`);
    }

    const { access_token, expires_in } = await resp.json() as { access_token: string; expires_in: number };
    const expiresAt = Date.now() + (expires_in - 10) * 1000; // subtract 10s buffer
    tokenCache.set(cacheKey, { token: access_token, expiresAt });

    return access_token;
}
