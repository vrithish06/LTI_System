import { Router, Request, Response } from 'express';

// Controllers
import { ltiController } from '../controllers/lti.controller.js';
import { examController } from '../controllers/exam.controller.js';
import { bpController } from '../controllers/bp.controller.js';
import { activityController } from '../controllers/activity.controller.js';
import multer from 'multer';
import { cloudStorageService } from '../utils/cloud-storage.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
router.post('/lti/activities/:activityId/submit', upload.single('proof'), async (req: Request, res: Response) => {
    try {
        let proof_url = undefined;
        if (req.file) {
            proof_url = await cloudStorageService.uploadActivityProof(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                req.body.user_id,
                req.params.activityId,
                new Date()
            );
        }
        if (proof_url) {
            req.body.proof_url = proof_url;
        }
        return activityController.submitActivity(req, res);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to process submission', detail: err.message });
    }
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

// GET /api/lti/activities/:activityId/submissions
router.get('/lti/activities/:activityId/submissions', (req: Request, res: Response) => {
    return activityController.getSubmissionsForActivity(
        { ...req, params: { activityId: req.params.activityId } } as any,
        res
    );
});

// GET /api/lti/courseName/:courseId
router.get('/lti/courseName/:courseId', async (req: Request, res: Response) => {
    try {
        const { connectDB } = await import('../db/connection.js');
        await connectDB();
        const mongoose = (await import('mongoose')).default;
        const db = mongoose.connection.db;
        if (!db) throw new Error('DB not connected');
        
        // Find course name from `newcourses` or `courses` natively in Vibe's DB
        const course = await db.collection('newcourses').findOne({ _id: new mongoose.Types.ObjectId(req.params.courseId) });
        if (course) {
            return res.json({ success: true, courseName: course.name || course.title || 'Unknown Course' });
        }
        res.json({ success: false, courseName: 'Unknown Course' });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed', detail: err.message });
    }
});

// GET /api/lti/bp/:userId/:courseId  — student's own HP balance
router.get('/lti/bp/:userId/:courseId', (req: Request, res: Response) => {
    return activityController.getBrowniePointsForStudent(
        { ...req, params: { studentId: req.params.userId, courseId: req.params.courseId } } as any,
        res
    );
});

// GET /api/lti/proof/:fileId
router.get('/lti/proof/:fileId', async (req: Request, res: Response) => {
    try {
        const { stream, metadata } = await cloudStorageService.downloadProof(req.params.fileId);
        res.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
        res.setHeader('Content-Type', metadata.contentType);
        stream.pipe(res);
    } catch (err: any) {
        res.status(404).json({ error: 'Proof not found', detail: err.message });
    }
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
