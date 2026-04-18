import cron from 'node-cron';
import { connectDB } from '../db/connection.js';
import {
    UserModel,
    ActivityModel,
    SubmissionModel,
    ProcessedOverdueModel,
    type IActivity,
    type ActivityRules,
} from '../models/index.js';
import { applyPenalty, applyPercentagePenalty } from '../hp/hpService.js';

interface OverdueWork {
    user_id: string;
    course_id: string;
    activity: IActivity;
}

/**
 * Finds all (learner, activity) pairs that are:
 *   - Mandatory
 *   - Past deadline + grace_period
 *   - Not yet submitted
 *   - Not already penalized (idempotency via processed_overdue collection)
 */
async function findOverdueCandidates(): Promise<OverdueWork[]> {
    await connectDB();
    const { BrowniePointModel } = await import('../models/BrowniePoint.js');

    const now = new Date();

    // All mandatory activities whose effective deadline has passed
    const overdueActivities = await ActivityModel.find({
        is_mandatory: true,
        deadline: { $ne: null, $lt: now },   // rough filter; grace checked below
    });

    const candidates: OverdueWork[] = [];

    for (const activity of overdueActivities) {
        // Check effective deadline including grace period
        const graceEnd = new Date(
            activity.deadline!.getTime() + (activity.grace_period ?? 0) * 60_000,
        );
        if (now <= graceEnd) continue;   // still within grace — skip

        // All learners enrolled in this course according to the roster
        const learners = await BrowniePointModel.find({ courseId: activity.course_id });

        for (const learner of learners) {
            const user_id = learner.studentId;
            const activity_id = activity.activity_id;

            // Already submitted?
            const hasSubmission = await SubmissionModel.exists({ user_id, activity_id });
            if (hasSubmission) continue;

            // Already penalized?
            const alreadyProcessed = await ProcessedOverdueModel.exists({ user_id, activity_id });
            if (alreadyProcessed) continue;

            candidates.push({ user_id, course_id: activity.course_id, activity });
        }
    }

    return candidates;
}

/**
 * Applies overdue penalty for a single (user, activity) pair and marks it
 * as processed so it is never double-applied.
 */
async function processOverdue(work: OverdueWork): Promise<void> {
    const { user_id, course_id, activity } = work;
    const { activity_id, title, rules } = activity;
    const r: ActivityRules = rules ?? {};

    try {
        if (r.late_penalty_percent) {
            await applyPercentagePenalty(
                user_id,
                course_id,
                r.late_penalty_percent,
                activity_id,
                `Did not complete mandatory activity: ${title}`,
            );
        } else if (r.late_penalty_hp) {
            await applyPenalty(
                user_id,
                course_id,
                r.late_penalty_hp,
                activity_id,
                `Did not complete mandatory activity: ${title}`,
            );
        } else {
            // Default fallback: –5% of current balance
            await applyPercentagePenalty(
                user_id,
                course_id,
                5,
                activity_id,
                `Did not complete mandatory activity: ${title}`,
            );
        }

        // Mark processed — insertOne with unique index ensures idempotency
        await ProcessedOverdueModel.create({ user_id, activity_id });

        console.log(`[Cron] ✓ Penalty applied: user=${user_id} activity=${activity_id}`);
    } catch (err: any) {
        // Duplicate key = already processed by a concurrent run — safe to ignore
        if (err.code === 11000) return;
        console.error(`[Cron] ✗ Failed for user=${user_id} activity=${activity_id}:`, err.message);
    }
}

/** Run the overdue scan immediately (also exported for manual trigger). */
export async function runOverdueJob(): Promise<void> {
    console.log(`[Cron] Overdue scan started at ${new Date().toISOString()}`);
    const candidates = await findOverdueCandidates();
    console.log(`[Cron] Found ${candidates.length} overdue candidate(s)`);
    // Process sequentially to avoid session conflicts
    for (const c of candidates) {
        await processOverdue(c);
    }
    console.log('[Cron] Overdue scan complete.');
}

/**
 * Register the cron schedule. Default: every minute.
 * Pass '0 * * * *' for hourly in production.
 */
export function startCronJobs(schedule: string = '* * * * *'): void {
    console.log(`[Cron] Scheduling overdue job: "${schedule}"`);
    cron.schedule(schedule, () => {
        runOverdueJob().catch((err) =>
            console.error('[Cron] Unhandled error in overdue job:', err.message),
        );
    });
    console.log('[Cron] Overdue penalty job started ✓');
}
