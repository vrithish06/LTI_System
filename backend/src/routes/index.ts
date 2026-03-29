import { Router, Request, Response } from 'express';
import { validateLtiToken } from '../lti/ltiValidator.js';
import { submitScoreToVibe } from '../grades/gradeService.js';

export const router = Router();

/**
 * POST /api/launch
 * Called by the frontend when a student opens the LTI tool.
 * Validates the JWT token from Vibe and returns the student context.
 *
 * Body: { token: string }
 */
router.post('/launch', async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body;

    if (!token) {
        res.status(400).json({ error: 'Missing LTI token' });
        return;
    }

    try {
        const context = await validateLtiToken(token);
        res.json({ success: true, context });
    } catch (error: any) {
        console.error('[Launch] Token validation failed:', error.message);
        res.status(401).json({ error: 'Invalid LTI token', detail: error.message });
    }
});

/**
 * POST /api/submit
 * Called by the frontend when a student completes the activity.
 * Submits a score back to Vibe, which converts it to HP.
 *
 * Body: { context: LtiContext, scoreGiven: number, scoreMaximum: number, comment?: string }
 */
router.post('/submit', async (req: Request, res: Response): Promise<void> => {
    const { context, scoreGiven, scoreMaximum, comment } = req.body;

    if (!context || scoreGiven === undefined || !scoreMaximum) {
        res.status(400).json({ error: 'Missing required fields: context, scoreGiven, scoreMaximum' });
        return;
    }

    try {
        await submitScoreToVibe({
            agsScoreUrl: context.agsScoreUrl,
            userId: context.userId,
            courseId: context.courseId,
            activityId: context.activityId,
            activityTitle: context.activityTitle,
            toolId: context.toolId,
            scoreGiven,
            scoreMaximum,
            comment,
        });

        res.json({
            success: true,
            message: `Score ${scoreGiven}/${scoreMaximum} submitted to Vibe!`,
        });
    } catch (error: any) {
        console.error('[Submit] Score submission failed:', error.message);
        res.status(500).json({ error: 'Failed to submit score', detail: error.message });
    }
});

// Simple in-memory DB for MVP to store exams
const examsDB: Record<string, any> = {};

/**
 * POST /api/deep-link-create
 * Generates a signed JWT for the teacher to return to the Platform (Vibe).
 */
router.post('/deep-link-create', async (req: Request, res: Response): Promise<void> => {
    const { title, text, questions, context } = req.body;
    
    // Save to memory so student can retrieve it
    if (questions && questions.length > 0) {
        examsDB[title] = { title, description: text, questions };
        console.log(`[DB] Saved exam ${title} with ${questions.length} questions.`);
    }

    const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
            {
                type: 'ltiResourceLink',
                title: title || 'Deep Linked Activity',
                text: text || 'An activity created from the LTI Tool',
                url: 'http://localhost:5174/'
            }
        ]
    };
    
    res.json({
        success: true,
        JWT: JSON.stringify(payload) 
    });
});

/**
 * GET /api/exam/:title
 * Returns the exam questions for a student
 */
router.get('/exam/:title', (req: Request, res: Response) => {
    const title = req.params.title;
    if (examsDB[title]) {
        res.json({ success: true, exam: examsDB[title] });
    } else {
        res.json({ success: false, error: 'Exam not found' });
    }
});

/**
 * GET /api/health
 * Simple health check endpoint
 */
router.get('/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok' });
});
