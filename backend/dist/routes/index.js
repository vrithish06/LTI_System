import { Router } from 'express';
import { validateLtiToken } from '../lti/ltiValidator.js';
import { submitScoreToVibe } from '../grades/gradeService.js';
import { ExamModel } from '../models/Exam.js';
import { BrowniePointModel } from '../models/BrowniePoint.js';
import axios from 'axios';
export const router = Router();
// ─────────────────────────────────────────────────────────────────
// LTI LAUNCH
// ─────────────────────────────────────────────────────────────────
/**
 * POST /api/launch
 * Validates the JWT from Vibe and returns the decoded LTI context.
 * If this is a teacher (Instructor), also syncs roster from Vibe via NRPS.
 */
router.post('/launch', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        res.status(400).json({ error: 'Missing LTI token' });
        return;
    }
    try {
        const context = await validateLtiToken(token);
        // ── NRPS Roster Sync on Instructor login ──────────────────────
        if (context.role === 'Instructor' && context.courseId) {
            syncRosterForCourse(context.courseId).catch(err => console.warn('[NRPS] Background sync failed:', err.message));
        }
        res.json({ success: true, context });
    }
    catch (error) {
        console.error('[Launch] Token validation failed:', error.message);
        res.status(401).json({ error: 'Invalid LTI token', detail: error.message });
    }
});
// ─────────────────────────────────────────────────────────────────
// QUIZ / EXAM ENDPOINTS
// ─────────────────────────────────────────────────────────────────
/**
 * POST /api/submit
 * Student submits quiz score. We record it and push HP to Vibe.
 */
router.post('/submit', async (req, res) => {
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
        res.json({ success: true, message: `Score ${scoreGiven}/${scoreMaximum} submitted to Vibe!` });
    }
    catch (error) {
        console.error('[Submit] Score submission failed:', error.message);
        res.status(500).json({ error: 'Failed to submit score', detail: error.message });
    }
});
/**
 * POST /api/deep-link-create
 * Teacher creates an exam via the LTI deep-linking flow.
 * Saves/upserts into MongoDB.
 */
router.post('/deep-link-create', async (req, res) => {
    const { title, text, questions, context } = req.body;
    if (questions && questions.length > 0 && context?.courseId) {
        await ExamModel.findOneAndUpdate({ courseId: context.courseId, title }, { title, description: text, courseId: context.courseId, courseVersionId: context.courseVersionId, questions }, { upsert: true, new: true });
        console.log(`[Exam] Saved "${title}" with ${questions.length} questions for course ${context.courseId}.`);
    }
    const payload = {
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [{
                type: 'ltiResourceLink',
                title: title || 'Deep Linked Activity',
                text: text || 'An activity created from the LTI Tool',
                url: 'http://localhost:5174/'
            }]
    };
    res.json({ success: true, JWT: JSON.stringify(payload) });
});
/**
 * GET /api/exam/:title
 * Student loads exam questions identified by activity title.
 * Falls back to courseId query param for disambiguation.
 */
router.get('/exam/:title', async (req, res) => {
    const title = decodeURIComponent(req.params.title);
    const courseId = req.query.courseId;
    const filter = { title };
    if (courseId)
        filter.courseId = courseId;
    const exam = await ExamModel.findOne(filter).sort({ updatedAt: -1 });
    if (exam) {
        res.json({ success: true, exam });
    }
    else {
        res.json({ success: false, error: 'Exam not found' });
    }
});
// ─────────────────────────────────────────────────────────────────
// BROWNIE POINTS ENDPOINTS
// ─────────────────────────────────────────────────────────────────
/**
 * GET /api/bp/:courseId
 * Returns all students' brownie points for a course.
 * The teacher must provide courseId and their Vibe auth token (forwarded to Vibe for verification).
 */
