import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import type { ActivityRecord } from './ActivitiesTypes';
import SubmissionsViewer from './SubmissionsViewer';

interface Props {
  context: LtiContext;
  onAddActivity: () => void; // navigate to Add Activity tab
}

interface EditFormData {
  title: string;
  description: string;
  activityType: string;
  deadline: string;
  rewardType: string;
  rewardValue: string;
  mandatory: boolean;
  penaltyType: string;
  penaltyValue: string;
  submissionMode: string;
  hpAssignmentMode: string;
  gracePeriodDuration: string;
  isProofRequired: boolean;
}

const toLocalDatetimeString = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const activityToForm = (a: ActivityRecord): EditFormData => ({
  title: a.title,
  description: (a.rules as any)?.description || '',
  activityType: a.type || 'ASSIGNMENT',
  deadline: toLocalDatetimeString(a.deadline),
  rewardType: (a.rules as any)?.reward_type || 'ABSOLUTE',
  rewardValue: String((a.rules as any)?.reward_hp ?? 10),
  mandatory: a.is_mandatory ?? false,
  penaltyType: (a.rules as any)?.late_penalty_hp ? 'ABSOLUTE' : 'PERCENTAGE',
  penaltyValue: String((a.rules as any)?.late_penalty_hp ?? (a.rules as any)?.late_penalty_percent ?? 0),
  submissionMode: (a.rules as any)?.submission_mode || 'IN_PLATFORM',
  hpAssignmentMode: (a.rules as any)?.hp_assignment_mode || 'AUTOMATIC',
  gracePeriodDuration: String(Math.floor(((a.grace_period ?? 0)) / 60)),
  isProofRequired: a.is_proof_required ?? false,
});

