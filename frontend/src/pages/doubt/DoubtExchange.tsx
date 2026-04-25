import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LtiContext } from '../../App';
import EndorsementGraph from './EndorsementGraph';
import '../../index.css';

interface Student { studentId: string; studentName: string; studentEmail: string; points: number; }
interface DoubtRequest {
  _id: string; course_id: string; student_a_id: string; student_a_name: string;
  student_b_id: string; student_b_name: string; topic: string; description: string;
  bp_offer: number; status: string; created_at: string; auto_resolve_at?: string;
  proofs?: { party: string; claim: string; proof_file_id?: string; proof_file_name?: string }[];
}
interface Notification { _id: string; type: string; message: string; request_id?: string; is_read: boolean; created_at: string; }
interface Edge { from_student_id: string; from_student_name: string; to_student_id: string; to_student_name: string; topic: string; bp_exchanged: number; created_at: string; }

type Tab = 'send' | 'sessions' | 'graph';

export default function DoubtExchange({ context }: { context: LtiContext }) {
  const [tab, setTab] = useState<Tab>('send');
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [topic, setTopic] = useState('');
  const [desc, setDesc] = useState('');
  const [bpOffer, setBpOffer] = useState(10);
  const [maxBP, setMaxBP] = useState(50);
  const [myBP, setMyBP] = useState(0);
  const [requests, setRequests] = useState<DoubtRequest[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [graphMode, setGraphMode] = useState<'personal' | 'full'>('personal');
  const [proofModal, setProofModal] = useState<{ requestId: string; party: 'A' | 'B' } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [claim, setClaim] = useState<'happened' | 'not_happened' | null>(null);
  const openProofModal = (requestId: string, party: 'A' | 'B', claim: 'happened' | 'not_happened') => {
    setProofModal({ requestId, party });
    setClaim(claim);
    setProofFile(null);
    setConfirmStep(false);
  };
  const [submittingProof, setSubmittingProof] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false); // two-step confirm

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    const cId = context.courseId;
    const uId = context.userId;
    const [studRes, reqRes, graphRes, notifRes, cfgRes, bpRes] = await Promise.allSettled([
      axios.get(`/api/doubt/students/${cId}?userId=${uId}`),
      axios.get(`/api/doubt/requests/${cId}/${uId}`),
      axios.get(`/api/doubt/graph/${cId}`),
      axios.get(`/api/doubt/notifications/${uId}/${cId}`),
      axios.get(`/api/doubt/config/${cId}`),
      axios.get(`/api/bp/${cId}`),
    ]);
    if (studRes.status === 'fulfilled') setStudents(studRes.value.data.data || []);
    if (reqRes.status === 'fulfilled') setRequests(reqRes.value.data.data || []);
    if (graphRes.status === 'fulfilled') setEdges(graphRes.value.data.data || []);
    if (notifRes.status === 'fulfilled') setNotifs(notifRes.value.data.data || []);
    if (cfgRes.status === 'fulfilled') setMaxBP(cfgRes.value.data.data?.max_bp_per_doubt || 50);
    if (bpRes.status === 'fulfilled') {
      const me = (bpRes.value.data.data || []).find((s: any) => s.studentId === uId);
      if (me) setMyBP(me.points);
    }
  };

  useEffect(() => { load(); }, []);

  const sendRequest = async () => {
    if (!selected || !topic.trim() || !desc.trim()) return showToast('Fill all fields.', 'error');
    if (bpOffer < 10) return showToast('Minimum is 10 BP.', 'error');
    if (bpOffer > maxBP) return showToast(`Max is ${maxBP} BP.`, 'error');
    if (bpOffer > myBP) return showToast('Insufficient BP balance.', 'error');
    setSubmitting(true);
    try {
      await axios.post('/api/doubt/requests', {
        courseId: context.courseId, studentAId: context.userId, studentAName: context.userName,
        studentBId: selected.studentId, studentBName: selected.studentName,
        topic, description: desc, bpOffer,
      });
      showToast('Request sent! BP is held until the session is confirmed.');
      setSelected(null); setTopic(''); setDesc(''); setBpOffer(10);
      await load();
    } catch (e: any) { showToast(e.response?.data?.error || 'Failed.', 'error'); }
    setSubmitting(false);
  };

  const handleAccept = async (id: string) => {
    await axios.patch(`/api/doubt/requests/${id}/accept`);
    showToast('Request accepted!'); load();
  };
  const handleReject = async (id: string) => {
    await axios.patch(`/api/doubt/requests/${id}/reject`);
    showToast('Request rejected. BP refunded.'); load();
  };

  const submitProof = async () => {
    if (!proofModal || !claim) return;
    if (claim === 'happened' && !proofFile) return showToast('Upload proof first.', 'error');
    setSubmittingProof(true);
    try {
      const fd = new FormData();
      fd.append('submittedById', context.userId);
      fd.append('party', proofModal.party);
      fd.append('claim', claim);
      if (claim === 'happened' && proofFile) fd.append('proof', proofFile);
      await axios.post(`/api/doubt/requests/${proofModal.requestId}/proof`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast('Claim submitted!');
      setProofModal(null); setProofFile(null); setClaim(null); setConfirmStep(false);
      load();
    } catch (e: any) { showToast(e.response?.data?.error || 'Failed.', 'error'); }
    setSubmittingProof(false);
  };

  const markAllRead = async () => {
    await axios.patch(`/api/doubt/notifications/${context.userId}/${context.courseId}/read`);
    setNotifs(n => n.map(x => ({ ...x, is_read: true })));
  };

  const unread = notifs.filter(n => !n.is_read).length;
  const filtered = students.filter(s =>
    s.studentName.toLowerCase().includes(search.toLowerCase()) ||
    s.studentEmail?.toLowerCase().includes(search.toLowerCase())
  );
  const incoming = requests.filter(r => r.student_b_id === context.userId && r.status === 'pending');
  const active = requests.filter(r => ['active', 'proof_pending'].includes(r.status));
  const myParty = (r: DoubtRequest) => r.student_a_id === context.userId ? 'A' : 'B';
  const myProof = (r: DoubtRequest) => r.proofs?.find(p => p.party === myParty(r));
  const fullEdges = graphMode === 'full' ? edges : edges.filter(e => e.from_student_id === context.userId || e.to_student_id === context.userId);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '1.5rem' }}>
      {toast && <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>}


      {/* Incoming requests badge */}
      {incoming.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600, color: '#92400e' }}>
          ⏳ You have {incoming.length} pending doubt request{incoming.length > 1 ? 's' : ''} waiting for your response.
          <button onClick={() => setTab('sessions')} style={{ marginLeft: 12, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>View</button>
        </div>
      )}

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.25rem' }}>
        {(['send', 'sessions', 'graph'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', background: tab === t ? '#8b5cf6' : 'transparent', color: tab === t ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
            {t === 'send' ? '📤 Send Request' : t === 'sessions' ? `📋 My Sessions ${requests.length ? `(${requests.length})` : ''}` : '🕸️ Network Graph'}
          </button>
        ))}
      </div>

      {/* ── SEND REQUEST ── */}
      {tab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="detail-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Find a Student</h3>
            <input className="search-input" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} />
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {filtered.map(s => (
                <div key={s.studentId} onClick={() => setSelected(s)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: selected?.studentId === s.studentId ? 'rgba(139,92,246,0.12)' : 'transparent', border: selected?.studentId === s.studentId ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent', marginBottom: 4, transition: 'all 0.15s' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.studentName}</div>
                    {s.studentEmail && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 1 }}>{s.studentEmail}</div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#8b5cf6', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>🍪 {s.points.toFixed(1)}</span>
                </div>
              ))}
              {filtered.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>No students found.</p>}
            </div>
          </div>
          <div className="detail-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Request Details</h3>
            {selected && <div style={{ marginBottom: '0.75rem', padding: '8px 12px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', color: '#8b5cf6' }}>Requesting help from: {selected.studentName}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label className="acr-label">Topic (type freely)</label>
                <input className="acr-input" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Integration by Parts, Recursion…" />
              </div>
              <div>
                <label className="acr-label">Describe your doubt</label>
                <textarea className="acr-input acr-textarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Explain what you need help with…" rows={3} />
              </div>
              <div>
                <label className="acr-label">BP Offer (min 10, max {maxBP}) — Your balance: {myBP.toFixed(1)} BP</label>
                <input className="acr-input" type="number" value={bpOffer || ''} min={10} max={maxBP}
                  onChange={e => {
                    const raw = e.target.value.replace(/^0+/, '') || '0';
                    setBpOffer(parseInt(raw, 10) || 0);
                  }} />
                {bpOffer > myBP && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '4px 0 0' }}>⚠ Insufficient balance</p>}
              </div>
              <button className="btn-primary" onClick={sendRequest} disabled={submitting || !selected || !topic.trim()} style={{ marginTop: '0.5rem' }}>
                {submitting ? 'Sending…' : `🚀 Send Request`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MY SESSIONS ── */}
      {tab === 'sessions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {requests.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No sessions yet.</p>}
          {requests.map(r => {
            const isA = r.student_a_id === context.userId;
            const party = isA ? 'A' : 'B';
            const iHaveSubmitted = !!r.proofs?.find(p => p.party === party);
            return (
              <div key={r._id} className="detail-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <span style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700, marginRight: 8 }}>{r.topic}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                    <p style={{ margin: '6px 0 2px', fontWeight: 600, fontSize: '0.9rem' }}>
                      {isA ? `Asking ${r.student_b_name}` : `${r.student_a_name} is asking you`}
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>{r.description}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, color: '#8b5cf6' }}>🍪 {r.bp_offer} BP</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: r.status === 'resolved' ? '#10b98120' : r.status === 'disputed' ? '#ef444420' : r.status === 'active' ? '#3b82f620' : '#f59e0b20', color: r.status === 'resolved' ? '#10b981' : r.status === 'disputed' ? '#ef4444' : r.status === 'active' ? '#3b82f6' : '#f59e0b' }}>
                      {r.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* B's accept/reject for pending */}
                {!isA && r.status === 'pending' && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                    <button className="btn-primary" onClick={() => handleAccept(r._id)} style={{ flex: 1 }}>✓ Accept</button>
                    <button className="btn-secondary" onClick={() => handleReject(r._id)} style={{ flex: 1 }}>✕ Reject</button>
                  </div>
                )}

                {/* Resolution phase for active/proof_pending */}
                {['active', 'proof_pending'].includes(r.status) && !iHaveSubmitted && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                    <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.88rem' }}>📋 Submit your claim for this session:</p>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button onClick={() => openProofModal(r._id, party, 'happened')}
                        className="btn-primary" style={{ flex: 1, fontSize: '0.85rem' }}>
                        ✅ Meeting Happened
                      </button>
                      <button onClick={() => openProofModal(r._id, party, 'not_happened')}
                        style={{ flex: 1, fontSize: '0.85rem', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        ❌ Meeting Did Not Happen
                      </button>
                    </div>
                  </div>
                )}
                {['active', 'proof_pending'].includes(r.status) && iHaveSubmitted && (
                  <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>✓ Your claim submitted. Waiting for the other party…</p>
                )}
                {r.auto_resolve_at && ['active', 'proof_pending'].includes(r.status) && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    ⏱ Auto-resolves: {new Date(r.auto_resolve_at).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── NETWORK GRAPH ── */}
      {tab === 'graph' && (
        <div className="detail-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Class Endorsement Network</h3>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['personal', 'full'] as const).map(m => (
              <button key={m} onClick={() => setGraphMode(m)}
                style={{ padding: '6px 16px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: graphMode === m ? '#8b5cf6' : 'var(--bg-card)', color: graphMode === m ? '#fff' : 'var(--text-secondary)' }}>
                {m === 'personal' ? '👤 My Connections' : '🌐 Full Class Graph'}
              </button>
            ))}
          </div>
          <EndorsementGraph edges={fullEdges} currentUserId={context.userId}
            onNodeClick={(id, name) => { setSelected({ studentId: id, studentName: name, points: 0 }); setTab('send'); }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            Arrows point from asker → helper. Edge color = topic. Node size = doubts cleared. Zoom &amp; drag supported. Yellow = you.
          </p>
        </div>
      )}

      {/* ── PROOF MODAL ── */}
      {proofModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 1rem', fontWeight: 800 }}>
              {claim === 'happened' ? '✅ Claim: Meeting Happened' : '❌ Claim: Meeting Did Not Happen'}
            </h3>

            {/* Step 1: proof upload (for happened) + initial confirm */}
            {!confirmStep && (
              <>
                {claim === 'happened' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label className="acr-label">Upload Proof (required) <span style={{ color: '#ef4444' }}>*</span></label>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 8px' }}>Screenshot, chat log, link screenshot, code commit — max 5 MB</p>
                    <input type="file" accept="image/*,.pdf,.txt" className="acr-input" onChange={e => setProofFile(e.target.files?.[0] || null)} />
                    {proofFile && <p style={{ fontSize: '0.78rem', color: '#10b981', margin: '4px 0 0' }}>✓ {proofFile.name}</p>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn-secondary" onClick={() => { setProofModal(null); setClaim(null); setProofFile(null); setConfirmStep(false); }} style={{ flex: 1 }}>Cancel</button>
                  <button className="btn-primary"
                    onClick={() => setConfirmStep(true)}
                    disabled={claim === 'happened' && !proofFile}
                    style={{ flex: 1, opacity: claim === 'happened' && !proofFile ? 0.5 : 1 }}>
                    {claim === 'happened' ? '✓ Confirm & Submit' : '✓ Confirm Not Happened'}
                  </button>
                </div>
              </>
            )}

            {/* Step 2: warning + final confirm */}
            {confirmStep && (
              <>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 16px', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>
                  ⚠️ Warning: If found guilty of submitting false proof, <strong>10% of your BP will be deducted</strong> by the instructor.
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Are you sure you want to submit this claim? This action cannot be undone.</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn-secondary" onClick={() => setConfirmStep(false)} style={{ flex: 1 }}>← Go Back</button>
                  <button className="btn-primary" onClick={submitProof} disabled={submittingProof}
                    style={{ flex: 1, background: claim === 'happened' ? '#10b981' : '#ef4444' }}>
                    {submittingProof ? 'Submitting…' : '✓ Yes, Final Submit'}
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
