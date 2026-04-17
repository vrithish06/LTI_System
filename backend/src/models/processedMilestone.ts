/**
 * ProcessedMilestone Model
 *
 * Idempotency guard — once a student has been awarded BP for a milestone,
 * we record it here so the webhook never double-awards, even if called repeatedly.
 */

import mongoose, { Schema, model, Document } from 'mongoose';

export interface IProcessedMilestone extends Document {
    user_id:      string;
    activity_id:  string;
    awarded_bp:   number;
    processed_at: Date;
}

const ProcessedMilestoneSchema = new Schema<IProcessedMilestone>(
    {
        user_id:      { type: String, required: true },
        activity_id:  { type: String, required: true },
        awarded_bp:   { type: Number, default: 0 },
        processed_at: { type: Date,   default: () => new Date() },
    },
    { collection: 'processed_milestones' },
);

// Unique index — one record per (user, milestone activity) pair
ProcessedMilestoneSchema.index({ user_id: 1, activity_id: 1 }, { unique: true });

export const ProcessedMilestoneModel =
    mongoose.models.ProcessedMilestone ||
    model<IProcessedMilestone>('ProcessedMilestone', ProcessedMilestoneSchema);
