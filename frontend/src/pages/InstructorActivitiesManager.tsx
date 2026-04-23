import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import type { ActivityRecord } from './ActivitiesTypes';
import SubmissionsViewer from './SubmissionsViewer';

interface Props {
  context: LtiContext;
  onAddActivity: () => void;
}

interface EditFormData {
  title: string;
  description: string;
  activityType: string;
  deadline: string;
  rewardType: string;
  rewardValue: string;
  mandatory: boolean;
  penaltyType: string;
  penaltyValue: string;
  submissionMode: string;
  hpAssignmentMode: string;
  gracePeriodDuration: string;
  isProofRequired: boolean;
  targetPercent: string; // VIBE_MILESTONE only
}

type SortKey = 'updated_at' | 'created_at' | 'title' | 'deadline';
type SortDir = 'desc' | 'asc';

const toLocalDatetimeString = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const activityToForm = (a: ActivityRecord): EditFormData => ({
  title: a.title,
  description: (a.rules as any)?.description || '',
  activityType: a.type || 'ASSIGNMENT',
  deadline: toLocalDatetimeString(a.deadline),
  rewardType: (a.rules as any)?.reward_type || 'ABSOLUTE',
  rewardValue: String((a.rules as any)?.reward_hp ?? 10),
  mandatory: a.is_mandatory ?? false,
  penaltyType: (a.rules as any)?.late_penalty_hp ? 'ABSOLUTE' : 'PERCENTAGE',
  penaltyValue: String((a.rules as any)?.late_penalty_hp ?? (a.rules as any)?.late_penalty_percent ?? 0),
  submissionMode: (a.rules as any)?.submission_mode || 'IN_PLATFORM',
  hpAssignmentMode: (a.rules as any)?.hp_assignment_mode || 'AUTOMATIC',
  gracePeriodDuration: String(Math.floor(((a.grace_period ?? 0)) / 60)),
  isProofRequired: a.is_proof_required ?? false,
  targetPercent: String((a.rules as any)?.target_percent ?? 50),
});

const fmtDate = (iso?: string) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const fmtRelative = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hrs   = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days < 7)  return `${days}d ago`;
  return fmtDate(iso) ?? '';
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated_at', label: 'Last Edited' },
  { value: 'created_at', label: 'Date Created' },
  { value: 'title',      label: 'Name (A–Z)' },
  { value: 'deadline',   label: 'Deadline' },
];

const TYPE_OPTIONS = ['All', 'ASSIGNMENT', 'VIBE_MILESTONE'];
const MANDATORY_OPTIONS = ['All', 'Required', 'Optional'];

