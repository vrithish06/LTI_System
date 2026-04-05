import { Router, Request, Response } from 'express';

// Controllers
import { ltiController } from '../controllers/lti.controller.js';
import { examController } from '../controllers/exam.controller.js';
import { bpController } from '../controllers/bp.controller.js';

/**
 * Main application router linking API paths to initialized controller endpoints.
 * Abides by the Open/Closed Principle: adding new domains only requires new files instead of extending a massive index.
 */
export const router = Router();

// ─────────────────────────────────────────────────────────────────
// LTI LAUNCH ROUTES
// ─────────────────────────────────────────────────────────────────
router.post('/launch', ltiController.launch);

// ─────────────────────────────────────────────────────────────────
// QUIZ / EXAM ROUTES
// ─────────────────────────────────────────────────────────────────
router.post('/submit', examController.submitScore);
router.post('/deep-link-create', examController.createDeepLinkedExam);
router.get('/exam/:title', examController.getExamByTitle);

// ─────────────────────────────────────────────────────────────────
// BROWNIE POINTS ROUTES
// ─────────────────────────────────────────────────────────────────
router.get('/bp/:courseId', bpController.getPointsByCourse);
router.get('/bp/student/:courseId/:studentId', bpController.getStudentPoints);
router.patch('/bp/:courseId/:studentId', bpController.adjustPointsForStudent);
router.post('/bp/sync/:courseId', bpController.manuallySyncRoster);

// ─────────────────────────────────────────────────────────────────
// DIAGNOSTICS & HEALTH EXPORT
// ─────────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response): void => {
    res.json({ 
        status: 'ok', 
        service: 'LTI_System/Refactored',
        timestamp: new Date().toISOString()
    });
});
