import { connectDB } from '../db/connection.js';
import { ActivityModel, MilestoneAwardModel } from '../models/index.js';
import { applyReward } from '../hp/hpService.js';

const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';
const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

interface VibeProgressEntry {
    userId: string;
    percentCompleted: number;
}

/**
 * Fetches per-student completion percentages from Vibe for a given course.
 */
async function fetchProgressFromVibe(courseId: string): Promise<VibeProgressEntry[]> {
    const res = await fetch(`${VIBE_BASE_URL}/api/lti/progress/${courseId}`, {
        headers: { 'x-lti-secret': LTI_SHARED_SECRET },
    });

    if (!res.ok) {
        throw new Error(`[Milestone] Vibe progress fetch failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as any;
    return (data.progress || []) as VibeProgressEntry[];
}

/**
 * For a single course, fetches all active VIBE_MILESTONE activities and awards BP
 * to any student who has crossed the target completion percentage and hasn't been
 * awarded yet (idempotent via the milestone_awards collection).
 */
export async function checkAndAwardMilestonesForCourse(courseId: string): Promise<void> {
    await connectDB();

    // 1. Find all VIBE_MILESTONE activities for this course
    const milestoneActivities = await ActivityModel.find({
        course_id: courseId,
        type: 'VIBE_MILESTONE',
    }).lean();

    if (milestoneActivities.length === 0) {
        console.log(`[Milestone] No milestone activities for course ${courseId}`);
        return;
    }

    // 2. Fetch current progress for all students from Vibe
    let progressList: VibeProgressEntry[];
    try {
        progressList = await fetchProgressFromVibe(courseId);
    } catch (err: any) {
        console.error(`[Milestone] Failed to fetch progress: ${err.message}`);
        return;
    }

    if (progressList.length === 0) {
        console.log(`[Milestone] No student progress data for course ${courseId}`);
        return;
    }

    console.log(`[Milestone] Checking ${milestoneActivities.length} activities for ${progressList.length} students in course ${courseId}`);

    // 3. For each milestone activity, check each student
    for (const activity of milestoneActivities) {
        const rules = activity.rules as any;
        const targetPercent: number = rules?.milestone_target_percent ?? 100;
        const rewardHp: number = rules?.milestone_reward_hp ?? rules?.reward_hp ?? 10;

        for (const { userId, percentCompleted } of progressList) {
            // Check if this student has crossed the threshold
            if (percentCompleted < targetPercent) continue;

            // Idempotency: check if already awarded
            const alreadyAwarded = await MilestoneAwardModel.findOne({
                user_id: userId,
                activity_id: activity.activity_id,
            });
            if (alreadyAwarded) continue;

            // Award BP and record the award atomically
            try {
                await applyReward(
                    userId,
                    courseId,
                    rewardHp,
                    activity.activity_id,
                    `Milestone reached: ${activity.title} (${targetPercent}% completion)`,
                );

                await MilestoneAwardModel.create({
                    user_id: userId,
                    activity_id: activity.activity_id,
                });

                console.log(`[Milestone] Awarded ${rewardHp} BP to user=${userId} for activity="${activity.title}" (${percentCompleted}% >= ${targetPercent}%)`);
            } catch (err: any) {
                // Unique index on milestone_awards prevents double-award even in race conditions
                if (err.code === 11000) {
                    console.log(`[Milestone] Duplicate award skipped for user=${userId} activity=${activity.activity_id}`);
                } else {
                    console.error(`[Milestone] Failed to award BP for user=${userId}: ${err.message}`);
                }
            }
        }
    }
}

/**
 * Runs milestone checks for ALL distinct courses that have VIBE_MILESTONE activities.
 * Called by the cron scheduler every N minutes.
 */
export async function runMilestoneCron(): Promise<void> {
    await connectDB();

    const courses = await ActivityModel.distinct('course_id', { type: 'VIBE_MILESTONE' });
    console.log(`[Milestone Cron] Running for ${courses.length} courses with milestone activities`);

    await Promise.allSettled(
        courses.map((courseId: string) =>
            checkAndAwardMilestonesForCourse(courseId).catch(err =>
                console.error(`[Milestone Cron] Error for course ${courseId}: ${err.message}`)
            )
        )
    );

    console.log(`[Milestone Cron] Done`);
}
