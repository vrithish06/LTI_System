import { connectDB } from '../db/database.js';
import { ExamModel, type IQuestion } from '../models/index.js';

export async function saveExam(
    title: string,
    description: string,
    questions: IQuestion[],
): Promise<void> {
    await connectDB();
    await ExamModel.findOneAndUpdate(
        { title },
        { $set: { description: description || '', questions } },
        { upsert: true, new: true },
    );
    console.log(`[ExamService] Saved exam "${title}" with ${questions.length} question(s)`);
}

export async function getExam(
    title: string,
): Promise<{ title: string; description: string; questions: IQuestion[] } | null> {
    await connectDB();
    const exam = await ExamModel.findOne({ title }).lean();
    if (!exam) return null;
    return {
        title: exam.title,
        description: exam.description ?? '',
        questions: exam.questions as IQuestion[],
    };
}
