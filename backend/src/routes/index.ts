import { Router, Request, Response } from 'express';
import { getSession, sessionCount } from '../session/sessionStore.js';

// Controllers
import { ltiController } from '../controllers/lti.controller.js';
import { universalLtiController } from '../controllers/universalLti.controller.js';
import { adminPlatformController } from '../controllers/adminPlatform.controller.js';
import { examController } from '../controllers/exam.controller.js';
import { bpController } from '../controllers/bp.controller.js';
import { activityController } from '../controllers/activity.controller.js';
import multer from 'multer';
import { cloudStorageService } from '../utils/cloud-storage.js';
import * as doubt from '../controllers/doubt.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Main application router linking API paths to initialized controller endpoints.
 * Abides by the Open/Closed Principle: adding new domains only requires new files instead of extending a massive index.
 */
export const router = Router();

// ─────────────────────────────────────────────────────────────────
// LTI LAUNCH ROUTES
// POST /launch  — Vibe-specific (HS256 / RS256, existing flow, unchanged)
// GET  /lti/login  — Universal LTI 1.3 OIDC step-1 (any LMS)
// GET  /lti/jwks   — Tool's public key (LMSs fetch this to trust your tool)
// ─────────────────────────────────────────────────────────────────
router.post('/launch', ltiController.launch.bind(ltiController));
router.get('/lti/login', universalLtiController.oidcLogin.bind(universalLtiController));
router.get('/lti/jwks',  universalLtiController.jwks.bind(universalLtiController));

// ─────────────────────────────────────────────────────────────────
// SESSION RESTORE  (issued by /launch, kept server-side for clean URLs)
// GET /api/session/:id  — returns the stored LTI context for a session
// ─────────────────────────────────────────────────────────────────
router.get('/session/:id', (req: Request, res: Response) => {
    const ctx = getSession(req.params.id);
    if (!ctx) {
        res.status(404).json({ error: 'Session not found or expired. Please re-launch from Vibe.' });
        return;
    }
    res.json({ success: true, context: ctx });
});

// ─────────────────────────────────────────────────────────────────
// QUIZ / EXAM ROUTES
// ─────────────────────────────────────────────────────────────────
router.post('/submit', examController.submitScore.bind(examController));
router.post('/deep-link-create', examController.createDeepLinkedExam.bind(examController));
router.get('/exam/:title', examController.getExamByTitle.bind(examController));

