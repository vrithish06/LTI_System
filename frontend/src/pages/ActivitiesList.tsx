import { useState, useEffect } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import type { ActivityRecord } from './ActivitiesTypes';

interface Props {
  context: LtiContext;
  onOpenActivity: (activity: ActivityRecord) => void;
}

export default function ActivitiesList({ context, onOpenActivity }: Props) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');

  const courseId = context.courseId;

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const isStudent = context.role === 'Learner';
        const url = `/api/lti/course/${courseId}/activities${isStudent ? `?userId=${context.userId}` : ''}`;
        const { data } = await axios.get(url);
        const list: ActivityRecord[] = data.data || data.activities || [];
        setActivities(list);
      } catch (err: any) {
        setError('Failed to load activities. Please try again.');
        console.error('[ActivitiesList] Error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, [courseId]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ASSIGNMENT': return 'Assign';
      case 'VIBE_MILESTONE': return 'Milestone';
      case 'LTI_TOOL': return 'LTI';
      case 'EXTERNAL_IMPORT': return 'Ext';
      default: return type.slice(0, 6);
    }
  };

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return null;
    const d = new Date(deadline);
    const now = new Date();
    const isOverdue = d < now;
    return {
      label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      isOverdue,
    };
  };

  return (
    <div className="activities-list-wrapper">
      {/* Section Header with collapse toggle */}
      <div className="activities-section-header" onClick={() => setCollapsed(c => !c)}>
        <div className="activities-header-left">
          <div className="activities-header-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <h2 className="activities-section-title">Activities</h2>
            {!collapsed && (
              <p className="activities-section-subtitle">
                {loading ? 'Loading...' : `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} in this course`}
              </p>
            )}
          </div>
        </div>
        <button
          className="activities-collapse-btn"
          aria-label={collapsed ? 'Expand activities' : 'Collapse activities'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Collapsible Content */}
      <div className={`activities-collapse-body ${collapsed ? 'collapsed' : 'expanded'}`}>
        {loading ? (
          <div className="activities-loading">
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2 }} />
            <span>Fetching activities…</span>
          </div>
        ) : error ? (
          <div className="activities-error">{error}</div>
        ) : activities.length === 0 ? (
          <div className="activities-empty">
            <div className="activities-empty-icon">📋</div>
            <p>No activities found for this course.</p>
            {context.role === 'Instructor' && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Use "Add Activity" in the sidebar to create one.
              </p>
            )}
          </div>
        ) : (
          <ul className="activity-items-list">
            {activities.map((activity) => {
              const deadline = formatDeadline(activity.deadline);
              const typeLabel = getTypeLabel(activity.type);
              return (
                <li
                  key={activity.activity_id}
                  className="activity-list-item"
                  onClick={() => onOpenActivity(activity)}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onOpenActivity(activity)}
                  role="button"
                  aria-label={`Open activity: ${activity.title}`}
                >
                  <div className="activity-item-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="activity-item-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="activity-item-title">{activity.title}</span>
                      {activity.is_submitted && (
                        <div style={{ color: '#10b981', display: 'flex', alignItems: 'center' }} title="Submitted">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {deadline && (
                      <span className={`activity-item-deadline ${deadline.isOverdue ? 'overdue' : ''}`}>
                        {deadline.isOverdue ? '⚠ Overdue · ' : ''}
                        {deadline.label}
                      </span>
                    )}
                  </div>
                  <div className="activity-item-badges">
                    <span className={`activity-type-badge type-${activity.type.toLowerCase()}`}>
                      {typeLabel}
                    </span>
                    <span className={`activity-req-badge ${activity.is_mandatory ? 'req' : 'opt'}`}>
                      {activity.is_mandatory ? 'Req' : 'Opt'}
                    </span>
                  </div>
                  <div className="activity-item-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
