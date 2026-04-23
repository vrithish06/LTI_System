import mongoose, { Document, Schema, model } from 'mongoose';

// ── 1. Course Config ─────────────────────────────────────────────────────────
export interface IDoubtConfig extends Document {
    course_id: string;
    max_bp_per_doubt: number;   // teacher-configured ceiling
    updated_at: Date;
}
const DoubtConfigSchema = new Schema<IDoubtConfig>({
    course_id:        { type: String, required: true, unique: true },
    max_bp_per_doubt: { type: Number, default: 50 },
    updated_at:       { type: Date,   default: () => new Date() },
}, { collection: 'doubt_configs' });
export const DoubtConfigModel = mongoose.models.DoubtConfig || model<IDoubtConfig>('DoubtConfig', DoubtConfigSchema);

// ── 2. Doubt Request ─────────────────────────────────────────────────────────
export type DoubtStatus =
    | 'pending'       // waiting for B to accept/reject
    | 'active'        // B accepted, session in progress
    | 'proof_pending' // one side submitted proof, waiting for other
    | 'consensus'     // both agreed, BP transferred/refunded
    | 'disputed'      // claims conflict, instructor must resolve
    | 'resolved'      // fully closed
    | 'cancelled';    // rejected or refunded

export interface IDoubtRequest extends Document {
    course_id:       string;
    student_a_id:    string;
    student_a_name:  string;
    student_b_id:    string;
    student_b_name:  string;
    topic:           string;
    description:     string;
    bp_offer:        number;
    status:          DoubtStatus;
    created_at:      Date;
    accepted_at?:    Date;
    auto_resolve_at?: Date;  // 24h after accepted_at for proof window
}
const DoubtRequestSchema = new Schema<IDoubtRequest>({
    course_id:        { type: String, required: true },
    student_a_id:     { type: String, required: true },
    student_a_name:   { type: String, required: true },
    student_b_id:     { type: String, required: true },
    student_b_name:   { type: String, required: true },
    topic:            { type: String, required: true },
    description:      { type: String, required: true },
    bp_offer:         { type: Number, required: true },
    status:           { type: String, enum: ['pending','active','proof_pending','consensus','disputed','resolved','cancelled'], default: 'pending' },
    created_at:       { type: Date, default: () => new Date() },
    accepted_at:      { type: Date },
    auto_resolve_at:  { type: Date },
}, { collection: 'doubt_requests' });
DoubtRequestSchema.index({ course_id: 1, status: 1 });
DoubtRequestSchema.index({ student_a_id: 1 });
DoubtRequestSchema.index({ student_b_id: 1 });
DoubtRequestSchema.index({ auto_resolve_at: 1, status: 1 });
export const DoubtRequestModel = mongoose.models.DoubtRequest || model<IDoubtRequest>('DoubtRequest', DoubtRequestSchema);

// ── 3. Proof Submission ──────────────────────────────────────────────────────
export type ProofClaim = 'happened' | 'not_happened';

export interface IProofSubmission extends Document {
    request_id:       string;
    submitted_by_id:  string;
    party:            'A' | 'B';   // which side
    claim:            ProofClaim;
    proof_file_id?:   string;      // GridFS ObjectId (required when claim=happened)
    proof_file_name?: string;
    submitted_at:     Date;
}
const ProofSubmissionSchema = new Schema<IProofSubmission>({
    request_id:       { type: String, required: true },
    submitted_by_id:  { type: String, required: true },
    party:            { type: String, enum: ['A','B'], required: true },
    claim:            { type: String, enum: ['happened','not_happened'], required: true },
    proof_file_id:    { type: String },
    proof_file_name:  { type: String },
    submitted_at:     { type: Date, default: () => new Date() },
}, { collection: 'proof_submissions' });
ProofSubmissionSchema.index({ request_id: 1 });
export const ProofSubmissionModel = mongoose.models.ProofSubmission || model<IProofSubmission>('ProofSubmission', ProofSubmissionSchema);

// ── 4. Transaction Log ───────────────────────────────────────────────────────
export type ResolutionType = 'transfer' | 'refund' | 'force_settle' | 'force_refund' | 'auto_resolve';

