import axios from 'axios';

const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

export interface ScoreSubmission {
    agsScoreUrl: string;   // The URL from the JWT (Vibe's AGS endpoint)
    userId: string;
    courseId: string;
    activityId: string;
    activityTitle: string;
    toolId: string;
    scoreGiven: number;
    scoreMaximum: number;
    comment?: string;
    // Grace period fields (Feature 1)
    gracePenaltyApplied?: number;   // HP already deducted due to late submission in grace window
    submissionStatus?: 'COMPLETED' | 'LATE';
}

/**
 * Computes the effective (net) score after applying any grace-period penalty,
 * and returns both values rounded to 2 decimal places.
 */
export function computeEffectiveScore(params: {
    scoreGiven: number;
    scoreMaximum: number;
    gracePenaltyApplied?: number;
    rewardHp?: number;
}): {
    effectiveScore: number;
    deduction: number;
    effectiveHp: number;
} {
    const { scoreGiven, scoreMaximum, gracePenaltyApplied = 0, rewardHp } = params;

    // Raw percentage score: 0–1
    const rawRatio = scoreMaximum > 0 ? scoreGiven / scoreMaximum : 0;

    // Effective HP before grace deduction
    const baseHp = rewardHp !== undefined ? rewardHp : scoreGiven;

    // Apply penalty; ensure we never go below 0
    const deduction = Math.round(gracePenaltyApplied * 100) / 100;
    const effectiveHp = Math.max(0, Math.round((baseHp - deduction) * 100) / 100);

    // Scale score back to scoreMaximum proportionally
    const effectiveScore = Math.round(rawRatio * scoreMaximum * 100) / 100;

    return { effectiveScore, deduction, effectiveHp };
}

/**
 * Sends a score back to Vibe's AGS endpoint.
 * Handles partial deductions from grace-period submissions before syncing.
 * All HP values are rounded to 2 decimal places per spec.
 */
export async function submitScoreToVibe(submission: ScoreSubmission): Promise<void> {
    const { agsScoreUrl, gracePenaltyApplied = 0, submissionStatus, ...payload } = submission;

    // Compute effective score after any grace penalty
    const { effectiveScore, deduction } = computeEffectiveScore({
        scoreGiven: submission.scoreGiven,
        scoreMaximum: submission.scoreMaximum,
        gracePenaltyApplied,
    });

    const syncPayload = {
        ...payload,
        scoreGiven: effectiveScore,
        ...(deduction > 0 && {
            comment: `${payload.comment || ''} [Grace penalty deducted: ${deduction} HP]`.trim(),
            graceDeduction: deduction,
            submissionStatus: submissionStatus || 'LATE',
        }),
    };

    try {
        const response = await axios.post(agsScoreUrl, syncPayload, {
            headers: {
                'Content-Type': 'application/json',
                // Shared secret so Vibe knows this is a legitimate request
                'x-lti-secret': LTI_SHARED_SECRET,
            },
            timeout: 10000,
        });

        console.log(`[GradeService] Score submitted to Vibe (effective: ${effectiveScore}, deduction: ${deduction}). Response:`, response.data);
    } catch (error: any) {
        console.error(`[GradeService] Failed to submit score to Vibe:`, error?.response?.data || error?.message);
        throw new Error('Failed to submit score to Vibe LMS');
    }
}
