import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { LtiContext } from '../App';

interface BpRecord {
  _id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  points: number;
  history: {
    delta: number;
    reason: string;
    awardedBy: string;
    awardedAt: string;
  }[];
  lastSyncedAt: string;
}

interface Props {
  context: LtiContext;
}

export default function BrowniePointsDashboard({ context }: Props) {
  const [records, setRecords] = useState<BpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BpRecord | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const courseId = context.courseId;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAndSync = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Automatically sync the roster first
      try {
        const { data: syncData } = await axios.post(`/api/bp/sync/${courseId}`);
        if (syncData.courseName) setCourseName(syncData.courseName);
      } catch (err) {
        console.warn('Silent Roster sync failed.', err);
      }
      
      // 2. Fetch the updated records
      const { data } = await axios.get(`/api/bp/${courseId}`);
      if (data.success) setRecords(data.data);
    } catch (err: any) {
      showToast('Failed to load Brownie Points data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchAndSync();
  }, [fetchAndSync]);

  const handleUpdate = async () => {
    if (!selected || delta === '' || isNaN(Number(delta))) return;
    setUpdating(true);
    try {
      await axios.patch(`/api/bp/${courseId}/${selected.studentId}`, {
        delta: Number(delta),
        reason,
        instructorName: context.userName,
      });
      showToast(`Updated ${selected.studentName}'s Brownie Points by ${Number(delta) >= 0 ? '+' : ''}${delta}`);
      setSelected(null);
      setDelta('');
      setReason('');
      await fetchAndSync();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Update failed.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const filtered = records.filter(r =>
    r.studentName.toLowerCase().includes(search.toLowerCase()) ||
    r.studentEmail.toLowerCase().includes(search.toLowerCase())
  );

  const totalPoints = records.reduce((s, r) => s + r.points, 0);
  const avgPoints = records.length ? Math.round(totalPoints / records.length) : 0;
  const topStudent = records.length ? [...records].sort((a, b) => b.points - a.points)[0] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '0' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', padding: '12px 20px', borderRadius: '10px',
          fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.3s ease',
        }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--border)',
        padding: '20px 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', flexShrink: 0,
          }}>🍪</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Brownie Points
            </h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Course&nbsp;<span style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>{courseName || 'Loading...'}</span>
            </p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Students', value: records.length, icon: '👥', color: '#6366f1' },
            { label: 'Class Average', value: `${avgPoints} BP`, icon: '📊', color: '#10b981' },
            { label: 'Top Earner', value: topStudent ? `${topStudent.points} BP` : '—', icon: '🏆', color: '#f59e0b' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#fff', borderRadius: 14, padding: '20px 24px',
              border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: '1.8rem' }}>{stat.icon}</div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍  Search students by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, padding: '11px 16px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: '#fff',
              fontSize: '0.95rem', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>

        {/* Table */}
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid var(--border)',
          overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 16px' }} />
              Loading students...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>🍪</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>
                {records.length === 0
                  ? 'No students found in the roster.'
                  : 'No students match your search.'}
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                  {['Student', 'Email', 'Brownie Points', 'Last Updated', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '14px 20px', textAlign: 'left',
                      fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec, i) => (
                  <tr key={rec._id} style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Avatar + Name */}
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%',
                          background: `hsl(${(rec.studentName.charCodeAt(0) * 37) % 360}, 65%, 55%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0,
                        }}>
                          {rec.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rec.studentName}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {rec.studentEmail}
                    </td>
                    {/* Points badge */}
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: rec.points >= 0 ? '#fef3c7' : '#fee2e2',
                        color: rec.points >= 0 ? '#92400e' : '#991b1b',
                        padding: '5px 14px', borderRadius: 20, fontWeight: 800, fontSize: '1rem',
                      }}>
                        🍪 {rec.points}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {rec.history.length > 0
                        ? new Date(rec.history[rec.history.length - 1].awardedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { setSelected(rec); setShowHistory(false); setDelta(''); setReason(''); }}
                          style={{
                            background: 'var(--accent-purple)', color: '#fff',
                            border: 'none', borderRadius: 8, padding: '7px 14px',
                            fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem',
                          }}
                        >
                          ✏️ Edit BP
                        </button>
                        {rec.history.length > 0 && (
                          <button
                            onClick={() => { setSelected(rec); setShowHistory(true); }}
                            style={{
                              background: '#f1f5f9', color: 'var(--text-secondary)',
                              border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px',
                              fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem',
                            }}
                          >
                            📜 History
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit / History Modal */}
      {selected && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setSelected(null)}>
          <div
            style={{
              background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 480,
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)', animation: 'fadeIn 0.2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {showHistory ? '📜 Points History' : '✏️ Edit Brownie Points'}
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  {selected.studentName}
                  <span style={{
                    marginLeft: 10, background: '#fef3c7', color: '#92400e',
                    padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: '0.82rem',
                  }}>🍪 {selected.points} BP</span>
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{
                background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)',
              }}>✕</button>
            </div>

            {showHistory ? (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {selected.history.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No history yet.</p>
                ) : (
                  [...selected.history].reverse().map((h, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 0', borderBottom: i < selected.history.length - 1 ? '1px solid var(--border-light)' : 'none',
                    }}>
                      <div>
                        <span style={{
                          fontWeight: 700, fontSize: '1.05rem',
                          color: h.delta >= 0 ? '#10b981' : '#ef4444',
                        }}>
                          {h.delta >= 0 ? '+' : ''}{h.delta} BP
                        </span>
                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {h.reason || 'No reason given'} · by {h.awardedBy}
                        </p>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(h.awardedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  style={{
                    marginTop: 16, width: '100%', padding: '11px', background: 'var(--accent-purple)',
                    color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ✏️ Edit Points
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Point Change (use negative to deduct)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[-10, -5, +5, +10].map(v => (
                      <button
                        key={v}
                        onClick={() => setDelta(String(v))}
                        style={{
                          flex: 1, padding: '9px 0',
                          background: delta === String(v) ? 'var(--accent-purple)' : '#f1f5f9',
                          color: delta === String(v) ? '#fff' : (v > 0 ? '#10b981' : '#ef4444'),
                          border: `1.5px solid ${delta === String(v) ? 'var(--accent-purple)' : 'var(--border)'}`,
                          borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.92rem',
                        }}
                      >
                        {v > 0 ? '+' : ''}{v}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    placeholder="Or enter custom value..."
                    value={delta}
                    onChange={e => setDelta(e.target.value)}
                    style={{
                      marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1.5px solid var(--border)', fontSize: '1rem', color: 'var(--text-primary)',
                      background: '#fff', boxSizing: 'border-box', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Reason (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Great participation today"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1.5px solid var(--border)', fontSize: '0.95rem', color: 'var(--text-primary)',
                      background: '#fff', boxSizing: 'border-box', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setSelected(null)}
                    style={{
                      flex: 1, padding: '12px', background: '#f1f5f9', color: 'var(--text-secondary)',
                      border: '1px solid var(--border)', borderRadius: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={updating || delta === '' || isNaN(Number(delta))}
                    style={{
                      flex: 1, padding: '12px',
                      background: updating || delta === '' ? '#e2e8f0' : 'var(--accent-purple)',
                      color: updating || delta === '' ? 'var(--text-muted)' : '#fff',
                      border: 'none', borderRadius: 12, fontWeight: 700,
                      cursor: updating || delta === '' ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                    }}
                  >
                    {updating ? '⏳ Saving...' : '✅ Save Changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
