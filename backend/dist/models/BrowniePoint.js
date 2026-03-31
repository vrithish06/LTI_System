import mongoose, { Schema } from 'mongoose';
const HistorySchema = new Schema({
    delta: { type: Number, required: true },
    reason: { type: String, default: '' },
    awardedBy: { type: String, default: 'system' },
    awardedAt: { type: Date, default: Date.now },
}, { _id: false });
const BrowniePointSchema = new Schema({
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
export const BrowniePointModel = mongoose.model('BrowniePoint', BrowniePointSchema);
