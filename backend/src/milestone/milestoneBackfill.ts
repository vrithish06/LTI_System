/**
 * Milestone Backfill Service
 *
 * Handles the case where a VIBE_MILESTONE activity is created AFTER students
 * already have sufficient course progress. The webhook only fires on *future*
 * progress updates, so we need a manual "check everyone now" endpoint.
 *
 * The instructor clicks "Check Now" → we fetch all enrolled students' current
 * progress from Vibe via the NRPS + enrollment endpoint, then run the same
 * milestone award logic for each student.
 */

import { connectDB } from '../db/connection.js';
import { ActivityModel } from '../models/index.js';
import { checkAndAwardMilestones } from './milestoneService.js';

const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';
const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

interface VibeStudentProgress {
    userId: string;
    percentCompleted: number;
}

/**
 * Fetches all enrolled students + their progress percentage for a course 
 * by calling Vibe's internal NRPS endpoint (which we already secured).
 */
async function fetchProgressFromVibe(courseId: string): Promise<VibeStudentProgress[]> {
    const url = `${VIBE_BASE_URL}/api/lti/nrps/${courseId}`;
    const res = await fetch(url, {
        headers: { 'x-lti-secret': LTI_SHARED_SECRET },
    });

    if (!res.ok) {
        throw new Error(`Vibe NRPS returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as any;

    // NRPS returns members array with studentId + percentCompleted from enrollment
    const members: any[] = data.members || data.data || [];
    return members
        .filter((m: any) => m.studentId && m.percentCompleted !== undefined)
        .map((m: any) => ({
            userId: m.studentId,
            percentCompleted: Number(m.percentCompleted) || 0,
        }));
}

/**
 * Run milestone checks for ALL currently enrolled students in a course.
 * Called by the instructor via "Check Now" button — useful for:
 *   - Students who already had sufficient progress when the milestone was created
 *   - Manual retriggers after fixing a misconfigured milestone
 *
 * Returns a summary of how many students were awarded BP.
 */
export async function backfillMilestoneAwards(courseId: string): Promise<{
    studentsChecked: number;
    studentsAwarded: number;
    totalBpAwarded: number;
    details: string[];
}> {
    await connectDB();

    // 1. Check there are VIBE_MILESTONE activities for this course
    const milestones = await ActivityModel.find({
        course_id: courseId,
        type: 'VIBE_MILESTONE',
    }).lean();

    if (!milestones.length) {
        return { studentsChecked: 0, studentsAwarded: 0, totalBpAwarded: 0, details: ['No VIBE_MILESTONE activities found for this course.'] };
    }

    // 2. Fetch all students' current progress from Vibe
    const students = await fetchProgressFromVibe(courseId);
    if (!students.length) {
        return { studentsChecked: 0, studentsAwarded: 0, totalBpAwarded: 0, details: ['No students found in Vibe for this course.'] };
    }

    console.log(`[Milestone Backfill] Checking ${students.length} students for ${milestones.length} milestones in course ${courseId}`);

    // 3. Run milestone awards for each student
    const allDetails: string[] = [];
    let studentsAwarded = 0;
    let totalBpAwarded = 0;

    for (const student of students) {
        const result = await checkAndAwardMilestones(student.userId, courseId, student.percentCompleted);
        if (result.awarded > 0) {
            studentsAwarded++;
            // Sum up BP from details (e.g., "Awarded 10 BP for ...")
            result.details.forEach(d => {
                const match = d.match(/Awarded (\d+) BP/);
                if (match) totalBpAwarded += Number(match[1]);
                allDetails.push(`[${student.userId.slice(-6)}] ${d}`);
            });
        }
    }

    return {
        studentsChecked: students.length,
        studentsAwarded,
        totalBpAwarded,
        details: allDetails.length ? allDetails : [`Checked ${students.length} students — no new awards needed.`],
    };
}
