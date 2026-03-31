import mongoose, { Schema, Document } from 'mongoose';

// ------------------------------------------------------------------
// Exam / Quiz Model  (replaces in-memory examsDB)
// ------------------------------------------------------------------
export interface IQuestion {
    id: string;
    text: string;
    options: string[];
    correctAnswer: number;
}

export interface IExam extends Document {
    title: string;
    description?: string;
    courseId: string;
    courseVersionId: string;
    questions: IQuestion[];
    createdAt: Date;
    updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>({
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true },
}, { _id: false });

const ExamSchema = new Schema<IExam>({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    courseId: { type: String, required: true },
    courseVersionId: { type: String, required: true },
    questions: [QuestionSchema],
}, { timestamps: true });

// Unique per course + title
ExamSchema.index({ courseId: 1, title: 1 }, { unique: true });

export const ExamModel = mongoose.model<IExam>('Exam', ExamSchema);
