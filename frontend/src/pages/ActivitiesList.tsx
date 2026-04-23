import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import type { ActivityRecord } from './ActivitiesTypes';

interface Props {
  context: LtiContext;
  onOpenActivity: (activity: ActivityRecord) => void;
}

interface SubmissionRecord {
  activity_id: string;
  status: 'COMPLETED' | 'LATE' | 'PENDING';
  submitted_at?: string;
  score?: number;
  score_max?: number;
  proof_url?: string;
}

/* ── helpers ─────────────────────────────────────────────────────── */
const TYPE_LABEL: Record<string, string> = {
  ASSIGNMENT: 'Assign', VIBE_MILESTONE: 'Milestone',
  LTI_TOOL: 'LTI', EXTERNAL_IMPORT: 'Ext',
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : null;

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : null;

/* ── single card ─────────────────────────────────────────────────── */
function PendingCard({
  activity,
  onOpen,
}: {
  activity: ActivityRecord;
  onOpen: () => void;
}) {
  const dl = activity.deadline ? new Date(activity.deadline) : null;
  const isOverdue = dl ? dl < new Date() : false;

  return (
    <li
      className="activity-list-item al-card-pending"
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen()}
      role="button"
      aria-label={`Open ${activity.title}`}
    >
      <div className="al-status-stripe al-stripe-amber" />
      <div className="activity-item-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      </div>
      <div className="activity-item-content">
        <span className="activity-item-title">{activity.title}</span>
        {dl && (
          <span className={`activity-item-deadline ${isOverdue ? 'overdue' : ''}`}>
            {isOverdue ? '⚠ Overdue · ' : ''}{fmtDate(activity.deadline)}
          </span>
        )}
      </div>
      <div className="activity-item-badges">
        <span className="activity-type-badge">{TYPE_LABEL[activity.type] ?? activity.type}</span>
        <span className={`activity-req-badge ${activity.is_mandatory ? 'req' : 'opt'}`}>
          {activity.is_mandatory ? 'Req' : 'Opt'}
        </span>
      </div>
      <div className="activity-item-arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </li>
  );
}

