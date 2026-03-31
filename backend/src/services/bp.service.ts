import axios from 'axios';
import { BrowniePointModel } from '../models/BrowniePoint.js';

/**
 * Service class handling all Brownie Point business logic.
 * Adheres to Single Responsibility Principle by encapsulating DB access and external API calls related to points.
 */
export class BrowniePointService {
    
    /**
     * Synchronizes a course's roster with the Vibe LMS platform using the Names and Role Provisioning Service (NRPS).
     * Ensures each user in the course has a valid local BrowniePoint DB record.
     * 
     * @param courseId The unique identifier of the course to sync
     * @returns Metadata regarding the synchronization result
     */
    public async syncRosterForCourse(courseId: string): Promise<{ synced: number; courseName: string }> {
        const VIBE_BASE_URL = process.env.VIBE_BASE_URL || 'http://localhost:3141';
        const LTI_SHARED_SECRET = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';
        
        // Lightweight ping to ensure the Vibe LMS is responsive
        try {
            const pingRes = await axios.get(`${VIBE_BASE_URL}/api/lti/ping`);
            console.log(`[NRPS] Vibe LTI check status: ${pingRes.data.status}`);
        } catch (error) {
            console.warn(`[NRPS] Vibe LTI ping failed at ${VIBE_BASE_URL}/api/lti/ping. Controller may be inactive.`);
        }

        const targetUrl = `${VIBE_BASE_URL}/api/lti/nrps/${courseId}`;
        console.log(`[NRPS] Syncing roster from Vibe endpoints at: ${targetUrl}`);

        try {
            // Fetch course members from Vibe
            const { data } = await axios.get(targetUrl, {
                headers: { 'x-lti-secret': LTI_SHARED_SECRET },
                timeout: 10000,
            });

            const members: { userId: string; name: string; email: string }[] = data.members || [];
            const courseName = data.courseName || 'Foundations of science';

            let newStudentCount = 0;
            
            // Reconcile list of members with local specific records
            for (const member of members) {
                const existingRecord = await BrowniePointModel.findOne({ studentId: member.userId, courseId });
                
                if (!existingRecord) {
                    // Create new student record with 0 initial points
                    await BrowniePointModel.create({
                        studentId: member.userId,
                        courseId,
                        studentName: member.name,
                        studentEmail: member.email,
                        points: 0,
                        history: [],
                        lastSyncedAt: new Date(),
                    });
                    newStudentCount++;
                } else {
                    // Update user details in case their profile changed on the platform
                    await BrowniePointModel.updateOne(
                        { studentId: member.userId, courseId },
                        { 
                            studentName: member.name, 
                            studentEmail: member.email, 
                            lastSyncedAt: new Date() 
                        }
                    );
                }
            }

            console.log(`[NRPS] Roster sync complete for '${courseName}' (${courseId}). Total: ${members.length}, Added: ${newStudentCount}.`);
            
            return { synced: newStudentCount, courseName };

        } catch (error: any) {
            console.error(`[NRPS] Fatal error syncing course ${courseId} roster:`);
            console.error(`       Target: ${targetUrl}`);
            
            if (error.response) {
                console.error(`       Status code: ${error.response.status}`);
                console.error(`       Response body: ${JSON.stringify(error.response.data)}`);
            } else {
                console.error(`       Reason: ${error.message}`);
            }
            throw new Error(`Failed to sync roster: ${error.message}`);
        }
    }
}

// Exporting a singleton instance
export const bpService = new BrowniePointService();

// Support for straight function import to ease refactoring
export const syncRosterForCourse = (courseId: string) => bpService.syncRosterForCourse(courseId);
