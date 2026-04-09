import { Router, Request, Response } from 'express';

// Controllers
import { ltiController } from '../controllers/lti.controller.js';
import { examController } from '../controllers/exam.controller.js';
import { bpController } from '../controllers/bp.controller.js';
import { activityController } from '../controllers/activity.controller.js';

/**
 * Main application router linking API paths to initialized controller endpoints.
 * Abides by the Open/Closed Principle: adding new domains only requires new files instead of extending a massive index.
 */
export const router = Router();

// ─────────────────────────────────────────────────────────────────
// LTI LAUNCH ROUTES  (called by VIBE backend with shared secret)
// ─────────────────────────────────────────────────────────────────
router.post('/launch', ltiController.launch.bind(ltiController));

// ─────────────────────────────────────────────────────────────────
// QUIZ / EXAM ROUTES
// ─────────────────────────────────────────────────────────────────
router.post('/submit', examController.submitScore.bind(examController));
router.post('/deep-link-create', examController.createDeepLinkedExam.bind(examController));
router.get('/exam/:title', examController.getExamByTitle.bind(examController));

// ─────────────────────────────────────────────────────────────────
// ACTIVITY ROUTES  (server-to-server calls from VIBE backend)
// ─────────────────────────────────────────────────────────────────
router.post('/activities', activityController.createOrUpdateActivity.bind(activityController));
router.get('/activities/:courseId', activityController.getActivitiesByCourse.bind(activityController));
router.post('/activities/:activityId/submit', activityController.submitActivity.bind(activityController));
router.get('/activities/:activityId/submissions/:userId', activityController.getUserSubmissions.bind(activityController));
router.get('/activities/bp/:studentId/:courseId', activityController.getBrowniePointsForStudent.bind(activityController));

// ─────────────────────────────────────────────────────────────────
// PUBLIC LTI ROUTES  (browser-facing — called directly by LTI frontend)
// ActivityDetail.tsx, StudentBPDashboard.tsx, etc. use these paths.
// No shared secret is required; they rely on the LTI JWT via /api/launch.
// ─────────────────────────────────────────────────────────────────

// GET /api/lti/course/:courseId/activities
router.get('/lti/course/:courseId/activities', (req: Request, res: Response) => {
    return activityController.getActivitiesByCourse(
        { ...req, params: { courseId: req.params.courseId } } as any,
        res
    );
});

// POST /api/lti/activities/:activityId/submit
router.post('/lti/activities/:activityId/submit', (req: Request, res: Response) => {
    return activityController.submitActivity(
        { ...req, params: { activityId: req.params.activityId } } as any,
        res
    );
});

// PUT /api/lti/activities/:activityId  — instructor updates an activity
router.put('/lti/activities/:activityId', (req: Request, res: Response) => {
    return activityController.updateActivityById(
        { ...req, params: { activityId: req.params.activityId } } as any,
        res
    );
});

// DELETE /api/lti/activities/:activityId  — instructor deletes an activity
router.delete('/lti/activities/:activityId', (req: Request, res: Response) => {
    return activityController.deleteActivityById(
        { ...req, params: { activityId: req.params.activityId } } as any,
        res
    );
});

// GET /api/lti/submissions/:userId/:courseId
router.get('/lti/submissions/:userId/:courseId', (req: Request, res: Response) => {
    return activityController.getUserSubmissions(
        { ...req, params: { userId: req.params.userId, courseId: req.params.courseId } } as any,
        res
    );
});

// GET /api/lti/bp/:userId/:courseId  — student's own HP balance
router.get('/lti/bp/:userId/:courseId', (req: Request, res: Response) => {
    return activityController.getBrowniePointsForStudent(
        { ...req, params: { studentId: req.params.userId, courseId: req.params.courseId } } as any,
        res
    );
});

// ─────────────────────────────────────────────────────────────────
// BROWNIE POINTS ROUTES  (instructor-facing, called via LTI launch)
// ─────────────────────────────────────────────────────────────────
router.get('/bp/:courseId', bpController.getPointsByCourse.bind(bpController));
router.get('/bp/student/:courseId/:studentId', bpController.getStudentPoints.bind(bpController));
router.patch('/bp/:courseId/:studentId', bpController.adjustPointsForStudent.bind(bpController));
router.post('/bp/sync/:courseId', bpController.manuallySyncRoster.bind(bpController));

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
