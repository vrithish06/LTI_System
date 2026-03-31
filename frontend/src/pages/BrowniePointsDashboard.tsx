import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { LtiContext } from '../App';
import '../index.css';

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
    <div className="bp-dashboard-wrapper">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Dynamic Header */}
      <header className="bp-header">
        <div className="header-content">
          <div className="header-text">
            <h1>Brownie Points Dashboard</h1>
            <p>Course <span>{courseName || 'Loading...'}</span></p>
          </div>
        </div>
      </header>

      <main className="bp-main-container">
        
        {/* Statistics Widgets */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon icon-purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Total Students</span>
              <span className="stat-value text-purple">{records.length}</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon icon-green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20v-4"/><path d="M6 20v-6"/></svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Class Average</span>
              <span className="stat-value text-green">{avgPoints} BP</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon icon-orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Top Earner</span>
              <span className="stat-value text-orange">{topStudent ? `${topStudent.points} BP` : '—'}</span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="search-container">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search students by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Students Data Table */}
        <div className="table-container">
          {loading ? (
            <div className="table-empty-state">
              <div className="spinner"></div>
              <p>Fetching the latest roster...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="table-empty-state">
              <p>{records.length === 0 ? 'No students found in the roster.' : 'No students match your search.'}</p>
            </div>

          ) : (
            <table className="bp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Brownie Points</th>
                  <th>Last Updated</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec) => (
                  <tr key={rec._id} className="table-row">
                    <td>
                      <div className="student-cell">
                        <div className="avatar">
                          {rec.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="student-name">{rec.studentName}</span>
                      </div>
                    </td>
                    <td className="student-email">{rec.studentEmail}</td>
                    <td>
                      <span className={`bp-badge ${rec.points >= 0 ? 'positive' : 'negative'}`}>
                        {rec.points} BP
                      </span>
                    </td>
                    <td className="last-updated">
                      {rec.history.length > 0
                        ? new Date(rec.history[rec.history.length - 1].awardedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="actions-cell">
                      <div className="action-buttons">
                        {rec.history.length > 0 && (
                          <button
                            className="btn-history"
                            onClick={() => { setSelected(rec); setShowHistory(true); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            History
                          </button>
                        )}
                        <button
                          className="btn-edit"
                          onClick={() => { setSelected(rec); setShowHistory(false); setDelta(''); setReason(''); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          Edit BP
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Edit / History Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{showHistory ? 'Points History' : 'Edit Brownie Points'}</h2>
                <p className="modal-subtitle">
                  {selected.studentName}
                  <span className={`bp-badge minimal ${selected.points >= 0 ? 'positive' : 'negative'}`}>
                    {selected.points} BP
                  </span>
                </p>
              </div>
              <button className="btn-close" onClick={() => setSelected(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {showHistory ? (
              <div className="history-list">
                {selected.history.length === 0 ? (
                  <p className="history-empty">No history yet.</p>
                ) : (
                  [...selected.history].reverse().map((h, i) => (
                    <div key={i} className="history-item">
                      <div>
                        <span className={`history-delta ${h.delta >= 0 ? 'text-green' : 'text-red'}`}>
                          {h.delta >= 0 ? '+' : ''}{h.delta} BP
                        </span>
                        <p className="history-reason">{h.reason || 'No reason given'} &bull; by {h.awardedBy}</p>
                      </div>
                      <span className="history-date">
                        {new Date(h.awardedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))
                )}
                <button className="btn-primary w-full mt-4" onClick={() => setShowHistory(false)}>
                  <svg style={{marginRight: '6px'}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  Edit Points
                </button>
              </div>
            ) : (
              <div className="edit-form">
                <div className="form-group">
                  <label>Point Change (use negative to deduct)</label>
                  <div className="quick-deltas">
                    {[-10, -5, +5, +10].map(v => (
                      <button
                        key={v}
                        className={`btn-delta ${delta === String(v) ? 'active' : ''} ${v > 0 ? 'positive' : 'negative'}`}
                        onClick={() => setDelta(String(v))}
                      >
                        {v > 0 ? '+' : ''}{v}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="vibe-input mt-3"
                    placeholder="Or enter custom value..."
                    value={delta}
                    onChange={e => setDelta(e.target.value)}
                  />
                </div>
                
                <div className="form-group mt-4">
                  <label>Reason (optional)</label>
                  <input
                    type="text"
                    className="vibe-input"
                    placeholder="e.g. Great participation today"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setSelected(null)}>Cancel</button>
                  <button
                    className="btn-primary"
                    onClick={handleUpdate}
                    disabled={updating || delta === '' || isNaN(Number(delta))}
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
