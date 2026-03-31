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
        const { token } = req.body;
        
        if (!token) { 
            res.status(400).json({ error: 'Missing LTI token in request body' }); 
            return; 
        }

        try {
            // Validate the token and extract payload context
            const context = await validateLtiToken(token);

            // If an instructor is launching the tool, we preemptively sync the course roster in the background
            if (context.role === 'Instructor' && context.courseId) {
                syncRosterForCourse(context.courseId).catch((err: Error) => {
                    console.warn('[NRPS] Background roster sync failed on launch:', err.message);
                });
            }

            res.json({ success: true, context });
            
        } catch (error: any) {
            console.error('[Launch] Token validation failed:', error.message);
            res.status(401).json({ error: 'Invalid LTI token', detail: error.message });
        }
    }
}

export const ltiController = new LtiController();
