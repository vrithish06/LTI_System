import { Request, Response } from 'express';
import { validateLtiToken } from '../lti/ltiValidator.js';
import { syncRosterForCourse } from '../services/bp.service.js';
import { syncRosterFromNrps } from '../services/nrps.service.js';
import { provisionUser } from '../hp/hpService.js';
import { createSession } from '../session/sessionStore.js';

const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';

/**
 * LTI Launch Controller
 *
 * Handles POST /launch — called by both:
 *   - Vibe (HS256 shared secret, direct backend-to-backend)
 *   - Universal LMS (RS256, via OIDC step-3 form_post from browser)
 *
 * After validating the token, roster sync is dispatched in the background
 * using the appropriate method:
 *   - Vibe:    x-lti-secret against Vibe's NRPS endpoint
 *   - Universal: OAuth2 Bearer against the standard NRPS memberships URL
 */
export class LtiController {
    
    public async launch(req: Request, res: Response): Promise<void> {
        try {
            console.log(`[Launch] Received launch from origin: ${req.headers.origin || 'unknown'}`);
            
            // Extract token from body, query, or Authorization header
            let token = req.body.token || req.body.id_token || req.query.lti_token;
            if (!token && req.headers.authorization?.startsWith('Bearer ')) {
                token = req.headers.authorization.split(' ')[1];
            }
            
            if (!token) { 
                res.status(400).json({ error: 'Missing LTI token. Pass as lti_token query param, body.token, or Bearer header.' }); 
                return; 
            }

            const context = await validateLtiToken(token);
            console.log(`[Launch] ✓ ${context.role} ${context.userId} — course: ${context.courseId} — platform: ${context.platformIssuer}`);

            // ── Background: roster sync ────────────────────────────────────
            // Choose sync method based on how this launch arrived
            if (context.role === 'Instructor' && context.courseId) {
                const isVibe = context.platformIssuer === VIBE_BASE_URL;

                if (isVibe || !context.nrpsMembershipsUrl) {
                    // Vibe path: x-lti-secret against Vibe's custom NRPS endpoint
                    syncRosterForCourse(context.courseId).catch((err: Error) =>
                        console.warn('[NRPS] Vibe roster sync failed:', err.message)
                    );
                } else {
                    // Universal path: OAuth2 Bearer against standard NRPS memberships URL
                    syncRosterFromNrps(
                        context.nrpsMembershipsUrl,
                        context.platformIssuer,
                        context.courseId,
                        context.courseName,
                    ).catch((err: Error) =>
                        console.warn('[NRPS] Universal roster sync failed:', err.message)
                    );
                }
            }

            // Always provision the launching user (idempotent)
            if (context.userId && context.courseId) {
                provisionUser(context.userId, context.courseId, context.role).catch((err: Error) =>
                    console.warn('[Provision] Failed to provision user:', err.message)
                );
            }

            // Issue a server-side session so the frontend can drop the token from the URL
            const sessionId = createSession(context as unknown as Record<string, any>);

            res.json({ success: true, context, sessionId });
            
        } catch (error: any) {
            console.error('[Launch] Token validation failed:', error.message);
            res.status(401).json({ 
                error: 'Invalid LTI token', 
                detail: error.message 
            });
        }
    }
}

export const ltiController = new LtiController();

