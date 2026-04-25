import { useEffect, useState } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';

interface BpHistory {
  delta: number;
  reason: string;
  awardedBy: string;
  awardedAt: string;
}

interface StudentRecord {
  studentId: string;
  studentName: string;
  studentEmail: string;
  points: number;
  history: BpHistory[];
  lastSyncedAt?: string;
}

interface Props {
  context: LtiContext;
}

export default function StudentBPDashboard({ context }: Props) {
  const [record, setRecord] = useState<StudentRecord | null>(null);
  const [classAvg, setClassAvg] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState('');

  // History filters
  const [histFilterType, setHistFilterType] = useState<'ALL' | 'Bonus' | 'Penalty' | 'Manual'>('ALL');
  const [histFilterFrom, setHistFilterFrom] = useState('');
  const [histFilterTo, setHistFilterTo] = useState('');
  const [histSearch, setHistSearch] = useState('');

  const courseId = context.courseId;
  const studentId = context.userId;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [bpRes, courseRes] = await Promise.allSettled([
          axios.get(`/api/bp/student/${courseId}/${studentId}`),
          axios.get(`/api/lti/courseName/${courseId}`)
        ]);
        if (bpRes.status === 'fulfilled' && bpRes.value.data.success) {
          const data = bpRes.value.data;
          setRecord(data.record);
          setClassAvg(data.classAvg);
          setTotalStudents(data.totalStudents);
        }
        if (courseRes.status === 'fulfilled' && courseRes.value.data.success) {
          setCourseName(courseRes.value.data.courseName || '');
        }
      } catch (err) {
        console.error('Failed to load BP data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [courseId, studentId]);

  const getBpStatus = (pts: number) => {
    if (pts >= 100) return { label: '🏆 Excellent', color: '#10b981' };
    if (pts >= 50)  return { label: '⭐ Good',      color: '#f59e0b' };
    if (pts >= 0)   return { label: '📈 Developing', color: '#6366f1' };
    return { label: '⚠️ Below Average', color: '#ef4444' };
  };

  const getEvType = (ev: BpHistory) =>
    ev.delta >= 0
      ? (ev.reason.toLowerCase().includes('correction') || ev.reason.toLowerCase().includes('manual') ? 'Manual' : 'Bonus')
      : 'Penalty';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✨</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading your Brownie Points...</p>
        </div>
      </div>
    );
  }

  const points     = record?.points ?? 0;
  const status     = getBpStatus(points);
  const allHistory = record?.history ? [...record.history].reverse() : [];

  const filteredHistory = allHistory.filter(ev => {
    const evType = getEvType(ev);
    if (histFilterType !== 'ALL' && evType !== histFilterType) return false;
    if (histFilterFrom && new Date(ev.awardedAt) < new Date(histFilterFrom)) return false;
    if (histFilterTo   && new Date(ev.awardedAt) > new Date(histFilterTo + 'T23:59:59')) return false;
    if (histSearch && !ev.reason.toLowerCase().includes(histSearch.toLowerCase())) return false;
    return true;
  });

  const typeColor = (t: string) =>
    t === 'Bonus' ? { bg: '#10b98115', fg: '#10b981' }
    : t === 'Penalty' ? { bg: '#ef444415', fg: '#ef4444' }
    : { bg: '#6366f115', fg: '#6366f1' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: 0 }}>


      <div style={{ padding: '28px 24px 40px' }}>

        {/* ── Score Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {/* Your Score */}
          <div style={{ background: 'linear-gradient(135deg, #f59e0b10, #d9770605)', borderRadius: 16, padding: '28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f59e0b25', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>YOUR SCORE</div>
            <div style={{ fontSize: '4.5rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1, letterSpacing: '-0.02em' }}>{Number(points.toFixed(2))}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12 }}>Brownie Points</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700, background: `${status.color}20`, color: status.color }}>{status.label}</span>
          </div>
          {/* Class Average */}
          <div style={{ background: 'linear-gradient(135deg, #6366f110, #4f46e505)', borderRadius: 16, padding: '28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #6366f120', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>CLASS AVERAGE</div>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: '#6366f1', lineHeight: 1 }}>{Number(classAvg.toFixed(2))}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>Brownie Points</div>
            <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, background: points >= classAvg ? '#10b98120' : '#f9731620', color: points >= classAvg ? '#10b981' : '#f97316' }}>
              {points >= classAvg ? '↑ Above Average' : '↓ Below Average'}
            </span>
          </div>
          {/* Class Size */}
          <div style={{ background: 'linear-gradient(135deg, #f59e0b15, #d9770610)', borderRadius: 16, padding: '28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f59e0b30', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>CLASS SIZE</div>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: '#d97706', lineHeight: 1 }}>{totalStudents}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>Students</div>
            <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, background: '#d9780620', color: '#d97706' }}>🏫 Enrolled</span>
          </div>
        </div>

        {/* ── Activity Log — identical to teacher History Log ── */}
        <div className="detail-card history-card" style={{ marginTop: 0 }}>

          {/* Card Header */}
          <div className="card-header border-bottom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <h3 className="card-title">⚡ Activity Log</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{filteredHistory.length} of {allHistory.length} entries</span>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <select value={histFilterType} onChange={e => setHistFilterType(e.target.value as any)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
              <option value="ALL">All Types</option>
              <option value="Bonus">Bonus</option>
              <option value="Penalty">Penalty</option>
              <option value="Manual">Manual</option>
            </select>
            <input type="date" value={histFilterFrom} onChange={e => setHistFilterFrom(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
            <input type="date" value={histFilterTo} onChange={e => setHistFilterTo(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
            <input type="text" value={histSearch} onChange={e => setHistSearch(e.target.value)}
              placeholder="Search reason…"
              style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', minWidth: 160, flex: 1 }} />
            {(histFilterType !== 'ALL' || histFilterFrom || histFilterTo || histSearch) && (
              <button onClick={() => { setHistFilterType('ALL'); setHistFilterFrom(''); setHistFilterTo(''); setHistSearch(''); }}
                style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                ✕ Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="table-container shadow-none border-0" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
            {allHistory.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>No activity yet. Complete activities to earn Brownie Points!</p>
              </div>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Change</th>
                    <th>Reason</th>
                    <th>Awarded By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>No matching entries. Try clearing the filters.</td></tr>
                  ) : (
                    filteredHistory.map((ev, i) => {
                      const evType = getEvType(ev);
                      const { bg, fg } = typeColor(evType);
                      return (
                        <tr key={i}>
                          <td>{new Date(ev.awardedAt).toLocaleDateString()} {new Date(ev.awardedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td>
                            <span className="bp-badge minimal" style={{ background: bg, color: fg, border: '1px solid transparent' }}>
                              {evType}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }} className={ev.delta >= 0 ? 'text-green' : 'text-red'}>
                            {ev.delta > 0 ? '+' : ''}{Number(Number(ev.delta).toFixed(2))}
                          </td>
                          <td>{ev.reason || '—'}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{ev.awardedBy || 'System'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