/* ── completed card with submission detail ───────────────────────── */
function CompletedCard({
  activity,
  submission,
  onOpen,
}: {
  activity: ActivityRecord;
  submission?: SubmissionRecord;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLate = submission?.status === 'LATE';

  return (
    <li className="al-done-card" role="listitem">
      {/* clickable row */}
      <div
        className="al-done-row"
        onClick={() => setExpanded(e => !e)}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${activity.title} — expand submission`}
      >
        <div className="al-status-stripe al-stripe-green" />
        <div className="activity-item-icon al-done-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div className="activity-item-content">
          <span className="activity-item-title">{activity.title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span className="al-submitted-label">
              {isLate ? '⚠ Late · ' : '✓ '}
              {submission?.submitted_at ? fmt(submission.submitted_at) : 'Submitted'}
            </span>
            {submission?.score != null && submission.score_max != null && (
              <span className="al-score-badge">
                {submission.score}/{submission.score_max}
              </span>
            )}
          </div>
        </div>
        <div className="activity-item-badges">
          <span className="activity-type-badge">{TYPE_LABEL[activity.type] ?? activity.type}</span>
          <span className={`activity-req-badge ${activity.is_mandatory ? 'req' : 'opt'}`}>
            {activity.is_mandatory ? 'Req' : 'Opt'}
          </span>
        </div>
        {/* expand chevron */}
        <div className="al-expand-btn" title="View submission details">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* expanded submission detail */}
      {expanded && (
        <div className="al-submission-detail">
          <div className="al-detail-grid">

            <div className="al-detail-tile">
              <span className="al-detail-label">Status</span>
              <span className={`al-detail-value ${isLate ? 'al-val-late' : 'al-val-ok'}`}>
                {isLate ? '⚠ Late Submission' : '✓ On Time'}
              </span>
            </div>

            {submission?.submitted_at && (
              <div className="al-detail-tile">
                <span className="al-detail-label">Submitted At</span>
                <span className="al-detail-value">{fmt(submission.submitted_at)}</span>
              </div>
            )}

            {submission?.score != null && (
              <div className="al-detail-tile">
                <span className="al-detail-label">Score</span>
                <span className="al-detail-value al-val-ok">
                  {submission.score}{submission.score_max != null ? `/${submission.score_max}` : ''}
                </span>
              </div>
            )}

            {activity.rules?.reward_hp != null && (
              <div className="al-detail-tile">
                <span className="al-detail-label">BP Earned</span>
                <span className="al-detail-value al-val-ok">+{activity.rules.reward_hp} BP</span>
              </div>
            )}

            {activity.deadline && (
              <div className="al-detail-tile">
                <span className="al-detail-label">Deadline Was</span>
                <span className="al-detail-value">{fmt(activity.deadline)}</span>
              </div>
            )}

            {submission?.proof_url && (
              <div className="al-detail-tile al-detail-full">
                <span className="al-detail-label">Proof Submitted</span>
                <a
                  href={submission.proof_url.startsWith('http') ? submission.proof_url : `/api/lti/proof/${submission.proof_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="al-proof-link"
                  onClick={e => e.stopPropagation()}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  View Proof File
                </a>
              </div>
            )}
          </div>

          {/* secondary action */}
          <button className="al-view-detail-btn" onClick={e => { e.stopPropagation(); onOpen(); }}>
            Open Activity Page
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

/* ── missed card with detail ─────────────────────────────────────── */
function MissedCard({
  activity,
  onOpen,
}: {
  activity: ActivityRecord;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="al-done-card" role="listitem">
      <div
        className="al-done-row"
        onClick={() => setExpanded(e => !e)}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${activity.title} — expand details`}
      >
        <div className="al-status-stripe" style={{ background: '#ef4444' }} />
        <div className="activity-item-icon" style={{ background: '#fee2e2', color: '#ef4444' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <div className="activity-item-content">
          <span className="activity-item-title">{activity.title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span className="al-submitted-label" style={{ color: '#ef4444' }}>
              Hard deadline passed
            </span>
          </div>
        </div>
        <div className="activity-item-badges">
          <span className="activity-type-badge">{TYPE_LABEL[activity.type] ?? activity.type}</span>
          <span className={`activity-req-badge ${activity.is_mandatory ? 'req' : 'opt'}`}>
            {activity.is_mandatory ? 'Req' : 'Opt'}
          </span>
        </div>
        {/* expand chevron */}
        <div className="al-expand-btn" title="View details">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div className="al-submission-detail">
          <div className="al-detail-grid">
            <div className="al-detail-tile">
              <span className="al-detail-label">Status</span>
              <span className="al-detail-value al-val-late">
                ⚠ Missed
              </span>
            </div>

            {activity.deadline && (
              <div className="al-detail-tile">
                <span className="al-detail-label">Deadline Was</span>
                <span className="al-detail-value">{fmt(activity.deadline)}</span>
              </div>
            )}
            
            {activity.is_mandatory && activity.rules?.late_penalty_hp && (
              <div className="al-detail-tile">
                <span className="al-detail-label">Penalty</span>
                <span className="al-detail-value al-val-late">-{activity.rules.late_penalty_hp} BP</span>
              </div>
            )}
          </div>

          <button className="al-view-detail-btn" onClick={e => { e.stopPropagation(); onOpen(); }}>
            Open Activity Page
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

/* ── main component ──────────────────────────────────────────────── */
type Tab = 'assigned' | 'completed' | 'missed';

function getTabFromUrl(): Tab {
  const params = new URLSearchParams(window.location.search);
  const val = params.get('tab');
  if (val === 'completed' || val === 'missed' || val === 'assigned') return val;
  return 'assigned';
}

function setTabInUrl(tab: Tab) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('lti_token');
  const newParams = new URLSearchParams();
  if (token) newParams.set('lti_token', token);
  newParams.set('tab', tab);
  // pushState — so the browser back button navigates between tabs
  window.history.pushState({ tab }, '', window.location.pathname + '?' + newParams.toString());
}

export default function ActivitiesList({ context, onOpenActivity }: Props) {
  const [activities,   setActivities]   = useState<ActivityRecord[]>([]);
  const [submissions,  setSubmissions]  = useState<SubmissionRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState<Tab>(getTabFromUrl);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setTabInUrl(tab);
  };

  // Sync tab state when browser back/forward is pressed
  useEffect(() => {
    const onPop = () => setActiveTab(getTabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const isStudent = context.role === 'Learner';
        const url = `/api/lti/course/${context.courseId}/activities${
          isStudent ? `?userId=${context.userId}` : ''
        }`;
        const [actRes, subRes] = await Promise.allSettled([
          axios.get(url),
          isStudent ? axios.get(`/api/lti/submissions/${context.userId}/${context.courseId}`) : Promise.resolve(null),
        ]);

        if (actRes.status === 'fulfilled') {
          setActivities(actRes.value.data.data || actRes.value.data.activities || []);
        }
        if (subRes.status === 'fulfilled' && subRes.value) {
          setSubmissions(subRes.value.data.data || subRes.value.data.submissions || []);
        }
      } catch (err: any) {
        setError('Failed to load activities. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [context.courseId, context.userId, context.role]);

  const subMap = useMemo(
    () => Object.fromEntries(submissions.map(s => [s.activity_id, s])),
    [submissions],
  );

  const { assigned, completed, missed } = useMemo(() => {
    const now = new Date().getTime();
    return {
      assigned: activities.filter(a => {
        if (a.is_submitted) return false;
        if (!a.deadline) return true;
        const dl = new Date(a.deadline).getTime();
        return now <= dl; // Only show if NOT late
      }),
      completed: activities.filter(a => a.is_submitted),
      missed: activities.filter(a => {
        if (a.is_submitted) return false;
        if (!a.deadline) return false;
        const hardDl = new Date(a.deadline).getTime() + (a.grace_period || 0) * 60000;
        return now > hardDl;
      }),
    };
  }, [activities]);

  const total = activities.length;
  const doneCount = completed.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="activities-list-wrapper">

      {/* ── Header ── */}
      <div className="al-header">
        <div className="al-header-left">
          <div className="activities-header-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <h2 className="activities-section-title">Activities</h2>
            {!loading && (
              <p className="activities-section-subtitle">{doneCount} of {total} completed</p>
            )}
          </div>
        </div>

        {!loading && total > 0 && (
          <div className="al-progress-wrap" title={`${pct}% complete`}>
            <div className="al-progress-track">
              <div className="al-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="al-progress-label">{pct}%</span>
          </div>
        )}
      </div>

      {/* ── States ── */}
      {loading ? (
        <div className="activities-loading">
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2 }} />
          <span>Fetching activities…</span>
        </div>
      ) : error ? (
        <div className="activities-error">{error}</div>
      ) : total === 0 ? (
        <div className="activities-empty">
          <div className="activities-empty-icon">📋</div>
          <p>No activities found for this course.</p>
        </div>
      ) : (
        <>
          {/* ── Tab bar ── */}
          <div className="al-tab-bar">
            <button
              className={`al-tab ${activeTab === 'assigned' ? 'al-tab-active' : ''}`}
              onClick={() => switchTab('assigned')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Assigned
              <span className={`al-tab-count ${activeTab === 'assigned' ? 'al-tab-count-active' : ''}`}>
                {assigned.length}
              </span>
            </button>

            <button
              className={`al-tab ${activeTab === 'completed' ? 'al-tab-active al-tab-done-active' : ''}`}
              onClick={() => switchTab('completed')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Completed
              <span className={`al-tab-count ${activeTab === 'completed' ? 'al-tab-count-done-active' : ''}`}>
                {doneCount}
              </span>
            </button>

            <button
              className={`al-tab ${activeTab === 'missed' ? 'al-tab-active' : ''}`}
              style={activeTab === 'missed' ? { color: '#ef4444', borderColor: '#ef4444' } : {}}
              onClick={() => switchTab('missed')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              Missed
              <span className={`al-tab-count ${activeTab === 'missed' ? 'al-tab-count-active' : ''}`} style={activeTab === 'missed' ? { background: '#fee2e2', color: '#b91c1c' } : {}}>
                {missed.length}
              </span>
            </button>
          </div>

          {/* ── Assigned tab ── */}
          {activeTab === 'assigned' && (
            <div className="al-tab-panel">
              {assigned.length === 0 ? (
                <div className="al-tab-empty">
                  <span className="al-tab-empty-icon">🎉</span>
                  <p>All caught up! Every activity is submitted.</p>
                </div>
              ) : (
                <ul className="activity-items-list">
                  {assigned.map(a => (
                    <PendingCard key={a.activity_id} activity={a} onOpen={() => onOpenActivity(a)} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Completed tab ── */}
          {activeTab === 'completed' && (
            <div className="al-tab-panel">
              {completed.length === 0 ? (
                <div className="al-tab-empty">
                  <span className="al-tab-empty-icon">📝</span>
                  <p>No completed activities yet — submit your first one!</p>
                </div>
              ) : (
                <ul className="activity-items-list al-completed-list">
                  {completed.map(a => (
                    <CompletedCard
                      key={a.activity_id}
                      activity={a}
                      submission={subMap[a.activity_id]}
                      onOpen={() => onOpenActivity(a)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Missed tab ── */}
          {activeTab === 'missed' && (
            <div className="al-tab-panel">
              {missed.length === 0 ? (
                <div className="al-tab-empty">
                  <span className="al-tab-empty-icon">✨</span>
                  <p>Great job! You haven't missed any hard deadlines.</p>
                </div>
              ) : (
                <ul className="activity-items-list al-completed-list">
                  {missed.map(a => (
                    <MissedCard
                      key={a.activity_id}
                      activity={a}
                      onOpen={() => onOpenActivity(a)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
