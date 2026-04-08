import { Request, Response } from 'express';
import { validateLtiToken } from '../lti/ltiValidator.js';
import { syncRosterForCourse } from '../services/bp.service.js';

/**
 * Controller class for handling LTI Launch endpoints.
 * Follows the Single Responsibility Principle by only managing LTI authentications and launches.
 */
export class LtiController {
    
    /**
     * Validates the incoming LTI JWT token from Vibe LMS.
     * Returns the decoded LTI context data.
     * Additionally syncs the course roster if the user launched with an Instructor role.
     * 
     * @param req Express Request
     * @param res Express Response
     */
    public async launch(req: Request, res: Response): Promise<void> {
        try {
            console.log(`[Launch] Received launch request from origin: ${req.headers.origin || 'unknown'}`);
            
            // Extract token from body, query, or authorization header
            let token = req.body.token || req.query.lti_token;
            if (!token && req.headers.authorization?.startsWith('Bearer ')) {
                token = req.headers.authorization.split(' ')[1];
            }
            
            if (!token) { 
                console.warn('[Launch] Missing LTI token in request');
                res.status(400).json({ error: 'Missing LTI token. Ensure lti_token is passed in the query string or body.' }); 
                return; 
            }

            // Validate the token and extract payload context
            const context = await validateLtiToken(token);
            console.log(`[Launch] Successfully validated token for user: ${context.userId} (${context.role})`);

            // If an instructor is launching the tool, we preemptively sync the course roster in the background
            if (context.role === 'Instructor' && context.courseId) {
                syncRosterForCourse(context.courseId).catch((err: Error) => {
                    console.warn('[NRPS] Background roster sync failed on launch:', err.message);
                });
            }

            res.json({ success: true, context });
            
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
