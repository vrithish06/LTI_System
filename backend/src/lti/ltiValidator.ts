import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from 'jose';

const VIBE_JWKS_URL = process.env.VIBE_JWKS_URL || 'http://localhost:3141/api/lti/jwks';
const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';
const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

export interface LtiContext {
    isDeepLinking?: boolean;
    deepLinkReturnUrl?: string;
    userId: string;
    userEmail: string;
    userName: string;
    courseId: string;
    courseVersionId: string;
    activityId: string;
    activityTitle: string;
    role: string;
    toolId: string;
    agsScoreUrl: string; // Where to POST score back to Vibe
}

/**
 * Validates a JWT token sent by Vibe (the LMS/Platform)
 * when a student launches an LTI tool.
 *
 * Returns the decoded LTI context if valid, throws if invalid.
 */

export async function validateLtiToken(token: string): Promise<LtiContext> {
    if (!token || typeof token !== 'string') {
        throw new Error('Missing or malformed LTI token string.');
    }

    let payload: any;
    try {
        const header = decodeProtectedHeader(token);
        
        if (header.alg === 'HS256') {
            console.log('[LTI Validator] Detected HS256 token, verifying with shared secret...');
            const secret = new TextEncoder().encode(LTI_SHARED_SECRET);
            const result = await jwtVerify(token, secret, {
                issuer: VIBE_BASE_URL,
            });
            payload = result.payload;
        } else {
            console.log(`[LTI Validator] Detected ${header.alg || 'RS256'} token, verifying with JWKS...`);
            const JWKS = createRemoteJWKSet(new URL(VIBE_JWKS_URL));
            const result = await jwtVerify(token, JWKS, {
                issuer: VIBE_BASE_URL,
            });
            payload = result.payload;
        }
    } catch (err: any) {
        console.error('[LTI Validator] Token verification failed:', err.message);
        throw new Error(`Token verification failed: ${err.message}`);
    }

    // Validate essential LTI 1.3 claims
    if (!payload.iss || payload.iss !== VIBE_BASE_URL) {
        throw new Error(`Invalid issuer. Expected ${VIBE_BASE_URL}, got ${payload.iss}`);
    }
    if (!payload.sub) {
        throw new Error('Missing required claim: sub (user_id)');
    }
    if (!payload.aud) {
        throw new Error('Missing required claim: aud (audience/toolId)');
    }

    const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'] as any;
    const resourceLink = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'] as any;
    const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] as string[];
    const ags = payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] as any;
    const dlSettings = payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'] as any;
    const messageType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'] as string;

    const role = roles?.some(r => r.includes('Instructor')) ? 'Instructor' : 'Learner';

    return {
        isDeepLinking: messageType === 'LtiDeepLinkingRequest',
        deepLinkReturnUrl: dlSettings?.deep_link_return_url || '',
        userId: payload.sub as string,
        userEmail: payload.email as string,
        userName: payload.name as string,
        courseId: context?.label || '',
        courseVersionId: context?.id || '',
        activityId: resourceLink?.id || '',
        activityTitle: payload['https://vibe.learning/custom_claims/activity_title'] || resourceLink?.title || '',
        role,
        toolId: payload.aud as string,
        agsScoreUrl: ags?.lineitem || '',
    };
}