export default function InstructorActivitiesManager({ context, onAddActivity }: Props) {
  const [activities, setActivities]   = useState<ActivityRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<EditFormData | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [backfillingId, setBackfillingId] = useState<string | null>(null);
  const [viewingSubmissionsActivity, setViewingSubmissionsActivity] = useState<ActivityRecord | null>(null);

  // ── Filter / Sort state ──────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [filterType,   setFilterType]   = useState('All');
  const [filterMand,   setFilterMand]   = useState('All');
  const [dateFrom,     setDateFrom]     = useState('');   // ISO date string (date-only)
  const [dateTo,       setDateTo]       = useState('');
  const [dateField,    setDateField]    = useState<'created_at' | 'updated_at'>('updated_at');
  const [sortKey,      setSortKey]      = useState<SortKey>('updated_at');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [filtersOpen,  setFiltersOpen]  = useState(false);

  // ── Data fetch ───────────────────────────────────────────────────────────
  const fetchActivities = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`/api/lti/course/${context.courseId}/activities`);
      setActivities(data.data || data.activities || []);
    } catch {
      setError('Failed to load activities.');
    } finally {
      setLoading(false);
    }
  }, [context.courseId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // ── Derived / filtered list ───────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...activities];

    // Search by title
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q));
    }

    // Type filter
    if (filterType !== 'All') {
      list = list.filter(a => a.type === filterType);
    }

    // Mandatory filter
    if (filterMand === 'Required') list = list.filter(a => a.is_mandatory);
    if (filterMand === 'Optional') list = list.filter(a => !a.is_mandatory);

    // Date range filter (against chosen date field)
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      list = list.filter(a => {
        const ts = a[dateField] ? new Date(a[dateField]!).getTime() : 0;
        return ts >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86399999; // inclusive end-of-day
      list = list.filter(a => {
        const ts = a[dateField] ? new Date(a[dateField]!).getTime() : Infinity;
        return ts <= to;
      });
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortKey === 'deadline') {
        const ta = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const tb = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        cmp = ta - tb;
      } else {
        const ta = a[sortKey] ? new Date(a[sortKey]!).getTime() : 0;
        const tb = b[sortKey] ? new Date(b[sortKey]!).getTime() : 0;
        cmp = ta - tb;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [activities, search, filterType, filterMand, dateFrom, dateTo, dateField, sortKey, sortDir]);

  const activeFilterCount = [
    search.trim() !== '',
    filterType !== 'All',
    filterMand !== 'All',
    dateFrom !== '',
    dateTo !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch(''); setFilterType('All'); setFilterMand('All');
    setDateFrom(''); setDateTo(''); setDateField('updated_at');
    setSortKey('updated_at'); setSortDir('desc');
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────
  const startEdit  = (a: ActivityRecord) => { setEditingId(a.activity_id); setEditForm(activityToForm(a)); };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setEditForm(prev => prev ? {
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    } : prev);
  };

  const handleSave = async (activityId: string) => {
    if (!editForm) return;

    const penaltyVal = Number(editForm.penaltyValue);
    const gracePeriodVal = Number(editForm.gracePeriodDuration);

    // Rule: if penalty is 0, grace period must also be 0
    if (penaltyVal === 0 && gracePeriodVal > 0) {
      alert('A grace period cannot be set when the late penalty is 0.\nEither set a penalty > 0 or set the grace period to 0.');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`/api/lti/activities/${activityId}`, {
        title: editForm.title,
        description: editForm.description,
        activityType: editForm.activityType,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : undefined,
        rewardType: editForm.rewardType,
        rewardValue: Number(editForm.rewardValue),
        mandatory: editForm.mandatory,
        penaltyType: editForm.penaltyType,
        penaltyValue: Number(editForm.penaltyValue),
        submissionMode: editForm.submissionMode,
        hpAssignmentMode: editForm.hpAssignmentMode,
        gracePeriodDuration: Number(editForm.gracePeriodDuration),
        isProofRequired: editForm.isProofRequired,
        targetPercent: editForm.activityType === 'VIBE_MILESTONE' ? Number(editForm.targetPercent) : undefined,
      });
      setEditingId(null); setEditForm(null);
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (activityId: string, title: string) => {
    if (!confirm(`Delete activity "${title}"? This cannot be undone.`)) return;
    setDeletingId(activityId);
    try {
      await axios.delete(`/api/lti/activities/${activityId}`);
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete activity.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleMilestoneCheck = async (courseId: string) => {
    setBackfillingId(courseId);
    try {
      const { data } = await axios.post(`/api/lti/milestone-backfill/${courseId}`, {}, {
        headers: { 'x-lti-secret': 'vibe-lti-shared-secret-change-in-production' },
      });
      if (data.studentsAwarded > 0) {
        alert(`✅ Done! Awarded BP to ${data.studentsAwarded} student(s):\n${data.details.join('\n')}`);
      } else {
        alert(`✅ Checked ${data.studentsChecked} student(s). No new awards needed — all eligible students already received BP.`);
      }
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Milestone check failed.');
    } finally {
      setBackfillingId(null);
    }
  };

  const formatDeadline = (iso?: string) => {
    if (!iso) return 'No deadline';
    const d = new Date(iso);
    const isOverdue = d < new Date();
    return {
      label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      isOverdue,
    };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ia-manager">
      {/* Header */}
      <div className="ia-header">
        <div>
          <h2 className="ia-title">Manage Activities</h2>
          <p className="ia-subtitle">
            {loading
              ? 'Loading…'
              : `${displayed.length} of ${activities.length} activit${activities.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        <button className="ia-add-btn" onClick={onAddActivity}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Activity
        </button>
      </div>

      {/* ── Filter / Sort Toolbar ── */}
      <div className="ia-toolbar">
        {/* Search */}
        <div className="ia-search-wrap">
          <svg className="ia-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="ia-search-input"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="ia-search-clear" onClick={() => setSearch('')} title="Clear">✕</button>
          )}
        </div>

        {/* Sort key + direction */}
        <div className="ia-sort-group">
          <select
            className="ia-select"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            title="Sort by"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            className="ia-sort-dir-btn"
            title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          >
            {sortDir === 'desc'
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            }
          </button>
        </div>

        {/* Advanced filters toggle */}
        <button
          className={`ia-filter-btn ${filtersOpen ? 'ia-filter-btn-active' : ''}`}
          onClick={() => setFiltersOpen(o => !o)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filters
          {activeFilterCount > 0 && <span className="ia-filter-badge">{activeFilterCount}</span>}
        </button>

        {activeFilterCount > 0 && (
          <button className="ia-clear-btn" onClick={clearFilters} title="Clear all filters">
            Clear all
          </button>
        )}
      </div>

      {/* ── Advanced Filter Panel ── */}
      {filtersOpen && (
        <div className="ia-filter-panel">
          <div className="ia-filter-row">
            {/* Activity Type */}
            <div className="ia-filter-field">
              <label className="ia-filter-label">Type</label>
              <select className="ia-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{t === 'All' ? 'All Types' : t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            {/* Mandatory */}
            <div className="ia-filter-field">
              <label className="ia-filter-label">Status</label>
              <select className="ia-select" value={filterMand} onChange={e => setFilterMand(e.target.value)}>
                {MANDATORY_OPTIONS.map(m => (
                  <option key={m} value={m}>{m === 'All' ? 'All Activities' : m}</option>
                ))}
              </select>
            </div>

            {/* Date field to filter on */}
            <div className="ia-filter-field">
              <label className="ia-filter-label">Filter Date By</label>
              <select className="ia-select" value={dateField} onChange={e => setDateField(e.target.value as any)}>
                <option value="updated_at">Last Edited</option>
                <option value="created_at">Date Created</option>
              </select>
            </div>

            {/* Date From */}
            <div className="ia-filter-field">
              <label className="ia-filter-label">From</label>
              <input
                type="date"
                className="ia-select"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>

            {/* Date To */}
            <div className="ia-filter-field">
              <label className="ia-filter-label">To</label>
              <input
                type="date"
                className="ia-select"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="ia-error">{error}</div>}

      {/* Loading */}
      {loading ? (
        <div className="ia-loading"><div className="spinner" style={{ width: 28, height: 28, borderWidth: 2 }} /><span>Loading activities…</span></div>
      ) : displayed.length === 0 ? (
        <div className="ia-empty">
          <div className="ia-empty-icon">{activities.length === 0 ? '📋' : '🔍'}</div>
          <p>
            {activities.length === 0
              ? <>No activities yet. Click <strong>Add Activity</strong> to create one.</>
              : <>No activities match your filters. <button className="ia-link-btn" onClick={clearFilters}>Clear filters</button></>}
          </p>
        </div>
      ) : (
        <div className="ia-list">
          {displayed.map(a => {
            const dl       = formatDeadline(a.deadline);
            const isEditing  = editingId === a.activity_id;
            const isDeleting = deletingId === a.activity_id;
            const lastEdited = a.updated_at || a.created_at;

            return (
              <div key={a.activity_id} className={`ia-card ${isEditing ? 'ia-card-editing' : ''}`}>
                {/* ── View Row ── */}
                {!isEditing && (
                  <div className="ia-row">
                    <div className="ia-row-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="ia-row-content">
                      <span className="ia-row-title">{a.title}</span>
                      <div className="ia-row-meta">
                        {typeof dl === 'string' ? (
                          <span className="ia-meta-tag">{dl}</span>
                        ) : (
                          <span className={`ia-meta-tag ${dl.isOverdue ? 'ia-overdue' : ''}`}>
                            {dl.isOverdue ? '⚠ Deadline passed: ' : 'Deadline: '}{dl.label}
                          </span>
                        )}
                        <span className="ia-meta-tag ia-type">{a.type}</span>
                        <span className={`ia-meta-tag ${a.is_mandatory ? 'ia-req' : 'ia-opt'}`}>{a.is_mandatory ? 'Required' : 'Optional'}</span>
                        <span className="ia-meta-tag">🏆 {(a.rules as any)?.reward_hp ?? 0} BP</span>
                        {a.type === 'VIBE_MILESTONE' && (a.rules as any)?.target_percent !== undefined && (
                          <span className="ia-meta-tag" style={{ background: 'hsl(38,80%,92%)', color: 'hsl(30,60%,30%)' }}>
                            🎯 {(a.rules as any).target_percent}% threshold
                          </span>
                        )}
                        {lastEdited && (
                          <span className="ia-meta-tag ia-timestamp" title={fmtDate(lastEdited) ?? ''}>
                            {a.updated_at && a.updated_at !== a.created_at ? '✏ ' : '🕐 '}
                            {fmtRelative(lastEdited)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ia-row-actions">
                      <button className="ia-btn ia-btn-edit" onClick={() => startEdit(a)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>

                      {a.type !== 'VIBE_MILESTONE' && (
                        <button className="ia-btn btn-secondary" onClick={() => setViewingSubmissionsActivity(a)} title="View Submissions">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                          Submissions
                        </button>
                      )}
                      <button className="ia-btn ia-btn-delete" onClick={() => handleDelete(a.activity_id, a.title)} disabled={isDeleting} title="Delete">
                        {isDeleting ? (
                          <span style={{ fontSize: '0.7rem' }}>Deleting…</span>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                            </svg>
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Edit Form ── */}
                {isEditing && editForm && (
                  <div className="ia-edit-form">
                    <div className="ia-edit-header">
                      <span>✏️ Editing: <strong>{a.title}</strong></span>
                      <button className="ia-cancel-btn" onClick={cancelEdit}>✕ Cancel</button>
                    </div>

                    <div className="ia-form-grid">
                      <div className="ia-form-full">
                        <label>Title</label>
                        <input className="ia-input" name="title" value={editForm.title} onChange={handleEditChange} />
                      </div>
                      <div className="ia-form-full">
                        <label>Description</label>
                        <textarea className="ia-input" name="description" value={editForm.description} onChange={handleEditChange} rows={2} />
                      </div>
                      <div>
                        <label>Activity Type</label>
                        <select className="ia-input" name="activityType" value={editForm.activityType} onChange={handleEditChange}>
                          <option value="ASSIGNMENT">Assignment</option>
                          <option value="VIBE_MILESTONE">Vibe Milestone</option>
                        </select>
                      </div>
                      {editForm.activityType !== 'VIBE_MILESTONE' && (
                        <div>
                          <label>Submission Mode</label>
                          <select className="ia-input" name="submissionMode" value={editForm.submissionMode} onChange={handleEditChange}>
                            <option value="IN_PLATFORM">In Platform</option>
                            <option value="EXTERNAL_LINK">External Link</option>
                            <option value="CSV_IMPORT">CSV Import</option>
                          </select>
                        </div>
                      )}
                      {editForm.activityType !== 'VIBE_MILESTONE' && (
                        <div>
                          <label>Deadline</label>
                          <input className="ia-input" type="datetime-local" name="deadline" value={editForm.deadline} onChange={handleEditChange} />
                        </div>
                      )}
                      {editForm.activityType !== 'VIBE_MILESTONE' && (
                        <div>
                          <label>HP Assignment Mode</label>
                          <select className="ia-input" name="hpAssignmentMode" value={editForm.hpAssignmentMode} onChange={handleEditChange}>
                            <option value="AUTOMATIC">Automatic</option>
                            <option value="MANUAL">Manual</option>
                          </select>
                        </div>
                      )}
                      {/* VIBE_MILESTONE: Target % field */}
                      {editForm.activityType === 'VIBE_MILESTONE' && (
                        <div>
                          <label>Target Completion %</label>
                          <input
                            className="ia-input" type="number" name="targetPercent"
                            value={editForm.targetPercent} onChange={handleEditChange}
                            min={1} max={100} step={1}
                          />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: 3 }}>
                            BP is awarded once when student reaches this threshold.
                          </span>
                        </div>
                      )}
                      <div>
                        <label>Reward Type</label>
                        <select className="ia-input" name="rewardType" value={editForm.rewardType} onChange={handleEditChange}>
                          <option value="ABSOLUTE">Absolute (Fixed BP)</option>
                          <option value="PERCENTAGE">Percentage (%)</option>
                        </select>
                      </div>
                      <div>
                        <label>Reward Value (BP)</label>
                        <input className="ia-input" type="number" name="rewardValue" value={editForm.rewardValue} onChange={handleEditChange} />
                      </div>
                      {editForm.activityType !== 'VIBE_MILESTONE' && (
                        <div>
                          <label>
                            Grace Period (Hours)
                            {Number(editForm.penaltyValue) === 0 && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#ef4444' }}>
                                ⚠ Must be 0 when penalty is 0
                              </span>
                            )}
                          </label>
                          <input
                            className="ia-input" type="number" name="gracePeriodDuration"
                            value={Number(editForm.penaltyValue) === 0 ? '0' : editForm.gracePeriodDuration}
                            onChange={handleEditChange}
                            min={0}
                            disabled={Number(editForm.penaltyValue) === 0}
                            style={Number(editForm.penaltyValue) === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                          />
                          {Number(editForm.penaltyValue) === 0 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: 3 }}>
                              Set a late penalty to enable the grace period.
                            </span>
                          )}
                        </div>
                      )}
                      {editForm.activityType !== 'VIBE_MILESTONE' && (
                        <>
                          <div className="ia-form-checkboxes">
                            <label className="ia-checkbox-row">
                              <input type="checkbox" name="mandatory" checked={editForm.mandatory} onChange={handleEditChange} />
                              <span>Mandatory Activity</span>
                            </label>
                            <label className="ia-checkbox-row">
                              <input type="checkbox" name="isProofRequired" checked={editForm.isProofRequired} onChange={handleEditChange} />
                              <span>Proof Required</span>
                            </label>
                          </div>
                          {editForm.mandatory && (
                            <>
                              <div>
                                <label>Penalty Type</label>
                                <select className="ia-input" name="penaltyType" value={editForm.penaltyType} onChange={handleEditChange}>
                                  <option value="PERCENTAGE">Percentage (%)</option>
                                  <option value="ABSOLUTE">Absolute (Fixed BP)</option>
                                </select>
                              </div>
                              <div>
                                <label>Penalty Value</label>
                                <input className="ia-input" type="number" name="penaltyValue" value={editForm.penaltyValue} onChange={handleEditChange} />
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <div className="ia-edit-actions">
                      <button className="ia-save-btn" onClick={() => handleSave(a.activity_id)} disabled={saving}>
                        {saving ? 'Saving…' : '✓ Save Changes'}
                      </button>
                      <button className="ia-cancel-btn" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewingSubmissionsActivity && (
        <SubmissionsViewer
          context={context}
          activityId={viewingSubmissionsActivity.activity_id}
          activityTitle={viewingSubmissionsActivity.title}
          onClose={() => setViewingSubmissionsActivity(null)}
        />
      )}
    </div>
  );
}
