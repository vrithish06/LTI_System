import mongoose, { Schema, model, Document } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// 1. User
// ─────────────────────────────────────────────────────────────────────────────
export interface IUser extends Document {
    user_id: string;
    course_id: string;
    role: string;
    created_at: Date;
}

const UserSchema = new Schema<IUser>(
    {
        user_id:    { type: String, required: true },
        course_id:  { type: String, required: true },
        role:       { type: String, required: true, default: 'Learner' },
        created_at: { type: Date,   default: () => new Date() },
    },
    { collection: 'users' }
);
UserSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

export const UserModel = mongoose.models.User || model<IUser>('User', UserSchema);

// ─────────────────────────────────────────────────────────────────────────────
// 2. HP Balance (cached current value for fast reads)
// ─────────────────────────────────────────────────────────────────────────────
export interface IHpBalance extends Document {
    user_id:    string;
    course_id:  string;
    current_hp: number;
    updated_at: Date;
}

const HpBalanceSchema = new Schema<IHpBalance>(
    {
        user_id:    { type: String, required: true },
        course_id:  { type: String, required: true },
        current_hp: { type: Number, required: true, default: 1000 },
        updated_at: { type: Date,   default: () => new Date() },
    },
    { collection: 'hp_balance' }
);
HpBalanceSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

export const HpBalanceModel = mongoose.models.HpBalance || model<IHpBalance>('HpBalance', HpBalanceSchema);

// ─────────────────────────────────────────────────────────────────────────────
// 3. HP Ledger (immutable audit trail — never mutate, only append)
// ─────────────────────────────────────────────────────────────────────────────
export type ChangeType = 'REWARD' | 'PENALTY' | 'MANUAL' | 'INIT';

export interface IHpLedger extends Document {
    user_id:     string;
    course_id:   string;
    change_type: ChangeType;
    value:       number;
    previous_hp: number;
    new_hp:      number;
    activity_id?: string;
    reason?:      string;
    timestamp:   Date;
}

const HpLedgerSchema = new Schema<IHpLedger>(
    {
        user_id:     { type: String,   required: true },
        course_id:   { type: String,   required: true },
        change_type: { type: String,   required: true, enum: ['REWARD', 'PENALTY', 'MANUAL', 'INIT'] },
        value:       { type: Number,   required: true },
        previous_hp: { type: Number,   required: true },
        new_hp:      { type: Number,   required: true },
        activity_id: { type: String,   default: null },
        reason:      { type: String,   default: null },
        timestamp:   { type: Date,     default: () => new Date() },
    },
    { collection: 'hp_ledger' }
);
HpLedgerSchema.index({ user_id: 1, course_id: 1 });
HpLedgerSchema.index({ timestamp: -1 });

export const HpLedgerModel = mongoose.models.HpLedger || model<IHpLedger>('HpLedger', HpLedgerSchema);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Activity
// ─────────────────────────────────────────────────────────────────────────────
export type ActivityType = 'ASSIGNMENT' | 'VIBE_MILESTONE' | 'LTI_TOOL' | 'EXTERNAL_IMPORT';

export interface ActivityRules {
    reward_hp?:              number;
    score_to_hp_multiplier?: number;
    late_penalty_hp?:        number;
    late_penalty_percent?:   number;
    overdue_penalty_hp?:     number;
    overdue_penalty_percent?: number;
    // VIBE_MILESTONE: the course completion % that triggers BP award
    target_percent?:         number;
    // Grace-period penalty computed at submission time
    grace_penalty_hp?:       number;
}

export interface IActivity extends Document {
    activity_id:  string;
    course_id:    string;
    title:        string;
    type:         ActivityType;
    deadline?:    Date | null;
    grace_period: number;   // minutes
    rules:        ActivityRules;
    is_mandatory: boolean;
    is_proof_required: boolean;
    incentives?:  string;
    document_url?:  string;  // GridFS file ID of instructor-uploaded document
    document_name?: string;  // Original filename for display/download
    created_at:   Date;
    updated_at:   Date;
}

