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
  
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [activeStudent, setActiveStudent] = useState<BpRecord | null>(null);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Form states for Detail/Bulk
  const [adjustmentType, setAdjustmentType] = useState<'BONUS' | 'PENALTY' | 'MANUAL'>('BONUS');
  const [pointsChange, setPointsChange] = useState('');
  const [reason, setReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const courseId = context.courseId;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/bp/${courseId}`);
      if (data.success) {
        setRecords(data.data);
        if (activeStudent) {
          const updatedStudent = data.data.find((r: BpRecord) => r.studentId === activeStudent.studentId);
          if (updatedStudent) setActiveStudent(updatedStudent);
        }
      }
    } catch (err: any) {
      showToast('Failed to load Brownie Points data.', 'error');
    }
  }, [courseId, activeStudent]);

  const initialSync = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const { data: syncData } = await axios.post(`/api/bp/sync/${courseId}`);
        if (syncData.courseName) setCourseName(syncData.courseName);
      } catch (err) {
        console.warn('Silent Roster sync failed.', err);
      }
      
      const { data } = await axios.get(`/api/bp/${courseId}`);
      if (data.success) {
        setRecords(data.data);
      }
    } catch (err: any) {
      showToast('Failed to load Brownie Points data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    initialSync();
  }, [initialSync]);

  const handleApplyAdjustment = async (targetStudentId: string) => {
    if (!pointsChange || isNaN(Number(pointsChange))) return;
    
    // Calculate actual delta
    let delta = Number(pointsChange);
    if (adjustmentType === 'PENALTY') delta = -delta;
    else if (adjustmentType === 'MANUAL') {
       const currentPoints = records.find(r => r.studentId === targetStudentId)?.points || 0;
       delta = delta - currentPoints;
    }

    try {
      await axios.patch(`/api/bp/${courseId}/${targetStudentId}`, {
        delta,
        reason,
        instructorName: context.userName,
      });
    } catch (err) {
        throw err;
    }
  };

  const handleDetailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent || !pointsChange) return;
    setUpdating(true);
    try {
      await handleApplyAdjustment(activeStudent.studentId);
      showToast(`Updated BP for ${activeStudent.studentName}`);
      setPointsChange('');
      setReason('');
      await fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Update failed.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0 || !pointsChange) return;
    setUpdating(true);
    try {
      await Promise.all(selectedIds.map(id => handleApplyAdjustment(id)));
      showToast(`Bulk updated BP for ${selectedIds.length} students`);
      setSelectedIds([]);
      setIsBulkModalOpen(false);
      setPointsChange('');
      setReason('');
      await fetchData();
    } catch (err: any) {
      showToast('One or more bulk updates failed.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(r => r.studentId));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(s => s !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const filtered = records.filter(r =>
    r.studentName.toLowerCase().includes(search.toLowerCase()) ||
    r.studentEmail.toLowerCase().includes(search.toLowerCase())
  );

  const totalPoints = records.reduce((s, r) => s + r.points, 0);
  const avgPoints = records.length ? Math.round(totalPoints / records.length) : 0;
  const topStudent = records.length ? [...records].sort((a, b) => b.points - a.points)[0] : null;

  if (viewMode === 'detail' && activeStudent) {
    return (
      <div className="bp-dashboard-wrapper bp-detail-view" style={{ padding: '0 24px 40px' }}>
        {toast && <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>}
        
        <div className="detail-header-row">
            <button className="btn-back" onClick={() => { setViewMode('list'); setActiveStudent(null); }}>
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div className="detail-header-info">
               <h1>{activeStudent.studentName}</h1>
               <p>Brownie Points Details</p>
            </div>
        </div>

        <div className="detail-grid">
            <div className="detail-card status-card">
              <div className="card-header border-bottom">
                 <h3 className="card-title">
                   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                   Current Status
                 </h3>
              </div>
              <div className="status-circle-container">
                 <div className="bp-circle">
                    <span>{activeStudent.points}</span>
                 </div>
                 <div className="mt-4">
                    <span className={`bp-badge px-4 py-2 text-md ${activeStudent.points >= 0 ? 'positive' : 'negative'}`}>
                       {activeStudent.points >= 0 ? 'Healthy' : 'At Risk'}
                    </span>
                 </div>
              </div>
              <p className="last-updated-text text-center mt-3">
                 Last updated: {activeStudent.history.length > 0 ? new Date(activeStudent.history[activeStudent.history.length - 1].awardedAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <div className="detail-card form-card">
               <div className="card-header border-bottom">
                 <h3 className="card-title">Manual Adjustment</h3>
                 <p className="card-desc">Grant bonus points or apply penalties manually.</p>
               </div>
               <div style={{ padding: '20px' }}>
                 <form onSubmit={handleDetailSubmit} className="acr-form">
                    <div className="acr-field">
                       <label className="acr-label">Adjustment Type</label>
                       <select className="acr-input" value={adjustmentType} onChange={e => setAdjustmentType(e.target.value as any)}>
                          <option value="BONUS">Bonus (Add BP)</option>
                          <option value="PENALTY">Penalty (Deduct BP)</option>
                          <option value="MANUAL">Manual Correction</option>
                       </select>
                    </div>
                    <div className="acr-field">
                       <label className="acr-label">Points</label>
                       <input type="number" className="acr-input" placeholder="e.g. 5" value={pointsChange} onChange={e => setPointsChange(e.target.value)} min={adjustmentType === 'MANUAL' ? undefined : 0} required />
                    </div>
                    <div className="acr-field acr-full mt-2">
                       <label className="acr-label">Reason</label>
                       <textarea className="acr-input acr-textarea" placeholder="Why is this adjustment being made?" value={reason} onChange={e => setReason(e.target.value)} required rows={2} />
                    </div>
                    <div className="acr-actions acr-full mt-2" style={{ alignItems: 'flex-end'}}>
                       <button type="submit" disabled={updating || !pointsChange} className="btn-primary" style={{ width: 'auto' }}>
                          {updating ? 'Applying...' : 'Apply Adjustment'}
                       </button>
                    </div>
                 </form>
               </div>
            </div>
        </div>

        <div className="detail-card history-card mt-6">
           <div className="card-header border-bottom">
              <h3 className="card-title">History Log</h3>
           </div>
           <div className="table-container shadow-none border-0" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
             <table className="bp-table">
               <thead>
                 <tr>
                   <th>Date</th>
                   <th>Type</th>
                   <th>Change</th>
                   <th>Reason</th>
                   <th>Created By</th>
                 </tr>
               </thead>
               <tbody>
                  {activeStudent.history.length === 0 ? (
                    <tr><td colSpan={5} style={{textAlign:'center', padding: '30px 0'}}>No history events found.</td></tr>
                  ) : (
                    [...activeStudent.history].reverse().map((ev, i) => (
                       <tr key={i}>
                         <td>{new Date(ev.awardedAt).toLocaleDateString()} {new Date(ev.awardedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                         <td>
                           <span className="bp-badge minimal" style={{background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)'}}>
                              {ev.delta >= 0 ? (ev.reason.toLowerCase().includes('correction') || ev.reason.toLowerCase().includes('manual') ? 'Manual' : 'Bonus') : 'Penalty'}
                           </span>
                         </td>
                         <td style={{fontWeight:600}} className={ev.delta >= 0 ? 'text-green' : 'text-red'}>
                            {ev.delta > 0 ? '+' : ''}{ev.delta}
                         </td>
                         <td>{ev.reason || '—'}</td>
                         <td style={{color: 'var(--text-muted)'}}>{ev.awardedBy}</td>
                       </tr>
                    ))
                  )}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-dashboard-wrapper">
      {/* Toast Notification */}
      {toast && <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>}

      <header className="bp-header">
        <div className="header-content">
          <div className="header-text">
            <h1>Brownie Points Overview</h1>
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

        <div className="flex-between flex-wrap gap-3 mb-4">
           {/* Search Bar */}
           <div className="search-container" style={{ margin: 0, flex: 1, minWidth: '250px' }}>
             <span className="search-icon">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
             </span>
             <input type="text" className="search-input" placeholder="Search students by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
           </div>

           {selectedIds.length > 0 && (
             <div className="bulk-actions-bar">
               <span className="bulk-count">{selectedIds.length} student(s) selected</span>
               <button className="btn-primary" onClick={() => { setIsBulkModalOpen(true); setAdjustmentType('BONUS'); setPointsChange(''); setReason(''); }}>
                 Bulk Adjust BP
               </button>
             </div>
           )}
        </div>

        {/* Students Data Table */}
        <div className="table-container">
          {loading ? (
            <div className="table-empty-state">
              <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
              <p>Fetching the latest roster...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="table-empty-state">
              <p>{records.length === 0 ? 'No students found in the roster.' : 'No students match your search.'}</p>
            </div>
          ) : (
            <table className="bp-table interactive-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', paddingRight: 0 }}>
                     <input type="checkbox" className="acr-checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th>Student Name</th>
                  <th>Current BP</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec) => (
                  <tr key={rec._id} className="cursor-pointer" onClick={() => { setActiveStudent(rec); setViewMode('detail'); setAdjustmentType('BONUS'); setPointsChange(''); setReason(''); }}>
                    <td style={{ paddingRight: 0 }} onClick={e => e.stopPropagation()}>
                       <input type="checkbox" className="acr-checkbox" checked={selectedIds.includes(rec.studentId)} onChange={() => toggleSelect(rec.studentId)} />
                    </td>
                    <td>
                      <div className="student-cell">
                        <div className="avatar">
                           {rec.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                           <div className="student-name" style={{ lineHeight: 1.2 }}>{rec.studentName}</div>
                           <div className="student-email">{rec.studentEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{rec.points}</td>
                    <td>
                      <span className={`bp-badge px-3 ${rec.points >= 0 ? 'positive' : 'negative'}`}>
                        {rec.points >= 0 ? 'Healthy' : 'At Risk'}
                      </span>
                    </td>
                    <td className="last-updated">
                      {rec.history.length > 0 ? new Date(rec.history[rec.history.length - 1].awardedAt).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Bulk Edit Modal */}
      {isBulkModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBulkModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Bulk Adjust Points</h2>
                <p className="modal-subtitle">Applying to {selectedIds.length} students</p>
              </div>
              <button className="btn-close" onClick={() => setIsBulkModalOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="edit-form">
               <div className="acr-field mb-4">
                  <label className="acr-label">Adjustment Type</label>
                  <select className="acr-input" value={adjustmentType} onChange={e => setAdjustmentType(e.target.value as any)}>
                     <option value="BONUS">Bonus (Add BP)</option>
                     <option value="PENALTY">Penalty (Deduct BP)</option>
                     <option value="MANUAL">Manual Correction</option>
                  </select>
               </div>
               <div className="acr-field mb-4">
                  <label className="acr-label">Points</label>
                  <input type="number" className="acr-input" placeholder="e.g. 5" value={pointsChange} onChange={e => setPointsChange(e.target.value)} min={adjustmentType === 'MANUAL' ? undefined : 0} required />
               </div>
               <div className="acr-field mb-4">
                  <label className="acr-label">Reason</label>
                  <input type="text" className="acr-input" placeholder="Why is this bulk adjustment being made?" value={reason} onChange={e => setReason(e.target.value)} required />
               </div>
               <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setIsBulkModalOpen(false)}>Cancel</button>
                  <button className="btn-primary" onClick={handleBulkSubmit} disabled={updating || !pointsChange}>
                     {updating ? 'Saving...' : 'Apply to All'}
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
