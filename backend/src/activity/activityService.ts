import { connectDB } from '../db/connection.js';
import {
    ActivityModel,
    SubmissionModel,
    HpBalanceModel,
    type IActivity,
    type ISubmission,
    type ActivityType,
    type SubmissionStatus,
    type ActivityRules,
} from '../models/index.js';
import {
    applyReward,
    applyPenalty,
    applyPercentagePenalty,
} from '../hp/hpService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Activity CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function registerActivity(params: {
    activity_id: string;
    course_id: string;
    title: string;
    type: ActivityType;
    deadline?: Date | string | null;
    grace_period?: number;
    rules?: ActivityRules;
    is_mandatory?: boolean;
}): Promise<IActivity> {
    await connectDB();

    const { activity_id, course_id, title, type, deadline, grace_period, rules, is_mandatory } = params;

    const activity = await ActivityModel.findOneAndUpdate(
        { activity_id },
        {
            $set: {
                course_id,
                title,
                type,
                deadline: deadline ? new Date(deadline as string) : null,
                grace_period: grace_period ?? 0,
                rules: rules ?? {},
                is_mandatory: is_mandatory !== false,
            },
        },
        { upsert: true, new: true },
    );

    return activity!;
}

export async function getActivity(activity_id: string): Promise<IActivity | null> {
    await connectDB();
    return ActivityModel.findOne({ activity_id });
}

export async function getActivitiesByCourse(course_id: string): Promise<IActivity[]> {
    await connectDB();
    return ActivityModel.find({ course_id }).sort({ deadline: 1 });
}

export async function updateActivity(activity_id: string, updates: Partial<{
    title: string;
    type: ActivityType;
    deadline: Date | string | null;
    grace_period: number;
    rules: ActivityRules;
    is_mandatory: boolean;
}>): Promise<IActivity | null> {
    await connectDB();
    const setFields: any = {};
    if (updates.title !== undefined) setFields.title = updates.title;
    if (updates.type !== undefined) setFields.type = updates.type;
    if (updates.deadline !== undefined) setFields.deadline = updates.deadline ? new Date(updates.deadline as string) : null;
    if (updates.grace_period !== undefined) setFields.grace_period = updates.grace_period;
    if (updates.rules !== undefined) setFields.rules = updates.rules;
    if (updates.is_mandatory !== undefined) setFields.is_mandatory = updates.is_mandatory;
    return ActivityModel.findOneAndUpdate({ activity_id }, { $set: setFields }, { new: true });
}

export async function deleteActivity(activity_id: string): Promise<boolean> {
    await connectDB();
    const result = await ActivityModel.deleteOne({ activity_id });
    return result.deletedCount > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission Logic
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitActivityResult {
    submission: ISubmission;
    status: SubmissionStatus;
    hp_change: number;
    ledger_id?: string;
    message: string;
}

export async function submitActivity(params: {
    user_id: string;
    activity_id: string;
    course_id: string;
    score?: number;
    score_max?: number;
}): Promise<SubmitActivityResult> {
    await connectDB();

    const { user_id, activity_id, course_id, score, score_max } = params;

    // ── 1. Get activity ──
    const activity = await getActivity(activity_id);
    if (!activity) throw new Error(`Activity ${activity_id} not found`);

    const rules: ActivityRules = activity.rules ?? {};
    const now = new Date();

    // ── 2. Determine on-time vs late ──
    let status: SubmissionStatus = 'COMPLETED';
    if (activity.deadline) {
        const graceEnd = new Date(
            activity.deadline.getTime() + (activity.grace_period ?? 0) * 60_000,
        );
        if (now > graceEnd) status = 'LATE';
    }

    // ── 3. Upsert submission (UNIQUE: one per user+activity) ──
    const submission = await SubmissionModel.findOneAndUpdate(
        { user_id, activity_id },
        {
            $set: {
                course_id,
                status,
                score: score ?? null,
                score_max: score_max ?? null,
                submitted_at: now,
            },
        },
        { upsert: true, new: true },
    );

    // ── 4. Apply HP rules ──
    let hp_change = 0;
    let ledger_id: string | undefined;

    if (status === 'COMPLETED') {
        // Score-based reward
        if (rules.score_to_hp_multiplier && score != null && score_max) {
            hp_change = Math.round((score / score_max) * rules.score_to_hp_multiplier);
        } else if (rules.reward_hp) {
            hp_change = rules.reward_hp;
        }

        if (hp_change > 0) {
            const entry = await applyReward(
                user_id,
                course_id,
                hp_change,
                activity_id,
                `Completed activity: ${activity.title}`,
            );
            ledger_id = (entry._id as any).toString();
        }
    } else if (status === 'LATE') {
        if (rules.late_penalty_percent) {
            const entry = await applyPercentagePenalty(
                user_id,
                course_id,
                rules.late_penalty_percent,
                activity_id,
                `Late submission: ${activity.title}`,
            );
            hp_change = -(entry.previous_hp - entry.new_hp);
            ledger_id = (entry._id as any).toString();
        } else if (rules.late_penalty_hp) {
            const entry = await applyPenalty(
                user_id,
                course_id,
                rules.late_penalty_hp,
                activity_id,
                `Late submission: ${activity.title}`,
            );
            hp_change = -rules.late_penalty_hp;
            ledger_id = (entry._id as any).toString();
        }
    }

    return {
        submission: submission!,
        status,
        hp_change,
        ledger_id,
        message:
            status === 'COMPLETED'
                ? `Submission accepted. HP: +${hp_change}`
                : `Late submission recorded. HP: ${hp_change}`,
    };
}

export async function getUserSubmissions(user_id: string, course_id: string): Promise<ISubmission[]> {
    await connectDB();
    return SubmissionModel.find({ user_id, course_id }).sort({ submitted_at: -1 });
}