router.get('/bp/:courseId', async (req, res) => {
    const { courseId } = req.params;
    try {
        const records = await BrowniePointModel.find({ courseId }).sort({ studentName: 1 });
        res.json({ success: true, data: records });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch brownie points', detail: err.message });
    }
});
/**
 * PATCH /api/bp/:courseId/:studentId
 * Instructor manually adjusts a student's brownie points (delta).
 * Body: { delta: number, reason: string, instructorName: string }
 */
router.patch('/bp/:courseId/:studentId', async (req, res) => {
    const { courseId, studentId } = req.params;
    const { delta, reason, instructorName } = req.body;
    if (delta === undefined || isNaN(Number(delta))) {
        res.status(400).json({ error: 'delta (number) is required' });
        return;
    }
    try {
        const record = await BrowniePointModel.findOneAndUpdate({ studentId, courseId }, {
            $inc: { points: Number(delta) },
            $push: {
                history: {
                    delta: Number(delta),
                    reason: reason || '',
                    awardedBy: instructorName || 'Instructor',
                    awardedAt: new Date(),
                }
            },
        }, { new: true });
        if (!record) {
            res.status(404).json({ error: 'Student record not found. Run roster sync first.' });
            return;
        }
        res.json({ success: true, data: record });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update brownie points', detail: err.message });
    }
});
/**
 * POST /api/bp/sync/:courseId
 * Triggers a manual NRPS roster sync for a course.
 * Creates BP records (with 0 points) for any new students.
 */
router.post('/bp/sync/:courseId', async (req, res) => {
    const { courseId } = req.params;
    try {
        const synced = await syncRosterForCourse(courseId);
        res.json({ success: true, synced });
    }
    catch (err) {
        res.status(500).json({ error: 'Roster sync failed', detail: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'LTI_System' });
});
// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
/**
 * Calls Vibe's NRPS endpoint to get the student roster for a course.
 * Creates BrowniePoint docs (points=0) for any student not yet in DB.
 */
async function syncRosterForCourse(courseId) {
    const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';
    const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';
    // Quick ping to check controller health
    try {
        const pingUrl = `${VIBE_BASE_URL}/api/lti/ping`;
        const pingRes = await axios.get(pingUrl);
        console.log(`[NRPS] Vibe LTI check: ${pingRes.data.status}`);
    }
    catch (px) {
        console.warn(`[NRPS] Vibe LTI ping failed at ${VIBE_BASE_URL}/api/lti/ping: This warns us the controller might not be loaded.`);
    }
    const targetUrl = `${VIBE_BASE_URL}/api/lti/nrps/${courseId}`;
    console.log(`[NRPS] Attempting sync call to Vibe: ${targetUrl}`);
    try {
        const { data } = await axios.get(targetUrl, {
            headers: { 'x-lti-secret': LTI_SHARED_SECRET },
            timeout: 10000,
        });
        const members = data.members || [];
        let newCount = 0;
        for (const member of members) {
            const existing = await BrowniePointModel.findOne({ studentId: member.userId, courseId });
            if (!existing) {
                await BrowniePointModel.create({
                    studentId: member.userId,
                    courseId,
                    studentName: member.name,
                    studentEmail: member.email,
                    points: 0,
                    history: [],
                    lastSyncedAt: new Date(),
                });
                newCount++;
            }
            else {
                // Update name/email in case they changed
                await BrowniePointModel.updateOne({ studentId: member.userId, courseId }, { studentName: member.name, studentEmail: member.email, lastSyncedAt: new Date() });
            }
        }
        console.log(`[NRPS] Synced course ${courseId}: ${members.length} members, ${newCount} new.`);
        return newCount;
    }
    catch (err) {
        console.error(`[NRPS] Sync failed for course ${courseId}:`);
        console.error(`       URL: ${targetUrl}`);
        if (err.response) {
            console.error(`       Status: ${err.response.status}`);
            console.error(`       Payload: ${JSON.stringify(err.response.data)}`);
        }
        else {
            console.error(`       Message: ${err.message}`);
        }
        throw err;
    }
}
