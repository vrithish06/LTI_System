import mongoose, { Schema } from 'mongoose';
const QuestionSchema = new Schema({
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true },
}, { _id: false });
const ExamSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    courseId: { type: String, required: true },
    courseVersionId: { type: String, required: true },
    questions: [QuestionSchema],
}, { timestamps: true });
// Unique per course + title
ExamSchema.index({ courseId: 1, title: 1 }, { unique: true });
export const ExamModel = mongoose.model('Exam', ExamSchema);
