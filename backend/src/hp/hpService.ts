import { mongoose, connectDB } from '../db/connection.js';
import {
    UserModel,
    HpBalanceModel,
    HpLedgerModel,
    type IHpBalance,
    type IHpLedger,
    type ChangeType,
} from '../models/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp HP to a minimum of 0. */
function clamp(value: number): number {
    return Math.max(0, value);
}

/**
 * Core atomic HP mutation using a MongoDB session (transaction).
 * Always writes the ledger entry first, then updates the cached balance.
 */
async function applyHpChange(
    user_id: string,
    course_id: string,
    delta: number,
    change_type: ChangeType,
    activity_id: string | null,
    reason: string | null,
): Promise<IHpLedger> {
    await connectDB();
    const session = await mongoose.startSession();

    try {
        let ledgerEntry!: IHpLedger;

        await session.withTransaction(async () => {
            // 1. Read current balance (inside transaction)
            const balance = await HpBalanceModel.findOne({ user_id, course_id }).session(session);
            if (!balance) {
                throw new Error(
                    `HP balance not found for user ${user_id} in course ${course_id}. Was the user provisioned?`,
                );
            }

            const previous_hp = balance.current_hp;
            const new_hp = clamp(previous_hp + delta);

            // 2. Append to ledger (immutable)
            const [entry] = await HpLedgerModel.create(
                [
                    {
                        user_id,
                        course_id,
                        change_type,
                        value: Math.abs(delta),
                        previous_hp,
                        new_hp,
                        activity_id: activity_id ?? null,
                        reason: reason ?? null,
                    },
                ],
                { session },
            );
            ledgerEntry = entry;

            // 3. Update cached balance
            balance.current_hp = new_hp;
            balance.updated_at = new Date();
            await balance.save({ session });
        });

        return ledgerEntry;
    } finally {
        await session.endSession();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public HP Engine API
// ─────────────────────────────────────────────────────────────────────────────

/** Award absolute HP points. */
export async function applyReward(
    user_id: string,
    course_id: string,
    value: number,
    activity_id?: string | null,
    reason?: string,
): Promise<IHpLedger> {
    if (value <= 0) throw new Error('Reward value must be positive');
    return applyHpChange(user_id, course_id, value, 'REWARD', activity_id ?? null, reason ?? null);
}

/** Deduct absolute HP points (floor = 0). */
export async function applyPenalty(
    user_id: string,
    course_id: string,
    value: number,
    activity_id?: string | null,
    reason?: string,
): Promise<IHpLedger> {
    if (value <= 0) throw new Error('Penalty value must be positive');
    return applyHpChange(user_id, course_id, -value, 'PENALTY', activity_id ?? null, reason ?? null);
}

/** Manual admin adjustment — positive or negative. */
export async function applyManualAdjust(
    user_id: string,
    course_id: string,
    delta: number,
    reason: string,
): Promise<IHpLedger> {
    return applyHpChange(user_id, course_id, delta, 'MANUAL', null, reason);
}

/**
 * Calculate what X% of base_hp equals.
 * E.g. calculatePercentage(1000, 10) → 100
 */
export function calculatePercentage(base_hp: number, percent: number): number {
    return Math.max(1, Math.round((base_hp * percent) / 100));
}

/** Apply a percentage-based reward derived from current balance. */
export async function applyPercentageReward(
    user_id: string,
    course_id: string,
    percent: number,
    activity_id?: string | null,
    reason?: string,
): Promise<IHpLedger> {
    await connectDB();
    const balance = await HpBalanceModel.findOne({ user_id, course_id });
    if (!balance) throw new Error(`HP balance not found for user ${user_id}`);
    const value = calculatePercentage(balance.current_hp, percent);
    return applyReward(user_id, course_id, value, activity_id, reason);
}

/** Apply a percentage-based penalty derived from current balance. */
export async function applyPercentagePenalty(
    user_id: string,
    course_id: string,
    percent: number,
    activity_id?: string | null,
    reason?: string,
): Promise<IHpLedger> {
    await connectDB();
    const balance = await HpBalanceModel.findOne({ user_id, course_id });
    if (!balance) throw new Error(`HP balance not found for user ${user_id}`);
    const value = calculatePercentage(balance.current_hp, percent);
    return applyPenalty(user_id, course_id, value, activity_id, reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getHpBalance(user_id: string, course_id: string): Promise<IHpBalance | null> {
    await connectDB();
    return HpBalanceModel.findOne({ user_id, course_id }).lean();
}

export async function getHpLedger(user_id: string, course_id: string): Promise<IHpLedger[]> {
    await connectDB();
    return HpLedgerModel.find({ user_id, course_id })
        .sort({ timestamp: -1 })
        .limit(50)
        .lean() as unknown as IHpLedger[];
}

export async function getCourseLeaderboard(course_id: string) {
    await connectDB();
    return HpBalanceModel.aggregate([
        { $match: { course_id } },
        {
            $lookup: {
                from: 'users',
                let: { uid: '$user_id', cid: '$course_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$user_id', '$$uid'] },
                                    { $eq: ['$course_id', '$$cid'] },
                                    { $eq: ['$role', 'Learner'] },
                                ],
                            },
                        },
                    },
                ],
                as: 'user',
            },
        },
        { $unwind: '$user' },
        { $sort: { current_hp: -1 } },
        { $limit: 20 },
        {
            $project: {
                user_id: 1,
                course_id: 1,
                current_hp: 1,
                updated_at: 1,
            },
        },
    ]);
}
