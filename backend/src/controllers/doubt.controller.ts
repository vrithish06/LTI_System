import { Request, Response } from 'express';
import { connectDB } from '../db/connection.js';
import {
    DoubtConfigModel, DoubtRequestModel, ProofSubmissionModel,
    DoubtTransactionModel, EndorsementEdgeModel, DoubtDisputeModel,
    DoubtNotificationModel, IDoubtRequest, ProofClaim
} from '../models/Doubt.js';
import { BrowniePointModel } from '../models/BrowniePoint.js';
import mongoose from 'mongoose';
import { cloudStorageService } from '../utils/cloud-storage.js';
import { sysNotify } from '../models/SystemNotification.js';

// ── helpers ──────────────────────────────────────────────────────────────────
async function notify(userId: string, courseId: string, type: string, message: string, requestId?: string) {
    // Keep doubt-specific notifications for backward compat (in-module use)
    await DoubtNotificationModel.create({ user_id: userId, course_id: courseId, type, message, request_id: requestId });
    // Also fire unified system notification
    const titles: Record<string, string> = {
        request_received: '🤝 New Peer Connect Request',
        request_accepted: '✅ Request Accepted',
        request_rejected: '❌ Request Rejected',
        request_resolved: '🎉 Session Resolved',
        dispute_opened:   '⚖️ Dispute Opened',
        dispute_resolved: '✅ Dispute Resolved',
    };
    const sysType: any = type.startsWith('request') ? `peer_connect_${type.replace('request_','')}` : `peer_connect_${type.replace('dispute_','')}`;
    await sysNotify(userId, courseId, sysType, titles[type] || '🤝 Peer Connect Update', message);
}

async function adjustBP(studentId: string, courseId: string, delta: number, reason: string, by: string) {
    await BrowniePointModel.findOneAndUpdate(
        { studentId, courseId },
        {
            $inc: { points: delta },
            $push: { history: { delta, reason, awardedBy: by, awardedAt: new Date() } },
        },
        { upsert: true, new: true }
    );
}

async function resolveRequest(request: IDoubtRequest, claimA: ProofClaim, claimB: ProofClaim, resolvedBy = 'system') {
    const { _id, course_id, student_a_id, student_a_name, student_b_id, student_b_name, bp_offer, topic } = request;
    const reqId = (_id as any).toString();

    if (claimA === 'happened' && claimB === 'happened') {
        // BP transferred to helper
        await adjustBP(student_b_id, course_id, bp_offer, `Doubt session cleared: ${topic}`, resolvedBy);
        await DoubtRequestModel.findByIdAndUpdate(_id, { status: 'resolved' });
        await DoubtTransactionModel.create({
            request_id: reqId, course_id, bp_amount: bp_offer,
            from_student_id: student_a_id, from_student_name: student_a_name,
            to_student_id: student_b_id, to_student_name: student_b_name,
            topic, resolution_type: resolvedBy === 'system' ? 'auto_resolve' : 'transfer',
        });
        await EndorsementEdgeModel.create({
            course_id, from_student_id: student_a_id, from_student_name: student_a_name,
            to_student_id: student_b_id, to_student_name: student_b_name,
            topic, request_id: reqId, bp_exchanged: bp_offer,
        });
        await notify(student_a_id, course_id, 'request_resolved', `Session resolved! ${bp_offer} BP sent to ${student_b_name}.`, reqId);
        await notify(student_b_id, course_id, 'request_resolved', `You earned ${bp_offer} BP for helping ${student_a_name}!`, reqId);
    } else if (claimA === 'not_happened' && claimB === 'not_happened') {
        // Refund to A
        await adjustBP(student_a_id, course_id, bp_offer, `Doubt session refund: ${topic}`, resolvedBy);
        await DoubtRequestModel.findByIdAndUpdate(_id, { status: 'resolved' });
        await DoubtTransactionModel.create({
            request_id: reqId, course_id, bp_amount: bp_offer,
            from_student_id: student_b_id, from_student_name: student_b_name,
            to_student_id: student_a_id, to_student_name: student_a_name,
            topic, resolution_type: resolvedBy === 'system' ? 'auto_resolve' : 'refund',
        });
        await notify(student_a_id, course_id, 'request_resolved', `Session cancelled. ${bp_offer} BP refunded to you.`, reqId);
        await notify(student_b_id, course_id, 'request_resolved', `Session with ${student_a_name} marked as not happened.`, reqId);
    } else {
        // Dispute
        await DoubtRequestModel.findByIdAndUpdate(_id, { status: 'disputed' });
        await DoubtDisputeModel.create({ request_id: reqId, course_id, claim_a: claimA, claim_b: claimB });
        await notify(student_a_id, course_id, 'dispute_opened', `Your session with ${student_b_name} is in dispute. Instructor will review.`, reqId);
        await notify(student_b_id, course_id, 'dispute_opened', `Your session with ${student_a_name} is in dispute. Instructor will review.`, reqId);
    }
}

