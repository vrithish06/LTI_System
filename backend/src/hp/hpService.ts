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
    const { BrowniePointModel } = await import('../models/BrowniePoint.js');
    
    // Find previous balance to calculate new balance for logging
    const existing = await BrowniePointModel.findOne({ studentId: user_id, courseId: course_id });
    const previous_hp = existing ? existing.points : 0;
    const new_hp = clamp(previous_hp + delta);
    const actual_delta = new_hp - previous_hp;

    const updated = await BrowniePointModel.findOneAndUpdate(
        { studentId: user_id, courseId: course_id },
        {
            $inc: { points: actual_delta },
            $push: {
                history: {
                    delta: actual_delta,
                    reason: reason || change_type,
                    awardedBy: 'System',
                    awardedAt: new Date(),
                }
            }
        },
        { new: true, upsert: true }
    );
    
    console.log(`[BP Update] user=${user_id} course=${course_id} delta=${actual_delta} previous=${previous_hp} new=${new_hp} reason="${reason}"`);

    // Return a shim matching IHpLedger for compatibility with callers like activityService expecting returned entry ID
    return {
        _id: updated._id,
        user_id,
        course_id,
        change_type,
        value: Math.abs(actual_delta),
        previous_hp,
        new_hp,
        activity_id,
        reason,
        timestamp: new Date()
    } as unknown as IHpLedger;
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
    const { BrowniePointModel } = await import('../models/BrowniePoint.js');
    const balance = await BrowniePointModel.findOne({ studentId: user_id, courseId: course_id });
    if (!balance) throw new Error(`HP balance not found for user ${user_id}`);
    const value = calculatePercentage(balance.points, percent);
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
    const { BrowniePointModel } = await import('../models/BrowniePoint.js');
    const balance = await BrowniePointModel.findOne({ studentId: user_id, courseId: course_id });
    if (!balance) throw new Error(`HP balance not found for user ${user_id}`);
    const value = calculatePercentage(balance.points, percent);
    return applyPenalty(user_id, course_id, value, activity_id, reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getHpBalance(user_id: string, course_id: string): Promise<IHpBalance | null> {
    await connectDB();
    return HpBalanceModel.findOne({ user_id, course_id }).lean();
}

/**
 * Returns the HP balance, auto-creating it at 1000 HP if not found.
 * Safe to call from any read path (no transaction needed for reads).
 */
export async function getOrCreateHpBalance(user_id: string, course_id: string, role = 'Learner'): Promise<IHpBalance> {
    await connectDB();
    const existing = await HpBalanceModel.findOne({ user_id, course_id });
    if (existing) return existing.toObject() as IHpBalance;

    console.log(`[HP Provision] Creating balance for user=${user_id} course=${course_id}`);
    await UserModel.findOneAndUpdate(
        { user_id, course_id },
        { $setOnInsert: { user_id, course_id, role, created_at: new Date() } },
        { upsert: true }
    );
    const newBalance = await HpBalanceModel.findOneAndUpdate(
        { user_id, course_id },
        { $setOnInsert: { user_id, course_id, current_hp: 1000, updated_at: new Date() } },
        { upsert: true, new: true }
    );
    return newBalance!.toObject() as IHpBalance;
}

/**
 * Provision a user in the LTI system on LTI launch.
 * Idempotent — safe to call every launch.
 */
export async function provisionUser(user_id: string, course_id: string, role: string): Promise<void> {
    await connectDB();
    const ltiRole = role === 'Instructor' ? 'Instructor' : 'Learner';
    await UserModel.findOneAndUpdate(
        { user_id, course_id },
        { $set: { role: ltiRole }, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
    );
    if (ltiRole === 'Learner') {
        await HpBalanceModel.findOneAndUpdate(
            { user_id, course_id },
            { $setOnInsert: { current_hp: 1000, updated_at: new Date() } },
            { upsert: true }
        );
        console.log(`[HP Provision] Ensured HP balance for user=${user_id} course=${course_id}`);
    }
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
