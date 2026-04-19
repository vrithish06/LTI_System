import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import '../index.css';

interface IncentivesData {
  course_id: string;
  content: string;
  is_published: boolean;
  updated_at?: string;
  updated_by?: string;
}

interface Props {
  context: LtiContext;
}

// ─── Instructor Panel ─────────────────────────────────────────────────────────
export function InstructorIncentivesPanel({ context }: Props) {
  const [data, setData] = useState<IncentivesData | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchIncentives = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(`/api/lti/incentives/${context.courseId}`);
      if (res.success) {
        setData(res.data);
        setDraft(res.data.content || '');
      }
    } catch (err) {
      console.error('Failed to load incentives', err);
    } finally {
      setLoading(false);
    }
  }, [context.courseId]);

  useEffect(() => { fetchIncentives(); }, [fetchIncentives]);

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const { data: res } = await axios.put(`/api/lti/incentives/${context.courseId}`, {
        content: draft,
        userId: context.userId,
      });
      if (res.success) {
        setData(res.data);
        showToast('Draft saved successfully.');
      }
    } catch {
      showToast('Failed to save draft.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (publish: boolean) => {
    setPublishing(true);
    try {
      const { data: res } = await axios.patch(`/api/lti/incentives/${context.courseId}/publish`, {
        is_published: publish,
        userId: context.userId,
      });
      if (res.success) {
        setData(res.data);
        showToast(publish ? '✅ Incentives published — students can now see them.' : '⏸ Incentives unpublished.');
      }
    } catch {
      showToast('Failed to update publish state.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const isDirty = data !== null && draft !== (data.content || '');
  const isPublished = data?.is_published ?? false;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Toast */}
      {toast && <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>}

      {/* ── Status + Icon Header Card ── */}
      <div className="table-container" style={{ padding: '1.5rem 1.75rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: 'var(--primary-bg)',
          border: '1px solid hsl(38,70%,82%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem',
        }}>🎯</div>

        {/* Text */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              BP Incentives
            </h2>
            {/* Publish status pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 12px', borderRadius: 'var(--radius-full)', fontSize: '0.73rem', fontWeight: 700,
              background: isPublished ? 'hsl(142,60%,93%)' : 'var(--bg-secondary)',
              color: isPublished ? 'hsl(142,55%,32%)' : 'var(--text-muted)',
              border: `1px solid ${isPublished ? 'hsl(142,50%,78%)' : 'var(--border)'}`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isPublished ? 'hsl(142,55%,40%)' : 'var(--text-muted)', display: 'inline-block' }} />
              {isPublished ? 'Published' : 'Draft'}
            </span>
            {isDirty && (
              <span style={{
                fontSize: '0.7rem', color: 'hsl(38,80%,40%)', fontWeight: 600,
                background: 'var(--primary-bg)', padding: '2px 9px',
                borderRadius: 'var(--radius-full)', border: '1px solid hsl(38,70%,80%)',
              }}>
                Unsaved changes
              </span>
            )}
          </div>
          <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.55 }}>
            Write motivational rewards and incentives for this course. When published, students can view them from their dashboard.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* ── Editor Card ── */}
          <div className="table-container" style={{ marginBottom: '1.25rem', overflow: 'visible' }}>
            {/* Card header row */}
            <div style={{
              padding: '12px 20px',
              background: 'hsl(42,80%,97%)',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '0.6rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Incentives Content
              </span>
            </div>

            <div style={{ padding: '18px 20px' }}>
              <textarea
                id="incentives-editor"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={9}
                placeholder={`Write your course incentives here...\n\nExamples:\n• 🏆 Top 3 earners get bonus BP at the end of the semester!\n• ⏰ Submit before the deadline to earn a 10% early-bird bonus.\n• 🔄 Students with 90%+ BP retention unlock quiz retry privileges.\n• 🎁 Monthly raffle for students maintaining above-average BP.`}
                className="acr-input acr-textarea"
                style={{
                  width: '100%', resize: 'vertical',
                  minHeight: '180px', fontSize: '0.9rem', lineHeight: 1.75,
                }}
              />
            </div>
          </div>

          {/* ── Preview Card (student view) ── */}
          {draft.trim() && (
            <div style={{
              marginBottom: '1.25rem', borderRadius: 'var(--radius)',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.06) 100%)',
              border: '1px solid rgba(139,92,246,0.22)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 20px',
                borderBottom: '1px solid rgba(139,92,246,0.15)',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#7c3aed' }}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7c3aed', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Preview (Student View)
                </span>
              </div>
              <div style={{ padding: '1rem 1.25rem' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontSize: '0.875rem', lineHeight: 1.75 }}>
                  {draft}
                </p>
              </div>
            </div>
          )}

          {/* ── Action Buttons ── */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              id="save-incentives-draft-btn"
              className="btn-secondary"
              onClick={handleSaveDraft}
              disabled={saving || !isDirty}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {saving ? (
                <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Saving…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Save Draft
                </>
              )}
            </button>

            {isPublished ? (
              <button
                id="unpublish-incentives-btn"
                className="btn-secondary"
                onClick={() => handleTogglePublish(false)}
                disabled={publishing}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--error)', borderColor: 'hsl(0,84%,88%)' }}
              >
                {publishing ? 'Updating…' : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    Unpublish
                  </>
                )}
              </button>
            ) : (
              <button
                id="publish-incentives-btn"
                className="btn-primary"
                onClick={async () => {
                  if (isDirty) await handleSaveDraft();
                  handleTogglePublish(true);
                }}
                disabled={publishing || !draft.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {publishing ? 'Publishing…' : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    Publish to Students
                  </>
                )}
              </button>
            )}
          </div>

          {data?.updated_at && (
            <p style={{ marginTop: '0.85rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Last updated: {new Date(data.updated_at).toLocaleString()}
              {data.updated_by && ` by ${data.updated_by}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Student View ─────────────────────────────────────────────────────────────
export function StudentIncentivesView({ context }: Props) {
  const [data, setData] = useState<IncentivesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: res } = await axios.get(`/api/lti/incentives/${context.courseId}`);
        if (res.success) setData(res.data);
      } catch (err) {
        console.error('Failed to load incentives', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [context.courseId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  const isPublished = data?.is_published && data?.content?.trim();

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      {isPublished ? (
        <>
          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 12px', borderRadius: 'var(--radius-full)', fontSize: '0.73rem', fontWeight: 700,
              background: 'hsl(142,60%,93%)',
              color: 'hsl(142,55%,32%)',
              border: '1px solid hsl(142,50%,78%)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(142,55%,40%)', display: 'inline-block' }} />
              Published
            </span>
            {data?.updated_at && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Updated {new Date(data.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Content card */}
          <div style={{
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.09) 0%, rgba(99,102,241,0.07) 100%)',
            border: '1px solid rgba(139,92,246,0.22)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Decorative watermark */}
            <div style={{ position: 'absolute', top: 16, right: 20, fontSize: '2.5rem', opacity: 0.08, userSelect: 'none', pointerEvents: 'none' }}>⭐</div>

            {/* Card header */}
            <div style={{
              padding: '14px 22px',
              borderBottom: '1px solid rgba(139,92,246,0.15)',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
              }}>🏆</div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  From your Instructor
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  Motivational rewards set for this course
                </div>
              </div>
            </div>

            {/* Content body */}
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <p style={{
                margin: 0, whiteSpace: 'pre-wrap',
                color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.8,
              }}>
                {data!.content}
              </p>
            </div>
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="table-container" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14, opacity: 0.6 }}>📋</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, fontWeight: 600 }}>
            No incentives published yet
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginTop: 6 }}>
            Your instructor hasn't published any rewards for this course. Check back later!
          </p>
        </div>
      )}
    </div>
  );
}
