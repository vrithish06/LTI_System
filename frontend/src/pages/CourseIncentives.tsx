import { useState, useEffect, useCallback, useRef } from 'react';
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

function IncentivesPreview({ content, isPublished, updatedAt }: { content: string, isPublished: boolean, updatedAt?: string }) {
  return (
    <>
      {isPublished && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 12px', borderRadius: 'var(--radius-full)', fontSize: '0.73rem', fontWeight: 700,
            background: 'hsl(142,60%,93%)', color: 'hsl(142,55%,32%)', border: '1px solid hsl(142,50%,78%)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(142,55%,40%)', display: 'inline-block' }} />
            Published
          </span>
          {updatedAt && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Updated {new Date(updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div style={{
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.09) 0%, rgba(99,102,241,0.07) 100%)',
        border: '1px solid rgba(139,92,246,0.22)',
        overflow: 'hidden', position: 'relative',
        boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
      }}>
        <div style={{ position: 'absolute', top: 16, right: 20, fontSize: '2.5rem', opacity: 0.08, userSelect: 'none', pointerEvents: 'none' }}>⭐</div>
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid rgba(139,92,246,0.15)',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', color: '#fff'
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
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.8 }}>
            {content || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Your incentives will appear here...</span>}
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Instructor Panel ─────────────────────────────────────────────────────────
export function InstructorIncentivesPanel({ context }: Props) {
  const [data, setData] = useState<IncentivesData | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      }
    } catch {
      showToast('Failed to save.', 'error');
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
        if (publish) {
          setPublishSuccess(true);
          setTimeout(() => setPublishSuccess(false), 2500);
        } else {
          showToast('⏸ Incentives unpublished.');
        }
      }
    } catch {
      showToast('Failed to update publish state.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const applyFormat = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = draft.substring(start, end);
    const newText = draft.substring(0, start) + prefix + selectedText + suffix + draft.substring(end);
    setDraft(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const val = textarea.value;
      
      let lineStart = val.lastIndexOf('\n', start - 1);
      lineStart = lineStart === -1 ? 0 : lineStart + 1;
      const currentLine = val.substring(lineStart, start);
      
      const listMatch = currentLine.match(/^(\s*[-*•]\s+)/);
      if (listMatch) {
        e.preventDefault();
        const prefix = listMatch[1];
        if (currentLine.trim() === prefix.trim()) {
          const newText = val.substring(0, lineStart) + val.substring(start);
          setDraft(newText);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
        } else {
          const newText = val.substring(0, start) + '\n' + prefix + val.substring(start);
          setDraft(newText);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 1 + prefix.length;
          }, 0);
        }
      }
    }
  };

  const isDirty = data !== null && draft !== (data.content || '');
  const isPublished = data?.is_published ?? false;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {toast && <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>}

      {/* Status Pill */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem', marginTop: '-1rem' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700,
          background: isPublished ? 'hsl(142,60%,93%)' : 'var(--bg-secondary)',
          color: isPublished ? 'hsl(142,55%,32%)' : 'var(--text-muted)',
          border: `1px solid ${isPublished ? 'hsl(142,50%,78%)' : 'var(--border)'}`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isPublished ? 'hsl(142,55%,40%)' : 'var(--text-muted)', display: 'inline-block' }} />
          {isPublished ? 'Published to Students' : 'Draft Mode'}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
          
          {/* LEFT: EDITOR */}
          <div className="table-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                INCENTIVES CONTENT
              </span>
            </div>
            
            {/* Toolbar */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: '#fafafa', display: 'flex', gap: '8px' }}>
              <button onClick={() => applyFormat('**', '**')} style={{ background:'none', border:'none', cursor:'pointer', fontWeight:'bold', padding:'4px 8px', borderRadius:'4px', color:'var(--text-secondary)' }} title="Bold">B</button>
              <button onClick={() => applyFormat('_', '_')} style={{ background:'none', border:'none', cursor:'pointer', fontStyle:'italic', padding:'4px 8px', borderRadius:'4px', color:'var(--text-secondary)' }} title="Italic">I</button>
              <div style={{ width: 1, background: 'var(--border)', margin: '4px 4px' }} />
              <button onClick={() => applyFormat('- ')} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 8px', borderRadius:'4px', color:'var(--text-secondary)' }} title="Bullet List">• List</button>
              <button onClick={() => applyFormat('[', '](url)')} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 8px', borderRadius:'4px', color:'var(--text-secondary)' }} title="Link">🔗 Link</button>
            </div>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Write your course incentives here...\n\nExamples:\n• 🏆 Top 3 earners get bonus BP at the end of the semester!\n• ⏰ Submit before the deadline to earn a 10% early-bird bonus.`}
              style={{
                flex: 1, width: '100%', resize: 'none', border: 'none', outline: 'none',
                padding: '20px', fontSize: '0.95rem', lineHeight: 1.75, background: '#fff',
                fontFamily: 'inherit', color: 'var(--text-primary)'
              }}
            />

            {/* Footer Actions */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: isDirty ? '#f59e0b' : '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <div className="spinner" style={{width: 12, height: 12, borderWidth: 2}}/> : null}
                {saving ? 'Saving...' : (isDirty ? 'Unsaved changes' : '✓ All changes saved')}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-secondary" onClick={handleSaveDraft} disabled={saving || !isDirty}>
                  Save Draft
                </button>
                {isPublished ? (
                  <button className="btn-secondary" onClick={() => handleTogglePublish(false)} disabled={publishing} style={{ color: 'var(--error)' }}>
                    Unpublish
                  </button>
                ) : (
                  <button 
                    className="btn-primary" 
                    onClick={async () => {
                      if (isDirty) await handleSaveDraft();
                      handleTogglePublish(true);
                    }} 
                    disabled={publishing || !draft.trim() || publishSuccess}
                    style={{ background: publishSuccess ? '#10b981' : undefined, transition: 'background 0.3s' }}
                  >
                    {publishing ? 'Publishing...' : publishSuccess ? '✓ Published!' : 'Publish to Students'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: PREVIEW */}
          <div>
            <div style={{ marginBottom: '16px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              STUDENT PREVIEW
            </div>
            <IncentivesPreview 
              content={draft} 
              isPublished={isPublished} 
              updatedAt={data?.updated_at} 
            />
          </div>
        </div>
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
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}><div className="spinner" /></div>;
  }

  const isPublished = data?.is_published && data?.content?.trim();

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {isPublished ? (
        <IncentivesPreview content={data!.content} isPublished={true} updatedAt={data!.updated_at} />
      ) : (
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