export default function InstructorActivitiesManager({ context, onAddActivity }: Props) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingSubmissionsActivity, setViewingSubmissionsActivity] = useState<ActivityRecord | null>(null);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`/api/lti/course/${context.courseId}/activities`);
      setActivities(data.data || data.activities || []);
    } catch (err: any) {
      setError('Failed to load activities.');
    } finally {
      setLoading(false);
    }
  }, [context.courseId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const startEdit = (a: ActivityRecord) => {
    setEditingId(a.activity_id);
    setEditForm(activityToForm(a));
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setEditForm(prev => prev ? {
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    } : prev);
  };

  const handleSave = async (activityId: string) => {
    if (!editForm) return;
    setSaving(true);
    try {
      await axios.put(`/api/lti/activities/${activityId}`, {
        title: editForm.title,
        description: editForm.description,
        activityType: editForm.activityType,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : undefined,
        rewardType: editForm.rewardType,
        rewardValue: Number(editForm.rewardValue),
        mandatory: editForm.mandatory,
        penaltyType: editForm.penaltyType,
        penaltyValue: Number(editForm.penaltyValue),
        submissionMode: editForm.submissionMode,
        hpAssignmentMode: editForm.hpAssignmentMode,
        gracePeriodDuration: Number(editForm.gracePeriodDuration),
        isProofRequired: editForm.isProofRequired,
      });
      setEditingId(null);
      setEditForm(null);
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (activityId: string, title: string) => {
    if (!confirm(`Delete activity "${title}"? This cannot be undone.`)) return;
    setDeletingId(activityId);
    try {
      await axios.delete(`/api/lti/activities/${activityId}`);
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete activity.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDeadline = (iso?: string) => {
    if (!iso) return 'No deadline';
    const d = new Date(iso);
    const isOverdue = d < new Date();
    return { label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), isOverdue };
  };

  return (
    <div className="ia-manager">
      {/* Header */}
      <div className="ia-header">
        <div>
          <h2 className="ia-title">Manage Activities</h2>
          <p className="ia-subtitle">{loading ? 'Loading…' : `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} in this course`}</p>
        </div>
        <button className="ia-add-btn" onClick={onAddActivity}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Activity
        </button>
      </div>

      {/* Error */}
      {error && <div className="ia-error">{error}</div>}

      {/* Loading */}
      {loading ? (
        <div className="ia-loading"><div className="spinner" style={{ width: 28, height: 28, borderWidth: 2 }} /><span>Loading activities…</span></div>
      ) : activities.length === 0 ? (
        <div className="ia-empty">
          <div className="ia-empty-icon">📋</div>
          <p>No activities yet. Click <strong>Add Activity</strong> to create one.</p>
        </div>
      ) : (
        <div className="ia-list">
          {activities.map(a => {
            const dl = formatDeadline(a.deadline);
            const isEditing = editingId === a.activity_id;
            const isDeleting = deletingId === a.activity_id;

            return (
              <div key={a.activity_id} className={`ia-card ${isEditing ? 'ia-card-editing' : ''}`}>
                {/* ── View Row ── */}
                {!isEditing && (
                  <div className="ia-row">
                    <div className="ia-row-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="ia-row-content">
                      <span className="ia-row-title">{a.title}</span>
                      <div className="ia-row-meta">
                        {typeof dl === 'string' ? (
                          <span className="ia-meta-tag">{dl}</span>
                        ) : (
                          <span className={`ia-meta-tag ${dl.isOverdue ? 'ia-overdue' : ''}`}>
                            {dl.isOverdue ? '⚠ Overdue · ' : ''}{dl.label}
                          </span>
                        )}
                        <span className="ia-meta-tag ia-type">{a.type}</span>
                        <span className={`ia-meta-tag ${a.is_mandatory ? 'ia-req' : 'ia-opt'}`}>{a.is_mandatory ? 'Required' : 'Optional'}</span>
                        <span className="ia-meta-tag">🏆 {(a.rules as any)?.reward_hp ?? 0} BP</span>
                      </div>
                    </div>
                    <div className="ia-row-actions">
                      <button className="ia-btn ia-btn-edit" onClick={() => startEdit(a)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                      <button className="ia-btn btn-secondary" onClick={() => setViewingSubmissionsActivity(a)} title="View Submissions">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        Submissions
                      </button>
                      <button className="ia-btn ia-btn-delete" onClick={() => handleDelete(a.activity_id, a.title)} disabled={isDeleting} title="Delete">
                        {isDeleting ? (
                          <span style={{ fontSize: '0.7rem' }}>Deleting…</span>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                            </svg>
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Edit Form ── */}
                {isEditing && editForm && (
                  <div className="ia-edit-form">
                    <div className="ia-edit-header">
                      <span>✏️ Editing: <strong>{a.title}</strong></span>
                      <button className="ia-cancel-btn" onClick={cancelEdit}>✕ Cancel</button>
                    </div>

                    <div className="ia-form-grid">
                      <div className="ia-form-full">
                        <label>Title</label>
                        <input className="ia-input" name="title" value={editForm.title} onChange={handleEditChange} />
                      </div>
                      <div className="ia-form-full">
                        <label>Description</label>
                        <textarea className="ia-input" name="description" value={editForm.description} onChange={handleEditChange} rows={2} />
                      </div>
                      <div>
                        <label>Activity Type</label>
                        <select className="ia-input" name="activityType" value={editForm.activityType} onChange={handleEditChange}>
                          <option value="ASSIGNMENT">Assignment</option>
                          <option value="VIBE_MILESTONE">Vibe Milestone</option>
                          <option value="LTI_TOOL">External Tool (LTI)</option>
                          <option value="EXTERNAL_IMPORT">External Import</option>
                        </select>
                      </div>
                      <div>
                        <label>Submission Mode</label>
                        <select className="ia-input" name="submissionMode" value={editForm.submissionMode} onChange={handleEditChange}>
                          <option value="IN_PLATFORM">In Platform</option>
                          <option value="EXTERNAL_LINK">External Link</option>
                          <option value="CSV_IMPORT">CSV Import</option>
                        </select>
                      </div>
                      <div>
                        <label>Deadline</label>
                        <input className="ia-input" type="datetime-local" name="deadline" value={editForm.deadline} onChange={handleEditChange} />
                      </div>
                      <div>
                        <label>HP Assignment Mode</label>
                        <select className="ia-input" name="hpAssignmentMode" value={editForm.hpAssignmentMode} onChange={handleEditChange}>
                          <option value="AUTOMATIC">Automatic</option>
                          <option value="MANUAL">Manual</option>
                        </select>
                      </div>
                      <div>
                        <label>Reward Type</label>
                        <select className="ia-input" name="rewardType" value={editForm.rewardType} onChange={handleEditChange}>
                          <option value="ABSOLUTE">Absolute (Fixed BP)</option>
                          <option value="PERCENTAGE">Percentage (%)</option>
                        </select>
                      </div>
                      <div>
                        <label>Reward Value (BP)</label>
                        <input className="ia-input" type="number" name="rewardValue" value={editForm.rewardValue} onChange={handleEditChange} />
                      </div>
                      <div>
                        <label>Grace Period (Hours)</label>
                        <input className="ia-input" type="number" name="gracePeriodDuration" value={editForm.gracePeriodDuration} onChange={handleEditChange} />
                      </div>
                      <div className="ia-form-checkboxes">
                        <label className="ia-checkbox-row">
                          <input type="checkbox" name="mandatory" checked={editForm.mandatory} onChange={handleEditChange} />
                          <span>Mandatory Activity</span>
                        </label>
                        <label className="ia-checkbox-row">
                          <input type="checkbox" name="isProofRequired" checked={editForm.isProofRequired} onChange={handleEditChange} />
                          <span>Proof Required</span>
                        </label>
                      </div>
                      {editForm.mandatory && (
                        <>
                          <div>
                            <label>Penalty Type</label>
                            <select className="ia-input" name="penaltyType" value={editForm.penaltyType} onChange={handleEditChange}>
                              <option value="PERCENTAGE">Percentage (%)</option>
                              <option value="ABSOLUTE">Absolute (Fixed BP)</option>
                            </select>
                          </div>
                          <div>
                            <label>Penalty Value</label>
                            <input className="ia-input" type="number" name="penaltyValue" value={editForm.penaltyValue} onChange={handleEditChange} />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="ia-edit-actions">
                      <button className="ia-save-btn" onClick={() => handleSave(a.activity_id)} disabled={saving}>
                        {saving ? 'Saving…' : '✓ Save Changes'}
                      </button>
                      <button className="ia-cancel-btn" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {viewingSubmissionsActivity && (
        <SubmissionsViewer
          context={context}
          activityId={viewingSubmissionsActivity.activity_id}
          activityTitle={viewingSubmissionsActivity.title}
          onClose={() => setViewingSubmissionsActivity(null)}
        />
      )}
    </div>
  );
}
