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
    is_proof_required?: boolean;
    incentives?: string;
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
                is_proof_required: params.is_proof_required ?? false,
                incentives: params.incentives ?? '',
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

export async function getActivitiesByCourse(course_id: string, user_id?: string): Promise<any[]> {
    await connectDB();
    const activities = await ActivityModel.find({ course_id }).lean();
    
    if (user_id) {
        const submissions = await SubmissionModel.find({ user_id, course_id }).lean();
        const list = activities.map(a => ({
            ...a,
            is_submitted: submissions.some(s => s.activity_id === a.activity_id)
        }));

        return list.sort((a, b) => {
            // Unsubmitted first
            if (a.is_submitted !== b.is_submitted) {
                return a.is_submitted ? 1 : -1;
            }
            // Then sort by deadline
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
    }

    return activities.sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
}

export async function updateActivity(activity_id: string, updates: Partial<{
    title: string;
    type: ActivityType;
    deadline: Date | string | null;
    grace_period: number;
    rules: ActivityRules;
    is_mandatory: boolean;
    is_proof_required: boolean;
    incentives: string;
}>): Promise<IActivity | null> {
    await connectDB();
    const setFields: any = {};
    if (updates.title !== undefined) setFields.title = updates.title;
    if (updates.type !== undefined) setFields.type = updates.type;
    if (updates.deadline !== undefined) setFields.deadline = updates.deadline ? new Date(updates.deadline as string) : null;
    if (updates.grace_period !== undefined) setFields.grace_period = updates.grace_period;
    if (updates.rules !== undefined) setFields.rules = updates.rules;
    if (updates.is_mandatory !== undefined) setFields.is_mandatory = updates.is_mandatory;
    if (updates.is_proof_required !== undefined) setFields.is_proof_required = updates.is_proof_required;
    if (updates.incentives !== undefined) setFields.incentives = updates.incentives;
    setFields.updated_at = new Date();
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
    proof_url?: string;
}): Promise<SubmitActivityResult> {
    await connectDB();

    const { user_id, activity_id, course_id, score, score_max, proof_url } = params;

    console.log(`[Submission Attempt] user=${user_id} activity=${activity_id} course=${course_id}`);

    // ── 1. Get activity ──
    const activity = await getActivity(activity_id);
    if (!activity) {
        console.error(`[Submission Error] Activity ${activity_id} not found`);
        throw new Error(`Activity ${activity_id} not found`);
    }

    const rules: ActivityRules = activity.rules ?? {};
    const now = new Date();

    // ── 2. Determine on-time vs late vs blocked ──
    let status: SubmissionStatus = 'COMPLETED';
    let gracePenaltyHp = 0;  // extra deduction if submitting within grace window

    if (activity.deadline) {
        console.log(`[Deadline Check] now=${now.toISOString()}, deadline=${new Date(activity.deadline).toISOString()}`);
        const deadlineMs = new Date(activity.deadline).getTime();
        const gracePeriodMs = (activity.grace_period ?? 0) * 60_000;  // grace_period stored in minutes
        const strictDeadlineMs = deadlineMs + gracePeriodMs;
        const nowMs = now.getTime();

        if (nowMs > strictDeadlineMs) {
            // Past the strict deadline — block submission entirely
            console.warn(`[Strict Deadline Exceeded] Blocked submission user=${user_id} activity=${activity_id}`);
            throw new Error('Submission closed. Strict deadline has passed.');
        }

        if (nowMs > deadlineMs) {
            // Within grace period window — mark LATE and compute proportional penalty
            status = 'LATE';
            const hoursLate = (nowMs - deadlineMs) / 3_600_000;  // in hours
            const totalGraceHours = gracePeriodMs / 3_600_000;
            const penaltyValue = (rules.late_penalty_hp ?? 0) > 0
                ? (rules.late_penalty_hp as number)
                : 0;
            if (totalGraceHours > 0 && penaltyValue > 0) {
                gracePenaltyHp = Math.round(((hoursLate / totalGraceHours) * penaltyValue) * 100) / 100;
            }
            console.log(`[Grace Period] hoursLate=${hoursLate.toFixed(2)} gracePenaltyHp=${gracePenaltyHp}`);
        }
    }

    const existingSubmission = await SubmissionModel.findOne({ user_id, activity_id });
    if (existingSubmission) {
        throw new Error('Activity already submitted. Multiple submissions are not allowed.');
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
                ...(proof_url && { proof_url }),
            },
        },
        { upsert: true, new: true },
    );
    console.log(`[Submission Success] Upserted submission user=${user_id} activity=${activity_id} status=${status}`);

    // ── 4. Apply HP rules ──
    let hp_change = 0;
    let ledger_id: string | undefined;

    if (status === 'COMPLETED') {
        // On-time: full reward
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
        // Grace period: apply formula Reward - (lateHours/graceHours) × Penalty
        let baseReward = 0;
        if (rules.score_to_hp_multiplier && score != null && score_max) {
            baseReward = Math.round((score / score_max) * rules.score_to_hp_multiplier);
        } else if (rules.reward_hp) {
            baseReward = rules.reward_hp;
        }

        const calculatedReward = Math.round((baseReward - gracePenaltyHp) * 100) / 100;
        hp_change = Math.max(0, calculatedReward);  // never negative from this formula

        if (hp_change > 0) {
            const entry = await applyReward(
                user_id,
                course_id,
                hp_change,
                activity_id,
                `Late submission (grace period): ${activity.title} — Penalty applied: ${gracePenaltyHp} HP`,
            );
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
                ? `Submission accepted. BP: +${hp_change}`
                : `Late submission recorded (grace period). BP awarded: +${hp_change} (penalty: -${gracePenaltyHp})`,
    };
}

export async function getUserSubmissions(user_id: string, course_id: string): Promise<ISubmission[]> {
    await connectDB();
    return SubmissionModel.find({ user_id, course_id }).sort({ submitted_at: -1 });
}