// ─────────────────────────────────────────────────────────────────
// ACTIVITY ROUTES  (server-to-server calls from VIBE backend)
// ─────────────────────────────────────────────────────────────────
// LTI-facing create/update with optional document upload
router.post('/activities', upload.single('document'), async (req: Request, res: Response) => {
    try {
        let document_url: string | undefined;
        let document_name: string | undefined;
        if (req.file) {
            const activityId = req.body.activity_id ||
                `${(req.body.courseId || '').toLowerCase()}-${(req.body.title || '').toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
            document_url = await cloudStorageService.uploadActivityDocument(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                activityId
            );
            document_name = req.file.originalname;
            req.body.document_url = document_url;
            req.body.document_name = document_name;
            req.body.activity_id = activityId;
        }
        return activityController.createOrUpdateActivity(req, res);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to process activity creation', detail: err.message });
    }
});
router.get('/activities/:courseId', activityController.getActivitiesByCourse.bind(activityController));
router.post('/activities/:activityId/submit', activityController.submitActivity.bind(activityController));
router.get('/activities/:activityId/submissions/:userId', activityController.getUserSubmissions.bind(activityController));
router.get('/activities/bp/:studentId/:courseId', activityController.getBrowniePointsForStudent.bind(activityController));

// ─────────────────────────────────────────────────────────────────
// PUBLIC LTI ROUTES  (browser-facing — called directly by LTI frontend)
// ActivityDetail.tsx, StudentBPDashboard.tsx, etc. use these paths.
// No shared secret is required; they rely on the LTI JWT via /api/launch.
// ─────────────────────────────────────────────────────────────────

// GET /api/lti/courseName/:courseId
router.get('/lti/courseName/:courseId', async (req: Request, res: Response) => {
    try {
        const fetchResponse = await fetch(`${process.env.VIBE_BASE_URL || 'http://localhost:3141'}/api/lti/nrps/${req.params.courseId}`, {
            headers: { 'x-lti-secret': process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production' }
        });
        const data = await fetchResponse.json();
        res.json({ success: true, courseName: data.courseName });
    } catch (err: any) {
        res.json({ success: false, error: err.message });
    }
});

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

// GET /api/lti/document/:fileId  — instructor-uploaded activity document
router.get('/lti/document/:fileId', async (req: Request, res: Response) => {
    try {
        const { stream, metadata } = await cloudStorageService.downloadDocument(req.params.fileId);
        const disposition = req.query.download === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${metadata.originalName}"`);
        res.setHeader('Content-Type', metadata.contentType);
        stream.pipe(res);
    } catch (err: any) {
        res.status(404).json({ error: 'Document not found', detail: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// MILESTONE PROGRESS WEBHOOK
// Called by Vibe (or any LMS) when a student's course progress changes.
// Secured via x-lti-secret header (replace with OAuth2 bearer for generic LMS).
// ─────────────────────────────────────────────────────────────────
router.post('/lti/progress-webhook', async (req: Request, res: Response) => {
    try {
        const { validateWebhookSecret, checkAndAwardMilestones } =
            await import('../milestone/milestoneService.js');

        const secret = req.headers['x-lti-secret'] as string | undefined;
        if (!validateWebhookSecret(secret)) {
            res.status(401).json({ error: 'Unauthorized: invalid x-lti-secret' });
            return;
        }

        const { userId, courseId, percentCompleted } = req.body;
        if (!userId || !courseId || percentCompleted === undefined) {
            res.status(400).json({ error: 'Missing required fields: userId, courseId, percentCompleted' });
            return;
        }

        console.log(`[Milestone Webhook] userId=${userId} courseId=${courseId} progress=${percentCompleted}%`);

        // Run milestone check in the background — respond immediately so Vibe isn't blocked
        res.json({ success: true, message: 'Progress received, checking milestones...' });

        checkAndAwardMilestones(userId, courseId, Number(percentCompleted))
            .then(({ awarded, details }) => {
                if (awarded > 0) {
                    console.log(`[Milestone Webhook] Awarded BP for ${awarded} milestone(s):`, details);
                }
            })
            .catch((err: Error) => {
                console.error('[Milestone Webhook] Error in milestone check:', err.message);
            });

    } catch (err: any) {
        console.error('[Milestone Webhook] Fatal error:', err.message);
        res.status(500).json({ error: 'Internal server error', detail: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// BROWNIE POINTS ROUTES  (instructor-facing, called via LTI launch)
// ─────────────────────────────────────────────────────────────────

// POST /api/lti/milestone-backfill/:courseId
// Instructor-triggered: checks ALL students' current Vibe progress NOW
// and awards BP to anyone already above the VIBE_MILESTONE threshold.
router.post('/lti/milestone-backfill/:courseId', async (req: Request, res: Response) => {
    try {
        const secret = req.headers['x-lti-secret'] as string | undefined;
        const expectedSecret = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';
        if (!secret || secret !== expectedSecret) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { courseId } = req.params;
        const { backfillMilestoneAwards } = await import('../milestone/milestoneBackfill.js');
        console.log(`[Milestone Backfill] Starting for course ${courseId}`);
        const result = await backfillMilestoneAwards(courseId);
        console.log(`[Milestone Backfill] Done: ${result.studentsAwarded}/${result.studentsChecked} students awarded ${result.totalBpAwarded} total BP`);
        res.json({ success: true, ...result });
    } catch (err: any) {
        console.error('[Milestone Backfill] Error:', err.message);
        res.status(500).json({ error: 'Backfill failed', detail: err.message });
    }
});

router.get('/bp/:courseId', bpController.getPointsByCourse.bind(bpController));
router.get('/bp/student/:courseId/:studentId', bpController.getStudentPoints.bind(bpController));
router.patch('/bp/:courseId/:studentId', bpController.adjustPointsForStudent.bind(bpController));
router.post('/bp/sync/:courseId', bpController.manuallySyncRoster.bind(bpController));

// ─────────────────────────────────────────────────────────────────
// DATA EXPORT  (CSV / Excel for course dashboard)
// GET /api/lti/export/:courseId?format=csv|excel
// Returns: Student Name, Student Email, Current BP
// ─────────────────────────────────────────────────────────────────
router.get('/lti/export/:courseId', async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        const format = (req.query.format as string || 'csv').toLowerCase();

        const { connectDB } = await import('../db/connection.js');
        await connectDB();

        const { BrowniePointModel } = await import('../models/BrowniePoint.js');
        const bpRecords = await BrowniePointModel.find({ courseId }).lean();

        // Build simplified rows: Name, Email, BP only
        const rows = bpRecords.map((r: any) => ({
            'Student Name': r.studentName || '',
            'Student Email': r.studentEmail || '',
            'Current BP': typeof r.points === 'number' ? Math.round(r.points * 100) / 100 : 0,
        }));

        const headers = ['Student Name', 'Student Email', 'Current BP'];

        if (format === 'excel') {
            const tsv = [
                headers.join('\t'),
                ...rows.map(r => headers.map(h => String((r as any)[h]).replace(/\t/g, ' ')).join('\t')),
            ].join('\n');
            res.setHeader('Content-Type', 'application/vnd.ms-excel');
            res.setHeader('Content-Disposition', `attachment; filename="brownie_points_${courseId}.xls"`);
            res.send('\uFEFF' + tsv);
        } else {
            const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
            const csv = [
                headers.map(escape).join(','),
                ...rows.map(r => headers.map(h => escape(String((r as any)[h]))).join(',')),
            ].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="brownie_points_${courseId}.csv"`);
            res.send('\uFEFF' + csv);
        }
    } catch (err: any) {
        console.error('[Export] Error:', err.message);
        res.status(500).json({ error: 'Export failed', detail: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// COURSE INCENTIVES (per-course, instructor publish workflow)
// GET    /api/lti/incentives/:courseId          — fetch (instructor: draft+published; student: published only)
// PUT    /api/lti/incentives/:courseId          — save draft (instructor)
// PATCH  /api/lti/incentives/:courseId/publish  — toggle publish (instructor)
// ─────────────────────────────────────────────────────────────────

// GET — returns the incentives doc for a course
router.get('/lti/incentives/:courseId', async (req: Request, res: Response) => {
    try {
        const { connectDB } = await import('../db/connection.js');
        await connectDB();
        const { CourseIncentivesModel } = await import('../models/index.js');
        const doc = await CourseIncentivesModel.findOne({ course_id: req.params.courseId }).lean();
        res.json({ success: true, data: doc || { course_id: req.params.courseId, content: '', is_published: false } });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch incentives', detail: err.message });
    }
});

// PUT — save draft content (instructor)
router.put('/lti/incentives/:courseId', async (req: Request, res: Response) => {
    try {
        const { connectDB } = await import('../db/connection.js');
        await connectDB();
        const { CourseIncentivesModel } = await import('../models/index.js');
        const { content, userId } = req.body;
        const doc = await CourseIncentivesModel.findOneAndUpdate(
            { course_id: req.params.courseId },
            { $set: { content: content || '', updated_at: new Date(), updated_by: userId || null } },
            { upsert: true, new: true }
        );
        res.json({ success: true, data: doc });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to save incentives', detail: err.message });
    }
});

// PATCH — toggle publish state (instructor)
router.patch('/lti/incentives/:courseId/publish', async (req: Request, res: Response) => {
    try {
        const { connectDB } = await import('../db/connection.js');
        await connectDB();
        const { CourseIncentivesModel } = await import('../models/index.js');
        const { is_published, userId } = req.body;
        const doc = await CourseIncentivesModel.findOneAndUpdate(
            { course_id: req.params.courseId },
            { $set: { is_published: !!is_published, updated_at: new Date(), updated_by: userId || null } },
            { upsert: true, new: true }
        );
        res.json({ success: true, data: doc });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to update publish state', detail: err.message });
    }
});

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
// ─────────────────────────────────────────────────────────────────
// ADMIN — LMS PLATFORM REGISTRATION
// Protected by x-admin-secret header (set ADMIN_SECRET in .env).
// Used once per LMS by the tool administrator to register a new platform.
// ─────────────────────────────────────────────────────────────────
router.post('/admin/platforms',        adminPlatformController.create.bind(adminPlatformController));
router.get('/admin/platforms',         adminPlatformController.list.bind(adminPlatformController));
router.get('/admin/platforms/:id',     adminPlatformController.getOne.bind(adminPlatformController));
router.put('/admin/platforms/:id',     adminPlatformController.update.bind(adminPlatformController));
router.delete('/admin/platforms/:id',  adminPlatformController.deactivate.bind(adminPlatformController));

// ─────────────────────────────────────────────────────────────────
// DOUBT EXCHANGE ROUTES
// ─────────────────────────────────────────────────────────────────

// Config (instructor)
router.get('/doubt/config/:courseId',            doubt.getConfig);
router.put('/doubt/config/:courseId',            doubt.updateConfig);

// Student directory
router.get('/doubt/students/:courseId',          doubt.getStudents);

// Requests
router.post('/doubt/requests',                   doubt.createRequest);
router.get('/doubt/requests/:courseId/:userId',  doubt.getMyRequests);
router.patch('/doubt/requests/:requestId/accept', doubt.acceptRequest);
router.patch('/doubt/requests/:requestId/reject', doubt.rejectRequest);

// Proof submission (with file upload)
router.post('/doubt/requests/:requestId/proof',  upload.single('proof'), doubt.submitProof);

// Notifications
router.get('/doubt/notifications/:userId/:courseId',  doubt.getNotifications);
router.patch('/doubt/notifications/:userId/:courseId/read', doubt.markRead);

// Instructor: Audit
router.get('/doubt/audit/:courseId',             doubt.getAuditLog);
router.patch('/doubt/audit/:requestId/review',   doubt.markReviewed);

// Instructor: Disputes
router.get('/doubt/disputes/:courseId',          doubt.getDisputes);
router.post('/doubt/disputes/:requestId/settle', doubt.forceSettle);
router.post('/doubt/disputes/:requestId/refund', doubt.forceRefund);

// Analytics & Graph
router.get('/doubt/analytics/:courseId',         doubt.getAnalytics);
router.get('/doubt/graph/:courseId',             doubt.getEndorsementGraph);

