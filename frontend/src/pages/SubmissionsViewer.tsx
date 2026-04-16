import { useState, useEffect } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';

interface Submission {
    user_id: string;
    activity_id: string;
    course_id: string;
    status: string;
    submitted_at: string;
    proof_url: string | null;
}

interface RosterStudent {
    studentId: string;
    studentName: string;
    studentEmail: string;
}

interface Props {
    context: LtiContext;
    activityId: string;
    activityTitle: string;
    onClose: () => void;
}

export default function SubmissionsViewer({ context, activityId, activityTitle, onClose }: Props) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [rosterMap, setRosterMap] = useState<Record<string, RosterStudent>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSubmissionsAndRoster = async () => {
            try {
                // Fetch both submissions and the BP roster concurrently
                const [subsRes, rosterRes] = await Promise.all([
                    axios.get(`/api/lti/activities/${activityId}/submissions`).catch(() => ({ data: { data: [] } })),
                    axios.get(`/api/bp/${context.courseId}`).catch(() => ({ data: { data: [] } }))
                ]);
                
                setSubmissions(subsRes.data.data || []);
                
                const rMap: Record<string, RosterStudent> = {};
                (rosterRes.data.data || []).forEach((student: RosterStudent) => {
                    rMap[student.studentId] = student;
                });
                setRosterMap(rMap);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchSubmissionsAndRoster();
    }, [activityId, context.courseId]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
                <div className="modal-header">
                    <h2>Submissions: {activityTitle}</h2>
                    <button className="btn-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {loading ? (
                        <p>Loading submissions...</p>
                    ) : submissions.length === 0 ? (
                        <p>No submissions found for this activity.</p>
                    ) : (
                        <table className="interactive-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>STUDENT</th>
                                    <th style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>STATUS</th>
                                    <th style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>SUBMITTED AT</th>
                                    <th style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>PROOF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map(sub => {
                                    const studentInfo = rosterMap[sub.user_id];
                                    return (
                                        <tr key={sub.user_id + sub.activity_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '12px' }}>
                                                {studentInfo ? (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{studentInfo.studentName}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{studentInfo.studentEmail}</div>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{sub.user_id}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <span className={`bp-badge ${sub.status === 'COMPLETED' ? 'positive' : sub.status === 'LATE' ? 'negative' : ''}`}>
                                                    {sub.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '—'}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                {sub.proof_url ? (
                                                    <a href={`/api/lti/proof/${sub.proof_url}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-dark)', fontWeight: 600, textDecoration: 'none' }}>
                                                        View Proof
                                                    </a>
                                                ) : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
