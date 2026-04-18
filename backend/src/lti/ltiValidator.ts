/**
 * LTI Token Validator
 *
 * Supports two modes:
 *
 * 1. VIBE-SPECIFIC (HS256 or RS256 with fixed JWKS URL)
 *    Used when Vibe's backend calls POST /launch with a shared-secret JWT.
 *    Falls back to env vars — no database lookup needed.
 *    Backward-compatible forever.
 *
 * 2. UNIVERSAL LTI 1.3 (RS256 with dynamic per-platform JWKS)
 *    Used when any external LMS (Canvas, Moodle, etc.) launches the tool
 *    through the OIDC 3-step flow.
 *    Platform JWKS URL is looked up from the `lti_platforms` MongoDB collection
 *    using the `iss` claim in the JWT.
 *
 * The validator automatically detects which path to take based on the `iss`
 * claim matching a registered platform in the DB (universal) vs matching
 * VIBE_BASE_URL (Vibe-specific).
 */
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader, decodeJwt, importSPKI, exportJWK } from 'jose';
import { connectDB } from '../db/connection.js';
import { LtiPlatformModel } from '../models/ltiPlatform.js';

const VIBE_JWKS_URL  = process.env.VIBE_JWKS_URL  || 'http://localhost:3141/api/lti/jwks';
const VIBE_BASE_URL  = process.env.VIBE_BASE_URL   || 'http://localhost:3141';
const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

export interface LtiContext {
    isDeepLinking?:      boolean;
    deepLinkReturnUrl?:  string;
    userId:              string;
    userEmail:           string;
    userName:            string;
    courseId:            string;
    courseName?:         string;
    courseVersionId:     string;
    activityId:          string;
    activityTitle:       string;
    role:                string;
    toolId:              string;
    agsScoreUrl:         string;   // Where to POST score back to LMS (AGS)
    nrpsMembershipsUrl:  string;   // Where to fetch course roster (standard NRPS)
    platformIssuer:      string;   // Which LMS issued this token (for follow-up OAuth2 calls)
}

// Cache JWKS fetchers per URL to avoid rebuilding on every request
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwksSet(url: string) {
    if (!jwksCache.has(url)) {
        jwksCache.set(url, createRemoteJWKSet(new URL(url)));
    }
    return jwksCache.get(url)!;
}

/**
 * Validates a JWT token from any LMS and returns a normalized LtiContext.
 * Throws if the token is invalid, expired, or from an unknown platform.
 */
export async function validateLtiToken(token: string): Promise<LtiContext> {
    if (!token || typeof token !== 'string') {
        throw new Error('Missing or malformed LTI token string.');
    }

    await connectDB();

    const header = decodeProtectedHeader(token);
    let payload: any;

    // ── PATH A: HS256 (Vibe-specific shared-secret tokens) ───────────────────
    if (header.alg === 'HS256') {
        console.log('[LTI Validator] HS256 token — using Vibe shared secret');
        const secret = new TextEncoder().encode(LTI_SHARED_SECRET);
        const result = await jwtVerify(token, secret, { issuer: VIBE_BASE_URL });
        payload = result.payload;
    } else {
        // Peek at the issuer before full verification
        const rawPayload = decodeJwt(token);
        const issuer = rawPayload.iss as string;

        if (!issuer) throw new Error('JWT missing `iss` claim');

        // ── PATH B: Universal LMS — look up from DB ───────────────────────────
        if (issuer !== VIBE_BASE_URL) {
            console.log(`[LTI Validator] Universal platform launch — issuer: ${issuer}`);
            const platform = await LtiPlatformModel.findOne({ issuer, is_active: true });
            if (!platform) {
                throw new Error(
                    `Unknown LMS issuer: "${issuer}". ` +
                    `Register this platform via POST /api/admin/platforms first.`
                );
            }
            const JWKS = getJwksSet(platform.jwks_url);
            const result = await jwtVerify(token, JWKS, {
                issuer: platform.issuer,
                audience: platform.client_id,
            });
            payload = result.payload;

        // ── PATH C: Vibe RS256 (JWKS-based, fixed URL from env) ──────────────
        } else {
            console.log('[LTI Validator] Vibe RS256 token — using VIBE_JWKS_URL');
            const JWKS = getJwksSet(VIBE_JWKS_URL);
            const result = await jwtVerify(token, JWKS, { issuer: VIBE_BASE_URL });
            payload = result.payload;
        }
    }

    // ── Common required claim validation ─────────────────────────────────────
    if (!payload.sub) throw new Error('Missing required claim: sub (user_id)');
    if (!payload.aud) throw new Error('Missing required claim: aud (audience/toolId)');

    // ── Standard LTI 1.3 claim extraction ────────────────────────────────────
    const context      = payload['https://purl.imsglobal.org/spec/lti/claim/context'] as any;
    const resourceLink = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'] as any;
    const roles        = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] as string[] | undefined;
    const ags          = payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] as any;
    const nrps         = payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'] as any;
    const dlSettings   = payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'] as any;
    const messageType  = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'] as string;

    const role = roles?.some(r => r.includes('Instructor')) ? 'Instructor' : 'Learner';

    return {
        isDeepLinking:     messageType === 'LtiDeepLinkingRequest',
        deepLinkReturnUrl: dlSettings?.deep_link_return_url || '',
        userId:            payload.sub as string,
        userEmail:         payload.email as string || '',
        userName:          payload.name  as string || '',
        courseId:          context?.label || context?.id || '',
        courseName:        context?.title || '',
        courseVersionId:   context?.id || '',
        activityId:        resourceLink?.id || '',
        activityTitle:     payload['https://vibe.learning/custom_claims/activity_title'] || resourceLink?.title || '',
        role,
        toolId:            Array.isArray(payload.aud) ? payload.aud[0] : payload.aud as string,
        agsScoreUrl:       ags?.lineitem || '',
        nrpsMembershipsUrl: nrps?.context_memberships_url || '',
        platformIssuer:    payload.iss as string,
    };
}

/**
 * Returns the tool's own public JWK — used by the GET /api/lti/jwks endpoint.
 * LMSs fetch this to verify tokens/scores coming FROM your tool.
 */
export async function getToolPublicJwk(): Promise<object> {
    const pem = process.env.LTI_PUBLIC_KEY_PEM;
    if (!pem) {
        throw new Error(
            'LTI_PUBLIC_KEY_PEM is not set. ' +
            'Generate a key pair with `node scripts/generate-lti-keys.mjs` and add to .env'
        );
    }
    const publicKey = await importSPKI(pem.replace(/\\n/g, '\n'), 'RS256');
    const jwk = await exportJWK(publicKey);
    return {
        ...jwk,
        use: 'sig',
        alg: 'RS256',
        kid: process.env.LTI_KEY_ID || 'lti-tool-key-1',
    };
}