const ActivitySchema = new Schema<IActivity>(
    {
        activity_id:  { type: String,  required: true, unique: true },
        course_id:    { type: String,  required: true },
        title:        { type: String,  required: true },
        type:         { type: String,  required: true, enum: ['ASSIGNMENT', 'VIBE_MILESTONE', 'LTI_TOOL', 'EXTERNAL_IMPORT'] },
        deadline:     { type: Date,    default: null },
        grace_period: { type: Number,  default: 0 },
        rules:        { type: Schema.Types.Mixed, default: {} },
        is_mandatory: { type: Boolean, default: true },
        is_proof_required: { type: Boolean, default: false },
        incentives:       { type: String,  default: '' },
        document_url:     { type: String,  default: null },
        document_name:    { type: String,  default: null },
        created_at:   { type: Date,    default: () => new Date() },
        updated_at:   { type: Date,    default: () => new Date() },
    },
    { collection: 'activities' }
);
ActivitySchema.index({ course_id: 1 });
ActivitySchema.index({ deadline: 1 });
ActivitySchema.index({ updated_at: -1 });

export const ActivityModel = mongoose.models.Activity || model<IActivity>('Activity', ActivitySchema);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Submission
// ─────────────────────────────────────────────────────────────────────────────
export type SubmissionStatus = 'PENDING' | 'COMPLETED' | 'LATE';

export interface ISubmission extends Document {
    user_id:        string;
    activity_id:    string;
    course_id:      string;
    status:         SubmissionStatus;
    score?:         number;
    score_max?:     number;
    submitted_at:   Date;
    penalty_applied: boolean;  // idempotency guard for cron
    proof_url?:     string;
}

const SubmissionSchema = new Schema<ISubmission>(
    {
        user_id:         { type: String,  required: true },
        activity_id:     { type: String,  required: true },
        course_id:       { type: String,  required: true },
        status:          { type: String,  required: true, enum: ['PENDING', 'COMPLETED', 'LATE'], default: 'PENDING' },
        score:           { type: Number,  default: null },
        score_max:       { type: Number,  default: null },
        submitted_at:    { type: Date,    default: () => new Date() },
        penalty_applied: { type: Boolean, default: false },
        proof_url:       { type: String,  default: null },
    },
    { collection: 'submissions' }
);
SubmissionSchema.index({ user_id: 1, activity_id: 1 }, { unique: true });
SubmissionSchema.index({ course_id: 1 });

export const SubmissionModel = mongoose.models.Submission || model<ISubmission>('Submission', SubmissionSchema);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Exam (persistent quiz storage — replaces in-memory map)
// ─────────────────────────────────────────────────────────────────────────────
export interface IQuestion {
    id: string;
    text: string;
    options: string[];
    correctAnswer: number;
}

export interface IExam extends Document {
    title:       string;
    description?: string;
    questions:   IQuestion[];
    created_at:  Date;
}

const ExamSchema = new Schema<IExam>(
    {
        title:       { type: String, required: true, unique: true },
        description: { type: String, default: '' },
        questions:   { type: Schema.Types.Mixed, default: [] },
        created_at:  { type: Date,   default: () => new Date() },
    },
    { collection: 'exams' }
);

export const ExamModel = mongoose.models.Exam || model<IExam>('Exam', ExamSchema);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Processed Overdue (idempotency guard for cron penalties)
// ─────────────────────────────────────────────────────────────────────────────
export interface IProcessedOverdue extends Document {
    user_id:      string;
    activity_id:  string;
    processed_at: Date;
}

const ProcessedOverdueSchema = new Schema<IProcessedOverdue>(
    {
        user_id:      { type: String, required: true },
        activity_id:  { type: String, required: true },
        processed_at: { type: Date,   default: () => new Date() },
    },
    { collection: 'processed_overdue' }
);
ProcessedOverdueSchema.index({ user_id: 1, activity_id: 1 }, { unique: true });

export const ProcessedOverdueModel =
    mongoose.models.ProcessedOverdue || model<IProcessedOverdue>('ProcessedOverdue', ProcessedOverdueSchema);

// ─────────────────────────────────────────────────────────────────────────────
// 8. Course Incentives (instructor-published motivation text, per course)
// ─────────────────────────────────────────────────────────────────────────────
export interface ICourseIncentives extends Document {
    course_id:    string;
    content:      string;   // The rich incentive text written by the instructor
    is_published: boolean;  // true = visible to students
    updated_at:   Date;
    updated_by?:  string;   // instructor userId who last edited
}

const CourseIncentivesSchema = new Schema<ICourseIncentives>(
    {
        course_id:    { type: String,  required: true, unique: true },
        content:      { type: String,  default: '' },
        is_published: { type: Boolean, default: false },
        updated_at:   { type: Date,    default: () => new Date() },
        updated_by:   { type: String,  default: null },
    },
    { collection: 'course_incentives' }
);

export const CourseIncentivesModel =
    mongoose.models.CourseIncentives || model<ICourseIncentives>('CourseIncentives', CourseIncentivesSchema);
