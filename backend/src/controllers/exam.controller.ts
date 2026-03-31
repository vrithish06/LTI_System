import { Request, Response } from 'express';
import { submitScoreToVibe } from '../grades/gradeService.js';
import { ExamModel } from '../models/Exam.js';

/**
 * Controller class for taking care of Exam operations inclusive of quizzes and score submissions.
 * This separates concerns from Brownie points or core LTI handlers.
 */
export class ExamController {

    /**
     * Handles student quiz score submissions and pushes Brownie Points
     * back to the Vibe platform.
     * 
     * @param req Express Request matching payload signatures
     * @param res Express Response containing status flags
     */
    public async submitScore(req: Request, res: Response): Promise<void> {
        const { context, scoreGiven, scoreMaximum, comment } = req.body;
        
        // Input validation according to schema expectations
        if (!context || scoreGiven === undefined || !scoreMaximum) {
            res.status(400).json({ error: 'Payload missing required keys. Provide context, scoreGiven, and scoreMaximum parameters' });
            return;
        }

        try {
            // Service handles LTI AGS requests securely decoupled from HTTP layer
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

            res.json({ success: true, message: `Attempt logged and score (${scoreGiven}/${scoreMaximum}) relayed to system.` });

        } catch (error: any) {
            console.error('[Submit] LTI Grade submission resulted in localized failure:', error.message);
            res.status(500).json({ error: 'Communication error with LTI AGS platform. Could not sync completion.', detail: error.message });
        }
    }

    /**
     * Accepts a deep-link initialization via a teacher payload and commits/upserts 
     * the payload as a tracked MongoDB Exam configuration.
     * 
     * @param req Express Request holding UI values constructed by teachers (title, text, questions, context)
     * @param res Express Response sending standard LTI deep-linking structure
     */
    public async createDeepLinkedExam(req: Request, res: Response): Promise<void> {
        const { title, text, questions, context } = req.body;

        // Validation mapping against existence of array and active course context
        if (questions && questions.length > 0 && context?.courseId) {
            try {
                // Upsert model to ensure titles can be reused uniquely per course 
                await ExamModel.findOneAndUpdate(
                    { courseId: context.courseId, title },
                    { title, description: text, courseId: context.courseId, courseVersionId: context.courseVersionId, questions },
                    { upsert: true, new: true }
                );
                console.log(`[Exam Dashboard] Persisted Configuration: "${title}" (${questions.length} questions attached for course ${context.courseId}).`);
            } catch (err: any) {
                console.error('[Exam Creation] Failed model upsert:', err.message);
                res.status(500).json({ error: 'Creation query malfunction', detail: err.message });
                return;
            }
        }

        // Deep linking specification compliant frame response
        const payload = {
            'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
            'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
            'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [{
                type: 'ltiResourceLink',
                title: title || 'Deep Linked Interactive Activity',
                text: text || 'This activity instance was explicitly bound inside the parent LTI application.',
                url: 'http://localhost:5174/'
            }]
        };

        res.json({ success: true, JWT: JSON.stringify(payload) });
    }

    /**
     * Resolves an available exam sequence matching a defined string title.
     * Used by student player to pull parameters mapped externally to LTI launch frames.
     * 
     * @param req Express Request containing `title` attribute from LTI 
     * @param res Express Response holding Exam schema model content or explicit negative failure
     */
    public async getExamByTitle(req: Request, res: Response): Promise<void> {
        // Enforce canonical decoding across varied browser url payloads
        const title = decodeURIComponent(req.params.title);
        const courseId = req.query.courseId as string | undefined;

        // Establish query filter schema defensively
        const filter: any = { title };
        if (courseId) {
            filter.courseId = courseId;
        }

        try {
            // Request mapping strictly targeting latest edits corresponding with versioned title definitions
            const storedExam = await ExamModel.findOne(filter).sort({ updatedAt: -1 });

            if (storedExam) {
                res.json({ success: true, exam: storedExam });
            } else {
                res.json({ success: false, error: 'Database record indexing failed for parameters supplied. Ensure exact title resolution' });
            }
        } catch (err: any) {
            console.error('[Exam Fetch]', err.message);
            res.status(500).json({ error: 'Fetch routine experienced a generic fault', detail: err.message });
        }
    }
}

export const examController = new ExamController();
