/**
 * Standard NRPS Roster Sync Service
 *
 * Fetches course members from any LTI 1.3–compliant LMS using the standard
 * Names and Role Provisioning Services (NRPS) protocol with OAuth2 Bearer auth.
 *
 * This is the universal counterpart to Vibe's x-lti-secret approach.
 * Both paths write to the same BrowniePointModel — the rest of the system
 * doesn't know or care which sync method was used.
 *
 * Flow:
 *   1. Look up the platform in lti_platforms by issuer
 *   2. Request an OAuth2 Bearer token using your RSA private key
 *   3. GET the NRPS memberships URL with Bearer token
 *   4. Upsert each student into BrowniePointModel (same as Vibe sync)
 */
import { BrowniePointModel } from '../models/BrowniePoint.js';
import { LtiPlatformModel } from '../models/ltiPlatform.js';
import { getLmsAccessToken, NRPS_SCOPE } from './oauth2.service.js';

interface NrpsMember {
    user_id:   string;
    name?:     string;
    email?:    string;
    roles:     string[];
    status:    string;
}

/**
 * Syncs course roster from a universal LMS via standard NRPS + OAuth2.
 *
 * @param nrpsMembershipsUrl   The context_memberships_url from the LTI launch token
 * @param platformIssuer       The `iss` claim — used to look up platform credentials
 * @param courseId             Internal course ID for upsert keys
 * @param courseName           Human-readable course name (from launch context)
 */
export async function syncRosterFromNrps(
    nrpsMembershipsUrl: string,
    platformIssuer: string,
    courseId: string,
    courseName: string = '',
): Promise<{ synced: number; courseName: string }> {

    const platform = await LtiPlatformModel.findOne({ issuer: platformIssuer, is_active: true });
    if (!platform) {
        throw new Error(`No registered platform found for issuer "${platformIssuer}"`);
    }

    console.log(`[NRPS Universal] Fetching roster from ${nrpsMembershipsUrl}`);

    // Request OAuth2 Bearer token with NRPS scope
    const token = await getLmsAccessToken(platform, NRPS_SCOPE);

    // Fetch members — handle LMS pagination via Link header if present
    let allMembers: NrpsMember[] = [];
    let nextUrl: string | null = nrpsMembershipsUrl;

    while (nextUrl) {
        const resp = await fetch(nextUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
            },
        });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`NRPS request failed (${resp.status}): ${body}`);
        }

        const data = await resp.json() as { members: NrpsMember[]; context?: { title?: string } };
        allMembers = allMembers.concat(data.members || []);

        // Follow pagination Link header if present
        const linkHeader = resp.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = nextMatch ? nextMatch[1] : null;

        if (!courseName && data.context?.title) {
            courseName = data.context.title;
        }
    }

    // Filter to learners only (exclude instructors/admins from BP records)
    const learners = allMembers.filter(m =>
        m.status === 'Active' &&
        m.roles?.some(r => r.includes('Learner') || r.includes('Student'))
    );

    console.log(`[NRPS Universal] ${allMembers.length} total members, ${learners.length} active learners`);

    let newCount = 0;
    for (const member of learners) {
        const existing = await BrowniePointModel.findOne({ studentId: member.user_id, courseId });
        if (!existing) {
            await BrowniePointModel.create({
                studentId:    member.user_id,
                courseId,
                studentName:  member.name  || member.user_id,
                studentEmail: member.email || '',
                points:       0,
                history:      [],
                lastSyncedAt: new Date(),
            });
            newCount++;
        } else {
            await BrowniePointModel.updateOne(
                { studentId: member.user_id, courseId },
                {
                    studentName:  member.name  || existing.studentName,
                    studentEmail: member.email || existing.studentEmail,
                    lastSyncedAt: new Date(),
                }
            );
        }
    }

    console.log(`[NRPS Universal] Sync complete for "${courseName}" (${courseId}). Added: ${newCount}/${learners.length}`);
    return { synced: newCount, courseName };
}
