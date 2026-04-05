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

  const courseId = context.courseId;
  const studentId = context.userId;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Sync roster first (silently), then fetch student data
        const syncRes = await axios.post(`/api/bp/sync/${courseId}`).catch(() => null);
        if (syncRes?.data?.courseName) setCourseName(syncRes.data.courseName);

        const { data } = await axios.get(`/api/bp/student/${courseId}/${studentId}`);
        if (data.success) {
          setRecord(data.record);
          setClassAvg(data.classAvg);
          setTotalStudents(data.totalStudents);
        }
      } catch (err) {
        console.error('Failed to load BP data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [courseId, studentId]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getBpStatus = (pts: number) => {
    if (pts >= 100) return { label: '🏆 Excellent', color: '#10b981' };
    if (pts >= 50) return { label: '⭐ Good', color: '#f59e0b' };
    if (pts >= 0) return { label: '📈 Developing', color: '#6366f1' };
    return { label: '⚠️ Below Average', color: '#ef4444' };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🍪</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading your Brownie Points...</p>
        </div>
      </div>
    );
  }

  const points = record?.points ?? 0;
  const status = getBpStatus(points);
  const history = record?.history ? [...record.history].reverse() : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: 0 }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        padding: '20px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', flexShrink: 0,
        }}>🍪</div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            My Brownie Points
          </h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {courseName || 'Course Dashboard'} &nbsp;·&nbsp; {context.userName}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        {/* Score Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {/* My Score */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 24px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
              YOUR SCORE
            </div>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1 }}>
              {points}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>Brownie Points</div>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              fontSize: '0.78rem', fontWeight: 700,
              background: `${status.color}20`, color: status.color,
            }}>
              {status.label}
            </span>
          </div>

          {/* Class Average */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 24px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
              CLASS AVERAGE
            </div>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: '#6366f1', lineHeight: 1 }}>
              {classAvg}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>Brownie Points</div>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              fontSize: '0.78rem', fontWeight: 700,
              background: points >= classAvg ? '#10b98120' : '#f9731620',
              color: points >= classAvg ? '#10b981' : '#f97316',
            }}>
              {points >= classAvg ? '↑ Above Average' : '↓ Below Average'}
            </span>
          </div>

          {/* Rank hint */}
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b15, #d9770610)',
            borderRadius: 16, padding: '28px 24px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #f59e0b30',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
              CLASS SIZE
            </div>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: '#d97706', lineHeight: 1 }}>
              {totalStudents}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>Students</div>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              fontSize: '0.78rem', fontWeight: 700, background: '#d9780620', color: '#d97706',
            }}>
              🏫 Enrolled
            </span>
          </div>
        </div>

        {/* Activity History */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              ⚡ Activity Log
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Recent events that affected your Brownie Points
            </p>
          </div>

          {history.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>No activity yet. Complete activities to earn Brownie Points!</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Date', 'Change', 'Reason', 'Awarded By'].map(h => (
                      <th key={h} style={{
                        padding: '12px 20px', textAlign: 'left',
                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
                        color: 'var(--text-muted)', textTransform: 'uppercase',
                        borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '14px 20px', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(h.awardedAt)}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700,
                          background: h.delta >= 0 ? '#10b98115' : '#ef444415',
                          color: h.delta >= 0 ? '#10b981' : '#ef4444',
                        }}>
                          {h.delta >= 0 ? '+' : ''}{h.delta} BP
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: 'var(--text-primary)', maxWidth: 300 }}>
                        {h.reason || '—'}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {h.awardedBy || 'System'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
