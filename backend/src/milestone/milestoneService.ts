/**
 * Milestone Service
 *
 * When Vibe (or any LMS) calls the /api/lti/progress-webhook endpoint,
 * this service checks whether the student has crossed the threshold
 * for any VIBE_MILESTONE activity in that course, and awards BP exactly once.
 */

import { connectDB } from '../db/connection.js';
import {
    ActivityModel,
    SubmissionModel,
    HpBalanceModel,
    type IActivity,
} from '../models/index.js';
import { ProcessedMilestoneModel } from '../models/processedMilestone.js';
import { applyReward } from '../hp/hpService.js';

const LTI_SHARED_SECRET =
    process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

/**
 * Validates the x-lti-secret header on the progress webhook.
 * In future: replace with OAuth2 Bearer token verification.
 */
export function validateWebhookSecret(secret: string | undefined): boolean {
    return !!(secret && secret === LTI_SHARED_SECRET);
}

/**
 * Core milestone check — called whenever a student's progress percentage changes.
 *
 * Flow:
 * 1. Fetch all VIBE_MILESTONE activities for the course
 * 2. For each milestone whose target_percent <= the student's current progress:
 *    a. Check idempotency table (ProcessedMilestone) — skip if already awarded
 *    b. Award BP using hpService.applyReward
 *    c. Create a COMPLETED submission record
 *    d. Insert into ProcessedMilestone to prevent double-awarding
 *
 * @param userId         The student's userId
 * @param courseId       The course they are enrolled in
 * @param percentCompleted  Their latest course completion percentage (0–100)
 */
export async function checkAndAwardMilestones(
    userId: string,
    courseId: string,
    percentCompleted: number,
): Promise<{ awarded: number; details: string[] }> {
    await connectDB();

    const milestones = await ActivityModel.find({
        course_id: courseId,
        type: 'VIBE_MILESTONE',
    }).lean();

    if (!milestones.length) {
        return { awarded: 0, details: [] };
    }

    const details: string[] = [];
    let awarded = 0;

    for (const milestone of milestones) {
        const targetPercent: number = (milestone.rules as any)?.target_percent ?? 100;
        const rewardBp: number = (milestone.rules as any)?.reward_hp ?? 0;

        if (percentCompleted < targetPercent) {
            continue; // Student hasn't hit the threshold yet
        }

        // Idempotency check
        const alreadyProcessed = await ProcessedMilestoneModel.findOne({
            user_id: userId,
            activity_id: milestone.activity_id,
        });

        if (alreadyProcessed) {
            continue; // Already awarded — skip
        }

        // Award BP
        if (rewardBp > 0) {
            try {
                await applyReward(
                    userId,
                    courseId,
                    rewardBp,
                    milestone.activity_id,
                    `Milestone reached: ${milestone.title} (${targetPercent}% completion)`,
                );
            } catch (err) {
                console.error(`[Milestone] Failed to award BP for ${milestone.activity_id}:`, err);
                continue;
            }
        }

        // Create submission record
        await SubmissionModel.findOneAndUpdate(
            { user_id: userId, activity_id: milestone.activity_id },
            {
                $set: {
                    user_id: userId,
                    activity_id: milestone.activity_id,
                    course_id: courseId,
                    status: 'COMPLETED',
                    submitted_at: new Date(),
                    penalty_applied: false,
                },
            },
            { upsert: true },
        );

        // Mark as processed (idempotency guard)
        await ProcessedMilestoneModel.create({
            user_id: userId,
            activity_id: milestone.activity_id,
            awarded_bp: rewardBp,
            processed_at: new Date(),
        });

        awarded++;
        details.push(
            `Awarded ${rewardBp} BP for milestone "${milestone.title}" (target: ${targetPercent}%)`,
        );
        console.log(
            `[Milestone] ✅ Awarded ${rewardBp} BP to user ${userId} for "${milestone.title}"`,
        );
    }

    return { awarded, details };
}