// ── Config ───────────────────────────────────────────────────────────────────
export async function getConfig(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    let cfg = await DoubtConfigModel.findOne({ course_id: courseId });
    if (!cfg) cfg = await DoubtConfigModel.create({ course_id: courseId });
    res.json({ success: true, data: cfg });
}

export async function updateConfig(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    const { max_bp_per_doubt } = req.body;
    const cfg = await DoubtConfigModel.findOneAndUpdate(
        { course_id: courseId },
        { $set: { max_bp_per_doubt, updated_at: new Date() } },
        { upsert: true, new: true }
    );
    res.json({ success: true, data: cfg });
}

// ── Student Directory ─────────────────────────────────────────────────────────
export async function getStudents(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    const { userId } = req.query;
    const students = await BrowniePointModel.find({ courseId }, { studentId: 1, studentName: 1, studentEmail: 1, points: 1, _id: 0 }).lean();
    const filtered = students.filter(s => s.studentId !== userId);
    res.json({ success: true, data: filtered });
}

// ── Create Doubt Request ──────────────────────────────────────────────────────
export async function createRequest(req: Request, res: Response) {
    await connectDB();
    try {
        const { courseId, studentAId, studentAName, studentBId, studentBName, topic, description, bpOffer } = req.body;
        if (studentAId === studentBId) { res.status(400).json({ error: 'Cannot send a request to yourself.' }); return; }

        const cfg = await DoubtConfigModel.findOne({ course_id: courseId }) || { max_bp_per_doubt: 50 };
        if (bpOffer < 10) { res.status(400).json({ error: 'Minimum BP offer is 10.' }); return; }
        if (bpOffer > cfg.max_bp_per_doubt) { res.status(400).json({ error: `Maximum BP offer is ${cfg.max_bp_per_doubt}.` }); return; }

        const aBalance = await BrowniePointModel.findOne({ studentId: studentAId, courseId });
        if (!aBalance || aBalance.points < bpOffer) { res.status(400).json({ error: 'Insufficient BP balance.' }); return; }

        const existing = await DoubtRequestModel.findOne({
            course_id: courseId, student_a_id: studentAId, student_b_id: studentBId,
            status: { $in: ['pending', 'active', 'proof_pending'] },
        });
        if (existing) { res.status(409).json({ error: 'You already have an active request to this student.' }); return; }

        // Hold BP while request is pending
        await adjustBP(studentAId, courseId, -bpOffer, `BP held for Peer Connect request to ${studentBName}: ${topic}`, 'system');

        const request = await DoubtRequestModel.create({
            course_id: courseId, student_a_id: studentAId, student_a_name: studentAName,
            student_b_id: studentBId, student_b_name: studentBName,
            topic, description, bp_offer: bpOffer, status: 'pending',
        });

        await notify(studentBId, courseId, 'request_received',
            `${studentAName} wants your help with "${topic}" and is offering ${bpOffer} BP.`, (request._id as any).toString());

        res.json({ success: true, data: request });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

// ── Accept / Reject ───────────────────────────────────────────────────────────
export async function acceptRequest(req: Request, res: Response) {
    await connectDB();
    const { requestId } = req.params;
    const request = await DoubtRequestModel.findById(requestId);
    if (!request || request.status !== 'pending') { res.status(404).json({ error: 'Request not found or not pending.' }); return; }

    const now = new Date();
    const autoResolveAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await DoubtRequestModel.findByIdAndUpdate(requestId, { status: 'active', accepted_at: now, auto_resolve_at: autoResolveAt });
    await notify(request.student_a_id, request.course_id, 'request_accepted',
        `${request.student_b_name} accepted your doubt request on "${request.topic}".`, requestId);
    res.json({ success: true });
}

export async function rejectRequest(req: Request, res: Response) {
    await connectDB();
    const { requestId } = req.params;
    const request = await DoubtRequestModel.findById(requestId);
    if (!request || request.status !== 'pending') { res.status(404).json({ error: 'Request not found or not pending.' }); return; }

    // Refund held BP to A
    await adjustBP(request.student_a_id, request.course_id, request.bp_offer,
        `Refund: ${request.student_b_name} rejected your doubt request on "${request.topic}"`, 'system');
    await DoubtRequestModel.findByIdAndUpdate(requestId, { status: 'cancelled' });
    await notify(request.student_a_id, request.course_id, 'request_rejected',
        `${request.student_b_name} declined your doubt request on "${request.topic}". ${request.bp_offer} BP refunded.`, requestId);
    res.json({ success: true });
}

// ── Submit Proof ──────────────────────────────────────────────────────────────
export async function submitProof(req: Request, res: Response) {
    await connectDB();
    try {
        const { requestId } = req.params;
        const { submittedById, party, claim } = req.body;

        const request = await DoubtRequestModel.findById(requestId);
        if (!request || !['active', 'proof_pending'].includes(request.status)) {
            res.status(400).json({ error: 'Request is not in a submittable state.' }); return;
        }

        const alreadySubmitted = await ProofSubmissionModel.findOne({ request_id: requestId, party });
        if (alreadySubmitted) { res.status(409).json({ error: 'You already submitted your claim.' }); return; }

        let proof_file_id: string | undefined;
        let proof_file_name: string | undefined;

        if (claim === 'happened') {
            if (!req.file) { res.status(400).json({ error: 'Proof file is required when claiming meeting happened.' }); return; }
            proof_file_id = await cloudStorageService.uploadActivityDocument(req.file.buffer, req.file.originalname, req.file.mimetype, requestId);
            proof_file_name = req.file.originalname;
        }

        await ProofSubmissionModel.create({ request_id: requestId, submitted_by_id: submittedById, party, claim, proof_file_id, proof_file_name });

        // Check if both sides submitted
        const allProofs = await ProofSubmissionModel.find({ request_id: requestId });
        if (allProofs.length === 2) {
            const proofA = allProofs.find(p => p.party === 'A')!;
            const proofB = allProofs.find(p => p.party === 'B')!;
            await resolveRequest(request, proofA.claim, proofB.claim);
        } else {
            await DoubtRequestModel.findByIdAndUpdate(requestId, { status: 'proof_pending' });
        }

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

// ── Get Requests (student) ────────────────────────────────────────────────────
export async function getMyRequests(req: Request, res: Response) {
    await connectDB();
    const { courseId, userId } = req.params;
    const requests = await DoubtRequestModel.find({
        course_id: courseId,
        $or: [{ student_a_id: userId }, { student_b_id: userId }],
    }).sort({ created_at: -1 }).lean();
    // Attach proof submissions for proof_pending/disputed/resolved
    const ids = requests.map(r => (r._id as any).toString());
    const proofs = await ProofSubmissionModel.find({ request_id: { $in: ids } }).lean();
    const result = requests.map(r => ({
        ...r,
        proofs: proofs.filter(p => p.request_id === (r._id as any).toString()),
    }));
    res.json({ success: true, data: result });
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function getNotifications(req: Request, res: Response) {
    await connectDB();
    const { userId, courseId } = req.params;
    const notes = await DoubtNotificationModel.find({ user_id: userId, course_id: courseId }).sort({ created_at: -1 }).limit(50).lean();
    res.json({ success: true, data: notes });
}

export async function markRead(req: Request, res: Response) {
    await connectDB();
    const { userId, courseId } = req.params;
    await DoubtNotificationModel.updateMany({ user_id: userId, course_id: courseId, is_read: false }, { $set: { is_read: true } });
    res.json({ success: true });
}

// ── Instructor: Audit Log ─────────────────────────────────────────────────────
export async function getAuditLog(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const [data, total] = await Promise.all([
        DoubtTransactionModel.find({ course_id: courseId }).sort({ resolved_at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        DoubtTransactionModel.countDocuments({ course_id: courseId }),
    ]);
    // Attach proofs
    const ids = data.map(t => t.request_id);
    const proofs = await ProofSubmissionModel.find({ request_id: { $in: ids } }).lean();
    const result = data.map(t => ({ ...t, proofs: proofs.filter(p => p.request_id === t.request_id) }));
    res.json({ success: true, data: result, total, page });
}

export async function markReviewed(req: Request, res: Response) {
    await connectDB();
    const { requestId } = req.params;
    const { instructorId, isSuspicious } = req.body;
    await DoubtTransactionModel.findOneAndUpdate({ request_id: requestId }, { $set: { reviewed_by: instructorId, is_suspicious: !!isSuspicious } });
    res.json({ success: true });
}

// ── Instructor: Disputes ──────────────────────────────────────────────────────
export async function getDisputes(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    const resolutionQuery = req.query.tab === 'resolved' ? { $exists: true } : { $exists: false };
    const disputes = await DoubtDisputeModel.find({ course_id: courseId, resolution: resolutionQuery }).sort({ flagged_at: -1 }).lean();
    const ids = disputes.map(d => d.request_id);
    const requests = await DoubtRequestModel.find({ _id: { $in: ids.map(id => mongoose.Types.ObjectId.createFromHexString(id)) } }).lean().catch(() =>
        DoubtRequestModel.find({ course_id: courseId, status: 'disputed' }).lean()
    );
    const proofs = await ProofSubmissionModel.find({ request_id: { $in: ids } }).lean();
    const result = disputes.map(d => ({
        ...d,
        request: requests.find(r => (r._id as any).toString() === d.request_id),
        proofs: proofs.filter(p => p.request_id === d.request_id),
    }));
    res.json({ success: true, data: result });
}

export async function forceSettle(req: Request, res: Response) {
    await connectDB();
    try {
        const { requestId } = req.params;
        const { instructorId, instructorName } = req.body;
        const byLabel = instructorName || instructorId;
        const request = await DoubtRequestModel.findById(requestId);
        if (!request) { res.status(404).json({ error: 'Request not found.' }); return; }

        // Release held BP → B
        await adjustBP(request.student_b_id, request.course_id, request.bp_offer,
            `Force settled by instructor: ${request.topic}`, byLabel);

        // Determine who lied and apply 10% penalty
        const proofs = await ProofSubmissionModel.find({ request_id: requestId });
        const proofA = proofs.find(p => p.party === 'A');
        const proofB = proofs.find(p => p.party === 'B');
        let penaltyStudentId = '';
        // Force settle = meeting happened = B gets BP
        // Whoever said "not_happened" lied
        if (proofA?.claim === 'not_happened') {
            penaltyStudentId = request.student_a_id;
        } else if (proofB?.claim === 'not_happened') {
            penaltyStudentId = request.student_b_id;
        }
        let penalty = 0;
        if (penaltyStudentId) {
            const bal = await BrowniePointModel.findOne({ studentId: penaltyStudentId, courseId: request.course_id });
            penalty = Math.floor((bal?.points || 0) * 0.1);
            if (penalty > 0) {
                await adjustBP(penaltyStudentId, request.course_id, -penalty, 'Fraud penalty (10%) applied by instructor', byLabel);
            }
        }

        await DoubtRequestModel.findByIdAndUpdate(requestId, { status: 'resolved' });
        await DoubtDisputeModel.findOneAndUpdate({ request_id: requestId }, { $set: { resolution: 'force_settle', arbitrator_id: instructorId, resolved_at: new Date() } });
        await DoubtTransactionModel.create({
            request_id: requestId, course_id: request.course_id, bp_amount: request.bp_offer,
            from_student_id: request.student_a_id, from_student_name: request.student_a_name,
            to_student_id: request.student_b_id, to_student_name: request.student_b_name,
            topic: request.topic, resolution_type: 'force_settle',
            fraud_penalty_applied_to: penalty > 0 ? penaltyStudentId : undefined,
        });
        await EndorsementEdgeModel.create({
            course_id: request.course_id, from_student_id: request.student_a_id, from_student_name: request.student_a_name,
            to_student_id: request.student_b_id, to_student_name: request.student_b_name,
            topic: request.topic, request_id: requestId, bp_exchanged: request.bp_offer,
        });

        let msgA = `Dispute resolved by instructor. ${request.bp_offer} BP transferred to ${request.student_b_name}.`;
        let msgB = `Dispute resolved. You received ${request.bp_offer} BP.`;
        if (penalty > 0) {
            if (penaltyStudentId === request.student_a_id) msgA += ` You were penalized 10% of your BP (${penalty} BP) for a false claim.`;
            if (penaltyStudentId === request.student_b_id) msgB += ` You were penalized 10% of your BP (${penalty} BP) for a false claim.`;
        }

        await notify(request.student_a_id, request.course_id, 'dispute_resolved', msgA, requestId);
        await notify(request.student_b_id, request.course_id, 'dispute_resolved', msgB, requestId);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
}

export async function forceRefund(req: Request, res: Response) {
    await connectDB();
    try {
        const { requestId } = req.params;
        const { instructorId, instructorName } = req.body;
        const byLabel = instructorName || instructorId;
        const request = await DoubtRequestModel.findById(requestId);
        if (!request) { res.status(404).json({ error: 'Request not found.' }); return; }

        // Return held BP → A
        await adjustBP(request.student_a_id, request.course_id, request.bp_offer,
            `Force refunded by instructor: ${request.topic}`, byLabel);

        // Penalty: whoever said "happened" when meeting didn't happen
        const proofs = await ProofSubmissionModel.find({ request_id: requestId });
        const proofA = proofs.find(p => p.party === 'A');
        const proofB = proofs.find(p => p.party === 'B');
        let penaltyStudentId = '';
        if (proofA?.claim === 'happened') penaltyStudentId = request.student_a_id;
        else if (proofB?.claim === 'happened') penaltyStudentId = request.student_b_id;
        let penalty = 0;
        if (penaltyStudentId) {
            const bal = await BrowniePointModel.findOne({ studentId: penaltyStudentId, courseId: request.course_id });
            penalty = Math.floor((bal?.points || 0) * 0.1);
            if (penalty > 0) {
                await adjustBP(penaltyStudentId, request.course_id, -penalty, 'Fraud penalty (10%) applied by instructor', byLabel);
            }
        }

        await DoubtRequestModel.findByIdAndUpdate(requestId, { status: 'resolved' });
        await DoubtDisputeModel.findOneAndUpdate({ request_id: requestId }, { $set: { resolution: 'force_refund', arbitrator_id: instructorId, resolved_at: new Date() } });
        await DoubtTransactionModel.create({
            request_id: requestId, course_id: request.course_id, bp_amount: request.bp_offer,
            from_student_id: request.student_b_id, from_student_name: request.student_b_name,
            to_student_id: request.student_a_id, to_student_name: request.student_a_name,
            topic: request.topic, resolution_type: 'force_refund',
            fraud_penalty_applied_to: penalty > 0 ? penaltyStudentId : undefined,
        });

        let msgA = `Dispute resolved. ${request.bp_offer} BP refunded to you.`;
        let msgB = `Dispute resolved by instructor. BP returned to ${request.student_a_name}.`;
        if (penalty > 0) {
            if (penaltyStudentId === request.student_a_id) msgA += ` You were penalized 10% of your BP (${penalty} BP) for a false claim.`;
            if (penaltyStudentId === request.student_b_id) msgB += ` You were penalized 10% of your BP (${penalty} BP) for a false claim.`;
        }

        await notify(request.student_a_id, request.course_id, 'dispute_resolved', msgA, requestId);
        await notify(request.student_b_id, request.course_id, 'dispute_resolved', msgB, requestId);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
}

// ── Analytics ────────────────────────────────────────────────────────────────
export async function getAnalytics(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    const transactions = await DoubtTransactionModel.find({ course_id: courseId, resolution_type: { $in: ['transfer', 'force_settle', 'auto_resolve'] } }).lean();
    const allRequests = await DoubtRequestModel.find({ course_id: courseId }).lean();

    const studentMap: Record<string, { name: string; earned: number; spent: number; asked: number; cleared: number; topics: Record<string, number> }> = {};
    const ensure = (id: string, name: string) => {
        if (!studentMap[id]) studentMap[id] = { name, earned: 0, spent: 0, asked: 0, cleared: 0, topics: {} };
    };

    for (const t of transactions) {
        ensure(t.to_student_id, t.to_student_name);
        ensure(t.from_student_id, t.from_student_name);
        studentMap[t.to_student_id].earned += t.bp_amount;
        studentMap[t.from_student_id].spent += t.bp_amount;
        studentMap[t.to_student_id].cleared += 1;
        studentMap[t.to_student_id].topics[t.topic] = (studentMap[t.to_student_id].topics[t.topic] || 0) + 1;
    }
    for (const r of allRequests) {
        ensure(r.student_a_id, r.student_a_name);
        studentMap[r.student_a_id].asked += 1;
    }

    const topicCounts: Record<string, number> = {};
    for (const r of allRequests) topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1;

    res.json({
        success: true,
        data: {
            leaderboard: Object.entries(studentMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.earned - a.earned),
            topics: Object.entries(topicCounts).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count),
        },
    });
}

// ── Endorsement Graph ─────────────────────────────────────────────────────────
export async function getEndorsementGraph(req: Request, res: Response) {
    await connectDB();
    const { courseId } = req.params;
    const { userId } = req.query;
    const query: any = { course_id: courseId };
    if (userId) query.$or = [{ from_student_id: userId }, { to_student_id: userId }];
    const edges = await EndorsementEdgeModel.find(query).lean();
    res.json({ success: true, data: edges });
}
