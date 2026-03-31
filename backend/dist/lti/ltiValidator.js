import { createRemoteJWKSet, jwtVerify } from 'jose';
const VIBE_JWKS_URL = process.env.VIBE_JWKS_URL || 'http://localhost:3141/api/lti/jwks';
const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';
/**
 * Validates a JWT token sent by Vibe (the LMS/Platform)
 * when a student launches an LTI tool.
 *
 * Returns the decoded LTI context if valid, throws if invalid.
 */
export async function validateLtiToken(token) {
    const JWKS = createRemoteJWKSet(new URL(VIBE_JWKS_URL));
    const { payload } = await jwtVerify(token, JWKS, {
        issuer: VIBE_BASE_URL,
    });
    const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'];
    const resourceLink = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'];
    const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'];
    const ags = payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'];
    const dlSettings = payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'];
    const messageType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'];
    const role = roles?.some(r => r.includes('Instructor')) ? 'Instructor' : 'Learner';
    return {
        isDeepLinking: messageType === 'LtiDeepLinkingRequest',
        deepLinkReturnUrl: dlSettings?.deep_link_return_url || '',
        userId: payload.sub,
        userEmail: payload.email,
        userName: payload.name,
        courseId: context?.label || '',
        courseTitle: context?.title || context?.label || '',
        courseVersionId: context?.id || '',
        activityId: resourceLink?.id || '',
        activityTitle: payload['https://vibe.learning/custom_claims/activity_title'] || resourceLink?.title || '',
        role,
        toolId: payload.aud,
        agsScoreUrl: ags?.lineitem || '',
    };
}
