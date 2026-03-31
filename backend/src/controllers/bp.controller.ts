import { Request, Response } from 'express';
import { BrowniePointModel } from '../models/BrowniePoint.js';
import { bpService } from '../services/bp.service.js';

/**
 * Controller class for handling Brownie Points CRUD operations.
 * Separates API request/response handling layer from core business logic (in service)
 * and database models, ensuring the Open/Closed and Single Responsibility principles.
 */
export class BrowniePointController {

    /**
     * Fetch all brownie points belonging to students inside a particular course.
     * 
     * @param req Express Request mapped by `:courseId` param
     * @param res Express Response containing a collection of BrowniePoints
     */
    public async getPointsByCourse(req: Request, res: Response): Promise<void> {
        const { courseId } = req.params;

        try {
            // Retrieve sorted dataset
            const records = await BrowniePointModel.find({ courseId }).sort({ studentName: 1 });
            res.json({ success: true, data: records });
        } catch (err: any) {
            console.error('[BP Fetch] Fetch triggered an exception:', err.message);
            res.status(500).json({ error: 'Failed to fetch brownie points roster', detail: err.message });
        }
    }

    /**
     * Adjust numerical values and inject points audit logs for a specific student.
     * 
     * @param req Express Request parsed for `courseId`, `studentId`, `delta`, `reason`, `instructorName`
     * @param res Express Response dispatching the updated student record 
     */
    public async adjustPointsForStudent(req: Request, res: Response): Promise<void> {
        const { courseId, studentId } = req.params;
        const { delta, reason, instructorName } = req.body;

        // Perform payload validation
        const pointDelta = Number(delta);
        if (delta === undefined || isNaN(pointDelta)) {
            res.status(400).json({ error: 'Property `delta` of type number is required' });
            return;
        }

        try {
            // Apply atomic updates directly instead of sequentially retrieving and saving 
            // Avoids complex race conditions and conforms to good database hygiene
            const updatedRecord = await BrowniePointModel.findOneAndUpdate(
                { studentId, courseId },
                {
                    $inc: { points: pointDelta },
                    $push: {
                        history: {
                            delta: pointDelta,
                            reason: reason || '',
                            awardedBy: instructorName || 'System',
                            awardedAt: new Date(),
                        }
                    },
                },
                { new: true } // Configures query output to emit the modified object iteration
            );

            // Handle non-existent student scenario
            if (!updatedRecord) {
                res.status(404).json({ error: 'Student record could not be found. Perform manual NRPS roster sync.' });
                return;
            }

            res.json({ success: true, data: updatedRecord });
            
        } catch (err: any) {
            console.error('[BP Update] Exception updating student record:', err.message);
            res.status(500).json({ error: 'Operation `update points` failed', detail: err.message });
        }
    }

    /**
     * Force a manual synchronization with external Vibe LMS utilizing Names and Role Provisioning Services.
     * 
     * @param req Express Request with matching `:courseId`
     * @param res Express Response confirming roster pull completion
     */
    public async manuallySyncRoster(req: Request, res: Response): Promise<void> {
        const { courseId } = req.params;

        try {
            const result = await bpService.syncRosterForCourse(courseId);
            res.json({ success: true, synced: result.synced, courseName: result.courseName });
        } catch (err: any) {
            console.error('[BP Sync] Failed to manually sync:', err.message);
            res.status(500).json({ error: 'Roster sync encountered generic error', detail: err.message });
        }
    }
}

export const bpController = new BrowniePointController();
