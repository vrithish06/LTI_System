import axios from 'axios';
const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';
/**
 * Sends a score back to Vibe's AGS endpoint.
 * Vibe will convert this into HP points for the student.
 */
export async function submitScoreToVibe(submission) {
    const { agsScoreUrl, ...payload } = submission;
    try {
        const response = await axios.post(agsScoreUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                // Shared secret so Vibe knows this is a legitimate request
                'x-lti-secret': LTI_SHARED_SECRET,
            },
            timeout: 10000,
        });
        console.log(`[GradeService] Score submitted to Vibe. Response:`, response.data);
    }
    catch (error) {
        console.error(`[GradeService] Failed to submit score to Vibe:`, error?.response?.data || error?.message);
        throw new Error('Failed to submit score to Vibe LMS');
    }
}
