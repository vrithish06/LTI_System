import { Request, Response } from 'express';
import {
    registerActivity,
    getActivitiesByCourse,
    submitActivity,
    getUserSubmissions,
    updateActivity,
    deleteActivity,
} from '../activity/activityService.js';
import { getHpBalance } from '../hp/hpService.js';

/**
 * Controller that exposes activity management and submission REST APIs.
 * VIBE is the trigger layer; this LTI backend is the source of truth for
 * activities, submissions, and Brownie Points.
 */
export class ActivityController {
    /**
     * POST /api/activities
     * Body: { title, description, activityType, deadline, rewardType, rewardValue, mandatory, ... }
     * Flexible endpoint called by LTI frontend to create/update activities.
     * If context.isDeepLinking is present, returns an LTI Deep Linking JWT.
     */
    public async createOrUpdateActivity(req: Request, res: Response): Promise<void> {
        try {
            const body = req.body;
            const title = body.title;
            const description = body.description || '';
            const activityType = body.activityType || body.type;
            const deadline = body.deadline;
            const rewardType = body.rewardType;
            const rewardValue = body.rewardValue;
            const mandatory = body.mandatory !== undefined ? body.mandatory : body.is_mandatory;
            const penaltyType = body.penaltyType;
            const penaltyValue = body.penaltyValue;
            const submissionMode = body.submissionMode;
            const hpAssignmentMode = body.hpAssignmentMode;
            const gracePeriodDuration = body.gracePeriodDuration;
            const graceRewardPercentage = body.graceRewardPercentage;
            const courseId = body.courseId || body.course_id;
            const courseVersionId = body.courseVersionId;
            const context = body.context;

            if (!courseId || !title || !activityType) {
                const missing = [];
                if (!courseId) missing.push('courseId');
                if (!title) missing.push('title');
                if (!activityType) missing.push('activityType');
                
                res.status(400).json({
                    error: `Missing required fields: ${missing.join(', ')}`,
                    received: { courseId, title, activityType }
                });
                return;
            }

            // 1. Generate or determine activity_id (slugify title if new)
            const activity_id = req.body.activity_id || 
                `${courseId.toLowerCase()}-${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;

            // 2. Construct rules object for HP engine
            const rules = {
                reward_hp: Number(rewardValue) || 10,
                reward_type: rewardType || 'ABSOLUTE',
                late_penalty_hp: mandatory && penaltyType === 'ABSOLUTE' ? Number(penaltyValue) : 0,
                late_penalty_percent: mandatory && penaltyType === 'PERCENTAGE' ? Number(penaltyValue) : 0,
                hp_assignment_mode: hpAssignmentMode || 'AUTOMATIC',
                submission_mode: submissionMode || 'IN_PLATFORM',
                description: description || '',
            };

            // 3. Persist in LTI database
            const activity = await registerActivity({
                activity_id,
                course_id: courseId,
                title,
                type: activityType,
                deadline,
                grace_period: Number(gracePeriodDuration) * 60, // convert hours to minutes
                rules,
                is_mandatory: mandatory !== false,
            });

            // 4. Generate Deep Linking JWT if in deep-linking mode
            let JWT = null;
            if (context?.isDeepLinking) {
                const payload = {
                    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
                    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
                    'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [{
                        type: 'ltiResourceLink',
                        title: title,
                        text: description || 'LTI Activity',
                        url: `${process.env.LTI_FRONTEND_URL || 'http://localhost:5174'}/?activityId=${activity_id}`
                    }]
                };
                JWT = JSON.stringify(payload);
            }

            res.status(201).json({ success: true, data: activity, JWT });
        } catch (err: any) {
            console.error('[Activity Create] Error:', err.message);
            res.status(500).json({ error: 'Failed to register activity', detail: err.message });
        }
    }

    /**
     * GET /api/activities/:courseId
     * Returns all activities for a given course, sorted by deadline ascending.
     */
    public async getActivitiesByCourse(req: Request, res: Response): Promise<void> {
        try {
            const { courseId } = req.params;
            const activities = await getActivitiesByCourse(courseId);
            res.json({ success: true, data: activities });
        } catch (err: any) {
            console.error('[Activity Fetch] Error:', err.message);
            res.status(500).json({ error: 'Failed to fetch activities', detail: err.message });
        }
    }

    /**
     * POST /api/activities/:activityId/submit
     * Body: { user_id, course_id, score?, score_max? }
     * Records the submission and automatically updates Brownie Points via hpService.
     */
    public async submitActivity(req: Request, res: Response): Promise<void> {
        try {
            const { activityId } = req.params;
            const { user_id, course_id, score, score_max } = req.body;

            if (!user_id || !course_id) {
                res.status(400).json({ error: '`user_id` and `course_id` are required' });
                return;
            }

            const result = await submitActivity({
                user_id,
                activity_id: activityId,
                course_id,
                score,
                score_max,
            });

            res.json({ success: true, data: result });
        } catch (err: any) {
            console.error('[Activity Submit] Error:', err.message);
            res.status(500).json({ error: 'Failed to submit activity', detail: err.message });
        }
    }

    /**
     * GET /api/activities/:activityId/submissions/:userId
     * Returns all submissions for a student within a course.
     */
    public async getUserSubmissions(req: Request, res: Response): Promise<void> {
        try {
            const { userId, courseId } = req.params;
            const submissions = await getUserSubmissions(userId, courseId);
            res.json({ success: true, data: submissions });
        } catch (err: any) {
            console.error('[Submission Fetch] Error:', err.message);
            res.status(500).json({ error: 'Failed to fetch submissions', detail: err.message });
        }
    }

    /**
     * GET /api/bp/:studentId/:courseId
     * Returns the current Brownie Points balance for a specific student in a course.
     * Used by VIBE when `useExternalBP` is enabled.
     */
    public async getBrowniePointsForStudent(req: Request, res: Response): Promise<void> {
        try {
            const { studentId, courseId } = req.params;
            const balance = await getHpBalance(studentId, courseId);

            if (!balance) {
                res.status(404).json({
                    error: 'No HP record found for this student in this course',
                });
                return;
            }

            res.json({ success: true, data: balance });
        } catch (err: any) {
            console.error('[BP Fetch Student] Error:', err.message);
            res.status(500).json({ error: 'Failed to fetch brownie points', detail: err.message });
        }
    }
    /**
     * PUT /api/lti/activities/:activityId
     * Body: same fields as create (all optional)
     * Instructor-only: update an existing activity.
     */
    public async updateActivityById(req: Request, res: Response): Promise<void> {
        try {
            const { activityId } = req.params;
            const body = req.body;

            const rules: any = {};
            if (body.rewardValue !== undefined) rules.reward_hp = Number(body.rewardValue);
            if (body.rewardType !== undefined) rules.reward_type = body.rewardType;
            if (body.penaltyType !== undefined && body.mandatory) {
                if (body.penaltyType === 'ABSOLUTE') rules.late_penalty_hp = Number(body.penaltyValue) || 0;
                if (body.penaltyType === 'PERCENTAGE') rules.late_penalty_percent = Number(body.penaltyValue) || 0;
            }
            if (body.hpAssignmentMode !== undefined) rules.hp_assignment_mode = body.hpAssignmentMode;
            if (body.submissionMode !== undefined) rules.submission_mode = body.submissionMode;
            if (body.description !== undefined) rules.description = body.description;

            const updated = await updateActivity(activityId, {
                title: body.title,
                type: body.activityType,
                deadline: body.deadline ? new Date(body.deadline) : undefined,
                grace_period: body.gracePeriodDuration !== undefined ? Number(body.gracePeriodDuration) * 60 : undefined,
                rules: Object.keys(rules).length > 0 ? rules : undefined,
                is_mandatory: body.mandatory !== undefined ? body.mandatory : undefined,
            });

            if (!updated) {
                res.status(404).json({ error: 'Activity not found' });
                return;
            }
            res.json({ success: true, data: updated });
        } catch (err: any) {
            console.error('[Activity Update] Error:', err.message);
            res.status(500).json({ error: 'Failed to update activity', detail: err.message });
        }
    }

    /**
     * DELETE /api/lti/activities/:activityId
     * Instructor-only: delete an activity.
     */
    public async deleteActivityById(req: Request, res: Response): Promise<void> {
        try {
            const { activityId } = req.params;
            const deleted = await deleteActivity(activityId);
            if (!deleted) {
                res.status(404).json({ error: 'Activity not found' });
                return;
            }
            res.json({ success: true, message: 'Activity deleted' });
        } catch (err: any) {
            console.error('[Activity Delete] Error:', err.message);
            res.status(500).json({ error: 'Failed to delete activity', detail: err.message });
        }
    }
}

export const activityController = new ActivityController();
