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

interface Props {
    context: LtiContext;
    activityId: string;
    activityTitle: string;
    onClose: () => void;
}

export default function SubmissionsViewer({ context, activityId, activityTitle, onClose }: Props) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSubmissions = async () => {
            try {
                const { data } = await axios.get(`/api/lti/activities/${activityId}/submissions`);
                setSubmissions(data.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchSubmissions();
    }, [activityId]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
                <div className="modal-header">
                    <h2>Submissions: {activityTitle}</h2>
                    <button className="btn-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {loading ? (
                        <p>Loading...</p>
                    ) : submissions.length === 0 ? (
                        <p>No submissions yet.</p>
                    ) : (
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #ddd' }}>
                                    <th style={{ padding: '8px' }}>User ID</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                    <th style={{ padding: '8px' }}>Submitted At</th>
                                    <th style={{ padding: '8px' }}>Proof</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map(sub => (
                                    <tr key={sub.user_id + sub.activity_id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '8px' }}>{sub.user_id}</td>
                                        <td style={{ padding: '8px' }}>
                                            <span style={{ 
                                                color: sub.status === 'COMPLETED' ? 'green' : sub.status === 'LATE' ? 'orange' : 'red',
                                                fontWeight: 600 
                                            }}>
                                                {sub.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px' }}>{sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '—'}</td>
                                        <td style={{ padding: '8px' }}>
                                            {sub.proof_url ? (
                                                <a href={`/api/lti/proof/${sub.proof_url}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                                    View Proof
                                                </a>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
