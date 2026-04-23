import { connectDB } from '../db/connection.js';
import { DoubtRequestModel, ProofSubmissionModel, DoubtTransactionModel, DoubtNotificationModel } from '../models/Doubt.js';
import { BrowniePointModel } from '../models/BrowniePoint.js';

async function adjustBP(studentId: string, courseId: string, delta: number, reason: string) {
    await BrowniePointModel.findOneAndUpdate(
        { studentId, courseId },
        { $inc: { points: delta }, $push: { history: { delta, reason, awardedBy: 'system', awardedAt: new Date() } } },
        { upsert: true, new: true }
    );
}

export async function runAutoResolve() {
    try {
        await connectDB();
        const now = new Date();
        // Find active/proof_pending requests past their auto_resolve_at window
        const expired = await DoubtRequestModel.find({
            status: { $in: ['active', 'proof_pending'] },
            auto_resolve_at: { $lte: now },
        });

        for (const request of expired) {
            const reqId = (request._id as any).toString();
            const proofs = await ProofSubmissionModel.find({ request_id: reqId });

            const proofA = proofs.find(p => p.party === 'A');
            const proofB = proofs.find(p => p.party === 'B');

            // Determine effective claims (absent = auto-accept other's claim)
            let claimA = proofA?.claim;
            let claimB = proofB?.claim;

            if (!claimA && !claimB) {
                // Neither submitted — refund A
                claimA = 'not_happened'; claimB = 'not_happened';
            } else if (claimA && !claimB) {
                claimB = claimA; // B auto-agrees with A
            } else if (!claimA && claimB) {
                claimA = claimB; // A auto-agrees with B
            }

            const { student_a_id, student_a_name, student_b_id, student_b_name, bp_offer, topic, course_id } = request;

            if (claimA === 'happened' && claimB === 'happened') {
                await adjustBP(student_b_id, course_id, bp_offer, `Auto-resolved: ${topic}`);
                await DoubtTransactionModel.create({
                    request_id: reqId, course_id, bp_amount: bp_offer,
                    from_student_id: student_a_id, from_student_name: student_a_name,
                    to_student_id: student_b_id, to_student_name: student_b_name,
                    topic, resolution_type: 'auto_resolve',
                });
            } else {
                // Not happened (or disagreement auto-resolved) — refund A
                await adjustBP(student_a_id, course_id, bp_offer, `Auto-refund: ${topic}`);
                await DoubtTransactionModel.create({
                    request_id: reqId, course_id, bp_amount: bp_offer,
                    from_student_id: student_b_id, from_student_name: student_b_name,
                    to_student_id: student_a_id, to_student_name: student_a_name,
                    topic, resolution_type: 'auto_resolve',
                });
            }

            await DoubtRequestModel.findByIdAndUpdate(request._id, { status: 'resolved' });
            await DoubtNotificationModel.create([
                { user_id: student_a_id, course_id, type: 'request_resolved', message: `Session with ${student_b_name} auto-resolved after 24h.`, request_id: reqId },
                { user_id: student_b_id, course_id, type: 'request_resolved', message: `Session with ${student_a_name} auto-resolved after 24h.`, request_id: reqId },
            ]);
        }

        if (expired.length > 0) console.log(`[AutoResolve] Resolved ${expired.length} expired doubt request(s).`);
    } catch (err: any) {
        console.error('[AutoResolve] Error:', err.message);
    }
}
