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
import { runMilestoneCron } from '../milestone/milestoneService.js';

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

    const now = new Date();

    const overdueActivities = await ActivityModel.find({
        is_mandatory: true,
        deadline: { $ne: null, $lt: now },
        type: { $ne: 'VIBE_MILESTONE' }, // milestones are progress-based, never overdue
    });

    const candidates: OverdueWork[] = [];

    for (const activity of overdueActivities) {
        const graceEnd = new Date(
            activity.deadline!.getTime() + (activity.grace_period ?? 0) * 60_000,
        );
        if (now <= graceEnd) continue;

        const learners = await UserModel.find({ course_id: activity.course_id, role: 'Learner' });

        for (const learner of learners) {
            const user_id = learner.user_id;
            const activity_id = activity.activity_id;

            const hasSubmission = await SubmissionModel.exists({ user_id, activity_id });
            if (hasSubmission) continue;

            const alreadyProcessed = await ProcessedOverdueModel.exists({ user_id, activity_id });
            if (alreadyProcessed) continue;

            candidates.push({ user_id, course_id: activity.course_id, activity });
        }
    }

    return candidates;
}

async function processOverdue(work: OverdueWork): Promise<void> {
    const { user_id, course_id, activity } = work;
    const { activity_id, title, rules } = activity;
    const r: ActivityRules = rules ?? {};

    try {
        if (r.overdue_penalty_percent) {
            await applyPercentagePenalty(user_id, course_id, r.overdue_penalty_percent, activity_id, `Did not complete mandatory activity: ${title}`);
        } else if (r.overdue_penalty_hp) {
            await applyPenalty(user_id, course_id, r.overdue_penalty_hp, activity_id, `Did not complete mandatory activity: ${title}`);
        } else {
            await applyPercentagePenalty(user_id, course_id, 5, activity_id, `Did not complete mandatory activity: ${title}`);
        }

        await ProcessedOverdueModel.create({ user_id, activity_id });
        console.log(`[Cron] ✓ Penalty applied: user=${user_id} activity=${activity_id}`);
    } catch (err: any) {
        if (err.code === 11000) return;
        console.error(`[Cron] ✗ Failed for user=${user_id} activity=${activity_id}:`, err.message);
    }
}

export async function runOverdueJob(): Promise<void> {
    console.log(`[Cron] Overdue scan started at ${new Date().toISOString()}`);
    const candidates = await findOverdueCandidates();
    console.log(`[Cron] Found ${candidates.length} overdue candidate(s)`);
    for (const c of candidates) {
        await processOverdue(c);
    }
    console.log('[Cron] Overdue scan complete.');
}

/**
 * Register all cron schedules.
 * Default: every 5 minutes — overdue penalties + milestone BP checks.
 */
export function startCronJobs(schedule: string = '*/5 * * * *'): void {
    console.log(`[Cron] Scheduling jobs: "${schedule}"`);
    cron.schedule(schedule, () => {
        runOverdueJob().catch(err =>
            console.error('[Cron] Unhandled error in overdue job:', err.message),
        );
        runMilestoneCron().catch(err =>
            console.error('[Cron] Unhandled error in milestone job:', err.message),
        );
    });
    console.log('[Cron] Overdue penalty + Milestone BP jobs started ✓');
}
