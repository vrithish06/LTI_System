import mongoose, { Schema, Document } from 'mongoose';

// ------------------------------------------------------------------
// BrowniePoint Model
// One document per (studentId, courseId) pair.
// ------------------------------------------------------------------
export interface IBrowniePoint extends Document {
    studentId: string;       // Vibe userId (string)
    courseId: string;        // Vibe courseId
    studentName: string;
    studentEmail: string;
    points: number;
    history: {
        delta: number;
        reason: string;
        awardedBy: string;
        awardedAt: Date;
    }[];
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const HistorySchema = new Schema({
    delta: { type: Number, required: true },
    reason: { type: String, default: '' },
    awardedBy: { type: String, default: 'system' },
    awardedAt: { type: Date, default: Date.now },
}, { _id: false });

const BrowniePointSchema = new Schema<IBrowniePoint>({
    studentId: { type: String, required: true },
    courseId: { type: String, required: true },
    studentName: { type: String, default: 'Unknown Student' },
    studentEmail: { type: String, default: '' },
    points: { type: Number, default: 0 },
    history: [HistorySchema],
    lastSyncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound unique index – one record per student per course
BrowniePointSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

export const BrowniePointModel = mongoose.model<IBrowniePoint>('BrowniePoint', BrowniePointSchema);
