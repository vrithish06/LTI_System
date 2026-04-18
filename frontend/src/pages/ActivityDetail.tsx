import { useState, useEffect } from 'react';
import axios from 'axios';
import { LtiContext } from '../App';
import '../index.css';

interface ActivityRecord {
  activity_id: string;
  course_id: string;
  title: string;
  type: string;
  deadline?: string;
  grace_period?: number;
  is_mandatory?: boolean;
  is_proof_required?: boolean;
  rules?: {
    reward_hp?: number;
    late_penalty_hp?: number;
    late_penalty_percent?: number;
    score_to_hp_multiplier?: number;
  };
}

interface SubmissionRecord {
  activity_id: string;
  user_id: string;
  course_id: string;
  status: 'COMPLETED' | 'LATE' | 'PENDING';
  submitted_at?: string;
  score?: number;
  score_max?: number;
}

interface HpBalance {
  current_hp: number;
  updated_at: string;
}

interface Props {
  context: LtiContext;
  onSuccess?: (hp: number) => void;
  onError?: (msg: string) => void;
}

type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

export default function ActivityDetail({ context, onSuccess, onError }: Props) {
  const [activity, setActivity] = useState<ActivityRecord | null>(null);
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [hpBalance, setHpBalance] = useState<HpBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [hpChange, setHpChange] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const activityId = context.activityId;
  const courseId = context.courseId;
  const userId = context.userId;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load activity, submission history, and HP balance
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Use the public /lti/* routes — no shared secret needed from the browser
        const [actRes, subRes, hpRes] = await Promise.allSettled([
          axios.get(`/api/lti/course/${courseId}/activities`),
          axios.get(`/api/lti/submissions/${userId}/${courseId}`),
          axios.get(`/api/lti/bp/${userId}/${courseId}`),
        ]);

        if (actRes.status === 'fulfilled') {
          // Response shape: { success, data: IActivity[] }
          const list: ActivityRecord[] = actRes.value.data.data || actRes.value.data.activities || [];
          const found = list.find((a: ActivityRecord) => a.activity_id === activityId);
          setActivity(found || null);
        }

        if (subRes.status === 'fulfilled') {
          // Response shape: { success, data: ISubmission[] }
          const list: SubmissionRecord[] = subRes.value.data.data || subRes.value.data.submissions || [];
          const found = list.find((s: SubmissionRecord) => s.activity_id === activityId);
          setSubmission(found || null);
        }

        if (hpRes.status === 'fulfilled') {
          // Response shape: { success, data: IHpBalance } or 404
          const bal = hpRes.value.data.data || hpRes.value.data.browniePoints || null;
          setHpBalance(bal);
        }
      } catch (err: any) {
        console.warn('[ActivityDetail] Failed to load:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activityId, courseId, userId]);

  const handleSubmit = async () => {
    setSubmitState('submitting');
    setConfirmOpen(false);
    try {
      let reqData: any;
      let headers: any = {};

      if (activity?.is_proof_required) {
        if (!proofFile) {
          showToast('Proof file is required.', 'error');
          setSubmitState('error');
          return;
        }
        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('course_id', courseId);
        formData.append('proof', proofFile);
        reqData = formData;
        headers['Content-Type'] = 'multipart/form-data';
      } else {
        reqData = { user_id: userId, course_id: courseId };
      }

      const { data } = await axios.post(`/api/lti/activities/${activityId}/submit`, reqData, { headers });

      // Response shape: { success, data: { submission, status, hp_change, message } }
      const result = data.data || data;
      setHpChange(result.hp_change ?? 0);
      setSubmission(result.submission);
      setSubmitState('done');

      // Refresh HP balance
      try {
        const hpRes = await axios.get(`/api/lti/bp/${userId}/${courseId}`);
        const bal = hpRes.data.data || hpRes.data.browniePoints || null;
        if (bal) setHpBalance(bal);
      } catch (_) { }

      showToast(result.message || 'Activity submitted!', 'success');
      onSuccess?.(result.hp_change ?? 0);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error;
      const status = err?.response?.status;

      // 409 = already submitted — treat as success, refresh submission state
      if (status === 409) {
        showToast('Activity already submitted.', 'success');
        // Reload submission data to reflect true state
        try {
          const subRes = await axios.get(`/api/lti/submissions/${userId}/${courseId}`);
          const list: SubmissionRecord[] = subRes.data.data || subRes.data.submissions || [];
          const found = list.find((s: SubmissionRecord) => s.activity_id === activityId);
          if (found) setSubmission(found);
        } catch (_) { }
        setSubmitState('done');
        return;
      }

      const msg = serverMsg || 'Submission failed. Please try again.';
      setSubmitState('error');
      showToast(msg, 'error');
      onError?.(msg);
    }
  };

  const isCompleted = submission?.status === 'COMPLETED' || submission?.status === 'LATE';

  const getISTTime = (date?: Date | string | null) => {
    if (!date) return new Date();
    const d = new Date(date);
    return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  };
  const nowIST = getISTTime();
  const deadlineIST = activity?.deadline ? getISTTime(activity.deadline) : null;
  const isExpired = deadlineIST && nowIST > deadlineIST;
  const deadline = activity?.deadline ? new Date(activity.deadline) : null;
  const isOverdue = isExpired;
  const isLate = false; // Deadlines strictly enforced now

  if (loading) {
    return (
      <div className="activity-detail-wrapper">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading activity details...</p>
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="activity-detail-wrapper">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h2>Activity Not Found</h2>
          <p>
            This activity (ID: <code>{activityId}</code>) hasn't been synced to the LTI system yet.
            Please ask your instructor to re-save it in Vibe.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-detail-wrapper">
      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>
      )}

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Confirm Submission</h2>
                <p className="modal-subtitle">This action cannot be undone.</p>
              </div>
              <button className="btn-close" onClick={() => setConfirmOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="edit-form">
              {activity.is_proof_required && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Upload Proof (PDF, JPG, PNG) <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    style={{ display: 'block', width: '100%', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  />
                </div>
              )}
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                ⚠️ By confirming, you declare that you have genuinely completed{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{activity.title}</strong>.
                False declarations may result in disciplinary action.
              </p>
              {!activity.is_proof_required && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      style={{ marginRight: '0.5rem', transform: 'scale(1.2)' }}
                    />
                    I confirm I have completed this activity
                  </label>
                </div>
              )}
              {isExpired && (
                <p className="text-orange" style={{ marginTop: '-0.75rem', marginBottom: '1.25rem', fontWeight: 500, color: 'red' }}>
                  Deadline exceeded. You cannot submit this activity.
                </p>
              )}
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setConfirmOpen(false)} disabled={submitState === 'submitting'}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={submitState === 'submitting' || isExpired || (activity.is_proof_required ? !proofFile : !confirmed)}
                >
                  {submitState === 'submitting' ? 'Submitting...' : "Submit Activity"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bp-header">
        <div className="header-content">
          <div className="header-text">
            <h1 style={{ fontSize: '1.5rem' }}>{activity.title}</h1>
            <p>
              {activity.type?.replace(/_/g, ' ')}
              {activity.is_mandatory && (
                <span className="tag-pill tag-red" style={{ marginLeft: '0.5rem' }}>Required</span>
              )}
            </p>
          </div>
          {hpBalance && (
            <div className="stat-card" style={{ marginLeft: 'auto', minWidth: 'auto', padding: '0.75rem 1.25rem' }}>
              <div className="stat-info">
                <span className="stat-label">Your BP Balance</span>
                <span className="stat-value text-green">{Math.round(hpBalance.current_hp)} BP</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="bp-main-container">
        {/* Status banner */}
        {isCompleted ? (
          <div className="notice-banner notice-green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <strong>
                {isLate ? 'Submitted Late' : 'Completed!'}
              </strong>
              {submission?.submitted_at && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.75 }}>
                  — {new Date(submission.submitted_at).toLocaleString()}
                </span>
              )}
              {submitState === 'done' && hpChange !== 0 && (
                <span className={`bp-badge ${hpChange >= 0 ? 'positive' : 'negative'}`} style={{ marginLeft: '0.75rem' }}>
                  {hpChange > 0 ? '+' : ''}{hpChange} BP
                </span>
              )}
            </div>
          </div>
        ) : isOverdue ? (
          <div className="notice-banner notice-red">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>Deadline Passed</strong>
              <span style={{ marginLeft: '0.5rem', opacity: 0.75 }}>
                — Late submissions may still be recorded with a BP penalty.
              </span>
            </div>
          </div>
        ) : null}

        {/* Stats row */}
        <div className="stats-grid">
          {/* Deadline */}
          <div className="stat-card">
            <div className={`stat-icon ${isOverdue ? 'icon-red' : 'icon-purple'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Deadline</span>
              <span className={`stat-value ${isOverdue ? 'text-red' : 'text-purple'}`} style={{ fontSize: '1rem' }}>
                {deadline
                  ? deadline.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'No deadline'}
              </span>
            </div>
          </div>

          {/* Reward */}
          {activity.rules?.reward_hp && (
            <div className="stat-card">
              <div className="stat-icon icon-green">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20V10" /><path d="M18 20v-4" /><path d="M6 20v-6" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Reward</span>
                <span className="stat-value text-green">+{activity.rules.reward_hp} BP</span>
              </div>
            </div>
          )}

          {/* Penalty */}
          {((activity.rules?.late_penalty_hp || 0) > 0 || (activity.rules?.late_penalty_percent || 0) > 0) && (
            <div className="stat-card">
              <div className="stat-icon icon-orange">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-label">Late Penalty</span>
                <span className="stat-value text-orange">
                  {activity.rules.late_penalty_percent
                    ? `-${activity.rules.late_penalty_percent}%`
                    : `-${activity.rules.late_penalty_hp} BP`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Description / completion area */}
        <div className="table-container" style={{ padding: '1.5rem', minHeight: 'auto' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>
              About this activity
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2rem' }}>
              Complete this activity and confirm your submission below. Your Brownie Points will be
              updated automatically based on whether the submission is on time or late.
            </p>

            {/* Submit / Already done */}
            {isCompleted ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#16a34a', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                You have  submitted this activity.
              </div>
            ) : isExpired ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'red', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Expired. You cannot submit this activity.
              </div>
            ) : submitState === 'submitting' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                <div className="spinner" style={{ width: '1.25rem', height: '1.25rem', borderWidth: '2px' }} />
                Submitting…
              </div>
            ) : (
              <button
                className="btn-primary"
                style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                onClick={() => {
                  setProofFile(null);
                  setConfirmed(false);
                  setConfirmOpen(true);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                I've Completed This Activity
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
