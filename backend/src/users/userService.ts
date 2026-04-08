import { connectDB } from '../db/connection.js';
import {
    UserModel,
    HpBalanceModel,
    HpLedgerModel,
} from '../models/index.js';

/**
 * JIT User Provisioning — called on every LTI launch.
 *
 * If (user_id, course_id) does not exist:
 *   1. Creates the user
 *   2. Sets initial HP balance = 1000
 *   3. Appends INIT ledger entry
 *
 * Fully idempotent — safe to call on every launch.
 */
export async function provisionUser(
    user_id: string,
    course_id: string,
    role: string,
): Promise<void> {
    await connectDB();

    // upsert user (update role in case it changed — e.g. student → TA)
    await UserModel.findOneAndUpdate(
        { user_id, course_id },
        { $set: { role }, $setOnInsert: { user_id, course_id, created_at: new Date() } },
        { upsert: true, new: true },
    );

    // Check if balance already exists
    const existingBalance = await HpBalanceModel.findOne({ user_id, course_id });
    if (existingBalance) return;   // already provisioned

    // First time — seed balance + ledger atomically
    await HpBalanceModel.create({ user_id, course_id, current_hp: 1000 });
    await HpLedgerModel.create({
        user_id,
        course_id,
        change_type: 'INIT',
        value: 1000,
        previous_hp: 0,
        new_hp: 1000,
        reason: 'Initial HP allocation on first LTI launch',
    });

    console.log(`[UserService] Provisioned new user ${user_id} in course ${course_id} (role: ${role})`);
}