export interface IDoubtTransaction extends Document {
    request_id:           string;
    course_id:            string;
    bp_amount:            number;
    from_student_id:      string;
    from_student_name:    string;
    to_student_id:        string;
    to_student_name:      string;
    topic:                string;
    resolution_type:      ResolutionType;
    resolved_at:          Date;
    reviewed_by?:         string;
    is_suspicious:        boolean;
    fraud_penalty_applied_to?: string;  // studentId if 10% penalty was applied
}
const DoubtTransactionSchema = new Schema<IDoubtTransaction>({
    request_id:                { type: String, required: true, unique: true },
    course_id:                 { type: String, required: true },
    bp_amount:                 { type: Number, required: true },
    from_student_id:           { type: String, required: true },
    from_student_name:         { type: String, required: true },
    to_student_id:             { type: String, required: true },
    to_student_name:           { type: String, required: true },
    topic:                     { type: String, required: true },
    resolution_type:           { type: String, enum: ['transfer','refund','force_settle','force_refund','auto_resolve'], required: true },
    resolved_at:               { type: Date, default: () => new Date() },
    reviewed_by:               { type: String },
    is_suspicious:             { type: Boolean, default: false },
    fraud_penalty_applied_to:  { type: String },
}, { collection: 'doubt_transactions' });
DoubtTransactionSchema.index({ course_id: 1, resolved_at: -1 });
export const DoubtTransactionModel = mongoose.models.DoubtTransaction || model<IDoubtTransaction>('DoubtTransaction', DoubtTransactionSchema);

// ── 5. Endorsement Edge ──────────────────────────────────────────────────────
export interface IEndorsementEdge extends Document {
    course_id:          string;
    from_student_id:    string;   // A (asker)
    from_student_name:  string;
    to_student_id:      string;   // B (helper)
    to_student_name:    string;
    topic:              string;
    request_id:         string;
    bp_exchanged:       number;
    created_at:         Date;
}
const EndorsementEdgeSchema = new Schema<IEndorsementEdge>({
    course_id:         { type: String, required: true },
    from_student_id:   { type: String, required: true },
    from_student_name: { type: String, required: true },
    to_student_id:     { type: String, required: true },
    to_student_name:   { type: String, required: true },
    topic:             { type: String, required: true },
    request_id:        { type: String, required: true },
    bp_exchanged:      { type: Number, required: true },
    created_at:        { type: Date, default: () => new Date() },
}, { collection: 'endorsement_edges' });
EndorsementEdgeSchema.index({ course_id: 1 });
EndorsementEdgeSchema.index({ from_student_id: 1 });
EndorsementEdgeSchema.index({ to_student_id: 1 });
export const EndorsementEdgeModel = mongoose.models.EndorsementEdge || model<IEndorsementEdge>('EndorsementEdge', EndorsementEdgeSchema);

// ── 6. Dispute ───────────────────────────────────────────────────────────────
export interface IDoubtDispute extends Document {
    request_id:    string;
    course_id:     string;
    claim_a:       ProofClaim;
    claim_b:       ProofClaim;
    flagged_at:    Date;
    arbitrator_id?: string;
    resolution?:   'force_settle' | 'force_refund';
    resolved_at?:  Date;
}
const DoubtDisputeSchema = new Schema<IDoubtDispute>({
    request_id:    { type: String, required: true, unique: true },
    course_id:     { type: String, required: true },
    claim_a:       { type: String, enum: ['happened','not_happened'], required: true },
    claim_b:       { type: String, enum: ['happened','not_happened'], required: true },
    flagged_at:    { type: Date, default: () => new Date() },
    arbitrator_id: { type: String },
    resolution:    { type: String, enum: ['force_settle','force_refund'] },
    resolved_at:   { type: Date },
}, { collection: 'doubt_disputes' });
DoubtDisputeSchema.index({ course_id: 1, resolution: 1 });
export const DoubtDisputeModel = mongoose.models.DoubtDispute || model<IDoubtDispute>('DoubtDispute', DoubtDisputeSchema);

// ── 7. In-app Notification ───────────────────────────────────────────────────
export type NotifType =
    | 'request_received'
    | 'request_accepted'
    | 'request_rejected'
    | 'proof_reminder'
    | 'dispute_opened'
    | 'dispute_resolved'
    | 'request_resolved';

export interface IDoubtNotification extends Document {
    user_id:    string;
    course_id:  string;
    type:       NotifType;
    message:    string;
    request_id?: string;
    is_read:    boolean;
    created_at: Date;
}
const DoubtNotificationSchema = new Schema<IDoubtNotification>({
    user_id:    { type: String, required: true },
    course_id:  { type: String, required: true },
    type:       { type: String, required: true },
    message:    { type: String, required: true },
    request_id: { type: String },
    is_read:    { type: Boolean, default: false },
    created_at: { type: Date, default: () => new Date() },
}, { collection: 'doubt_notifications' });
DoubtNotificationSchema.index({ user_id: 1, course_id: 1, is_read: 1 });
export const DoubtNotificationModel = mongoose.models.DoubtNotification || model<IDoubtNotification>('DoubtNotification', DoubtNotificationSchema);
