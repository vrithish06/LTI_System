import { useState, useEffect } from 'react';
import axios from 'axios';
import { LtiContext } from '../../App';
import EndorsementGraph from './EndorsementGraph';
import '../../index.css';

type Tab = 'config' | 'audit' | 'disputes' | 'analytics' | 'graph';

interface Props {
  context: LtiContext;
  activeTab?: string;
  onTabChange?: (tab: Tab) => void;
}

export default function DoubtInstructor({ context, activeTab, onTabChange }: Props) {
  const VALID_TABS: Tab[] = ['config', 'audit', 'disputes', 'analytics', 'graph'];
  const resolvedTab = (VALID_TABS.includes(activeTab as Tab) ? activeTab : 'config') as Tab;
  const setTab = (t: Tab) => onTabChange?.(t);
  const [maxBP, setMaxBP] = useState(50);
  const [audit, setAudit] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [edges, setEdges] = useState<any[]>([]);
  const [disputeTab, setDisputeTab] = useState<'open' | 'resolved'>('open');
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [showMoreLeaderboard, setShowMoreLeaderboard] = useState(false);
  const [showMoreTopics, setShowMoreTopics] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState<'all' | 'suspicious'>('all');
  const [disputeSearch, setDisputeSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success'|'error'}|null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const load = async () => {
    const cId = context.courseId;
    const [cfgR, audR, disR, anaR, grR] = await Promise.allSettled([
      axios.get(`/api/doubt/config/${cId}`),
      axios.get(`/api/doubt/audit/${cId}`),
      axios.get(`/api/doubt/disputes/${cId}?tab=${disputeTab}`),
      axios.get(`/api/doubt/analytics/${cId}`),
      axios.get(`/api/doubt/graph/${cId}`),
    ]);
    if (cfgR.status==='fulfilled') { setMaxBP(cfgR.value.data.data?.max_bp_per_doubt||50); }
    if (audR.status==='fulfilled') setAudit(audR.value.data.data||[]);
    if (disR.status==='fulfilled') setDisputes(disR.value.data.data||[]);
    if (anaR.status==='fulfilled') setAnalytics(anaR.value.data.data);
    if (grR.status==='fulfilled') setEdges(grR.value.data.data||[]);
  };
  useEffect(() => { load(); }, [disputeTab]);

  const saveConfig = async () => {
    await axios.put(`/api/doubt/config/${context.courseId}`, { max_bp_per_doubt: maxBP });
    showToast('Config saved!');
  };
  const forceSettle = async (id: string, req: any) => { await axios.post(`/api/doubt/disputes/${id}/settle`, { instructorId: context.userId, instructorName: context.userName }); showToast('Settled!'); load(); };
  const forceRefund  = async (id: string, req: any) => { await axios.post(`/api/doubt/disputes/${id}/refund`,  { instructorId: context.userId, instructorName: context.userName }); showToast('Refunded!'); load(); };


  const tabs: { key: Tab; label: string }[] = [
    { key: 'config', label: '⚙️ Config' },
    { key: 'audit', label: '📜 Audit Log' },
    { key: 'disputes', label: `⚖️ Disputes ${disputes.filter(d=>!d.resolution).length ? `(${disputes.filter(d=>!d.resolution).length})` : ''}` },
    { key: 'analytics', label: '📊 Analytics' },
    { key: 'graph', label: '🕸️ Network' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '1.5rem' }}>
      {toast && <div className={`toast-notification ${toast.type}`}>{toast.msg}</div>}
      <h1 style={{ margin: '0 0 1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>🧠 Doubt Exchange — Instructor</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.25rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', background: resolvedTab===t.key ? '#8b5cf6' : 'transparent', color: resolvedTab===t.key ? '#fff' : 'var(--text-muted)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONFIG ── */}
      {resolvedTab==='config' && (
        <div className="detail-card" style={{ padding: '1.5rem', maxWidth: 480 }}>
          <h3 style={{ margin:'0 0 1rem', fontWeight:700 }}>Course Configuration</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label className="acr-label">Max BP per Doubt Request</label>
              <input className="acr-input" type="number" value={maxBP} onChange={e=>setMaxBP(Number(e.target.value))} min={10} />
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:'4px 0 0' }}>Applies to all future requests. Pending requests unaffected.</p>
            </div>
            <button className="btn-primary" onClick={saveConfig}>Save Configuration</button>
          </div>
        </div>
      )}

      {/* ── AUDIT LOG ── */}
      {resolvedTab==='audit' && (() => {
        const filteredAudit = audit.filter(t => {
          if (auditFilter === 'suspicious' && !t.is_suspicious) return false;
          if (auditSearch) {
            const q = auditSearch.toLowerCase();
            return t.from_student_name?.toLowerCase().includes(q) || 
                   t.to_student_name?.toLowerCase().includes(q) || 
                   t.topic?.toLowerCase().includes(q);
          }
          return true;
        });
        return (
          <div className="detail-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin:0, fontWeight:700 }}>Completed Transactions</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  placeholder="Search names or topics..." 
                  className="acr-input" 
                  style={{ padding: '6px 12px', fontSize: '0.85rem', width: '200px' }}
                  value={auditSearch} 
                  onChange={e => setAuditSearch(e.target.value)} 
                />
                <select 
                  className="acr-input" 
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  value={auditFilter} 
                  onChange={e => setAuditFilter(e.target.value as any)}
                >
                  <option value="all">All</option>
                  <option value="suspicious">Suspicious Only</option>
                </select>
              </div>
            </div>
            {filteredAudit.length===0 && <p style={{ color:'var(--text-muted)', textAlign:'center', padding:'2rem' }}>No matching transactions found.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {filteredAudit.map(t => (
              <div key={t._id} style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', flexWrap:'wrap', gap:'0.5rem' }}>
                  <div>
                    <span style={{ fontWeight:700, fontSize:'0.88rem' }}>{t.from_student_name} → {t.to_student_name}</span>
                    <span style={{ marginLeft:8, fontSize:'0.75rem', color:'var(--text-muted)' }}>{t.topic}</span>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    <span style={{ fontWeight:700, color:'#8b5cf6' }}>🍪 {t.bp_amount} BP</span>
                    <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{new Date(t.resolved_at).toLocaleDateString()}</span>
                    {t.is_suspicious && <span style={{ background:'#ef444420', color:'#ef4444', borderRadius:6, padding:'2px 8px', fontSize:'0.72rem', fontWeight:700 }}>🚩 Suspicious</span>}
                    <button onClick={()=>setExpandedAudit(expandedAudit===t.request_id?null:t.request_id)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px', cursor:'pointer', fontSize:'0.75rem' }}>
                      {expandedAudit===t.request_id ? 'Hide' : 'Proofs'}
                    </button>

                  </div>
                </div>
                {expandedAudit===t.request_id && (
                  <div style={{ background:'var(--bg-secondary)', padding:'12px 16px', borderTop:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                    {(t.proofs||[]).map((p:any) => (
                      <div key={p._id} style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', fontSize:'0.82rem' }}>
                        <p style={{ margin:'0 0 4px', fontWeight:700 }}>Party {p.party} — <span style={{ color: p.claim==='happened'?'#10b981':'#ef4444' }}>{p.claim.replace('_',' ')}</span></p>
                        {p.proof_file_id ? (
                          <a href={`/api/lti/document/${p.proof_file_id}`} target="_blank" rel="noopener noreferrer" style={{ color:'#8b5cf6', fontWeight:600 }}>📎 View Proof: {p.proof_file_name}</a>
                        ) : <span style={{ color:'var(--text-muted)' }}>No file uploaded</span>}
                      </div>
                    ))}
                    {(!t.proofs||t.proofs.length===0) && <p style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>No proofs on record.</p>}
                  </div>
                )}
              </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── DISPUTES ── */}
      {resolvedTab==='disputes' && (() => {
        const filteredDisputes = disputes.filter(d => {
          if (disputeSearch) {
            const q = disputeSearch.toLowerCase();
            return d.request?.student_a_name?.toLowerCase().includes(q) || 
                   d.request?.student_b_name?.toLowerCase().includes(q) || 
                   d.request?.topic?.toLowerCase().includes(q);
          }
          return true;
        });
        return (
          <div>
            <div style={{ display:'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom:'1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                {(['open','resolved'] as const).map(dt => (
                  <button key={dt} onClick={()=>setDisputeTab(dt)} style={{ padding:'6px 16px', borderRadius:20, border:'1px solid var(--border)', cursor:'pointer', fontWeight:600, fontSize:'0.82rem', background:disputeTab===dt?'#8b5cf6':'var(--bg-card)', color:disputeTab===dt?'#fff':'var(--text-secondary)' }}>
                    {dt.charAt(0).toUpperCase()+dt.slice(1)}
                  </button>
                ))}
              </div>
              <input 
                type="text" 
                placeholder="Search students or topics..." 
                className="acr-input" 
                style={{ padding: '6px 12px', fontSize: '0.85rem', width: '220px' }}
                value={disputeSearch} 
                onChange={e => setDisputeSearch(e.target.value)} 
              />
            </div>
            {filteredDisputes.length===0 && <p style={{ textAlign:'center', color:'var(--text-muted)', padding:'2rem' }}>No matching {disputeTab} disputes.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              {filteredDisputes.map(d => (
              <div key={d._id} className="detail-card" style={{ padding:'1.25rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
                  <div>
                    <span style={{ fontWeight:700 }}>{d.request?.student_a_name} ↔ {d.request?.student_b_name}</span>
                    <span style={{ marginLeft:8, background:'rgba(139,92,246,0.1)', color:'#8b5cf6', borderRadius:6, padding:'2px 8px', fontSize:'0.75rem', fontWeight:700 }}>{d.request?.topic}</span>
                    <p style={{ margin:'6px 0 0', fontSize:'0.82rem', color:'var(--text-muted)' }}>Flagged: {new Date(d.flagged_at).toLocaleString()}</p>
                    <p style={{ margin:'4px 0 0', fontSize:'0.82rem' }}>
                      {d.request?.student_a_name} claims: <strong style={{color:d.claim_a==='happened'?'#10b981':'#ef4444'}}>{d.claim_a?.replace('_',' ')}</strong>
                      {' · '}
                      {d.request?.student_b_name} claims: <strong style={{color:d.claim_b==='happened'?'#10b981':'#ef4444'}}>{d.claim_b?.replace('_',' ')}</strong>
                    </p>
                  </div>
                  <span style={{ fontWeight:800, color:'#8b5cf6', fontSize:'1.1rem' }}>🍪 {d.request?.bp_offer} BP</span>
                </div>
                <div style={{ marginTop:'1rem', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                  {(d.proofs||[]).map((p:any) => (
                    <div key={p._id} style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', fontSize:'0.82rem' }}>
                      <p style={{ margin:'0 0 4px', fontWeight:700 }}>
                        {p.party === 'A' ? (d.request?.student_a_name || 'Student A') : (d.request?.student_b_name || 'Student B')} says:{' '}
                        <span style={{ color:p.claim==='happened'?'#10b981':'#ef4444' }}>{p.claim.replace('_',' ')}</span>
                      </p>
                      {p.proof_file_id ? <a href={`/api/lti/document/${p.proof_file_id}`} target="_blank" rel="noopener noreferrer" style={{ color:'#8b5cf6', fontWeight:600 }}>📎 {p.proof_file_name||'View Proof'}</a> : <span style={{ color:'var(--text-muted)' }}>No file</span>}
                    </div>
                  ))}
                </div>
                {!d.resolution && (
                  <div style={{ marginTop:'1rem', display:'flex', gap:'0.75rem' }}>
                    <button className="btn-primary" onClick={()=>forceSettle(d.request_id, d.request)} style={{ flex:1, background:'#10b981' }}>⚡ Force Settle → {d.request?.student_b_name || 'Student B'} gets BP</button>
                    <button className="btn-primary" onClick={()=>forceRefund(d.request_id, d.request)} style={{ flex:1, background:'#ef4444' }}>↩ Force Refund → {d.request?.student_a_name || 'Student A'} refunded</button>
                  </div>
                )}
                {d.resolution && (() => {
                  const req = d.request;
                  const bpWentTo = d.resolution === 'force_settle' ? req?.student_b_name : req?.student_a_name;
                  // Guilty = whoever lied
                  // force_settle means meeting happened, so whoever said not_happened lied
                  // force_refund means meeting didn't happen, so whoever said happened lied
                  let guiltyName = '';
                  if (d.resolution === 'force_settle') {
                    if (d.claim_a === 'not_happened') guiltyName = req?.student_a_name;
                    else if (d.claim_b === 'not_happened') guiltyName = req?.student_b_name;
                  } else if (d.resolution === 'force_refund') {
                    if (d.claim_a === 'happened') guiltyName = req?.student_a_name;
                    else if (d.claim_b === 'happened') guiltyName = req?.student_b_name;
                  }
                  return (
                    <div style={{ marginTop:'1rem', display:'flex', flexDirection:'column', gap:'6px' }}>
                      <p style={{ margin:0, fontWeight:600, color:'#10b981', fontSize:'0.85rem' }}>
                        ✓ Resolved: {d.resolution.replace('_',' ')} &nbsp;·&nbsp; {new Date(d.resolved_at).toLocaleString()}
                      </p>
                      <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
                        <span style={{ background:'#10b98120', color:'#10b981', borderRadius:8, padding:'4px 12px', fontSize:'0.8rem', fontWeight:700 }}>
                          🍪 BP went to: {bpWentTo}
                        </span>
                        {guiltyName && (
                          <span style={{ background:'#ef444420', color:'#ef4444', borderRadius:8, padding:'4px 12px', fontSize:'0.8rem', fontWeight:700 }}>
                            🚩 False claim by: {guiltyName} (−10% BP penalty)
                          </span>
                        )}
                        {!guiltyName && (
                          <span style={{ background:'#6b728020', color:'#6b7280', borderRadius:8, padding:'4px 12px', fontSize:'0.8rem', fontWeight:600 }}>
                            No fraud penalty applied
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── ANALYTICS ── */}
      {resolvedTab==='analytics' && analytics && (() => {
        const displayLeaderboard = showMoreLeaderboard ? analytics.leaderboard : analytics.leaderboard.slice(0, 5);
        const displayTopics = showMoreTopics ? analytics.topics : analytics.topics.slice(0, 5);
        
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
            <div className="detail-card" style={{ padding:'1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin:0, fontWeight:700 }}>🏆 Top Doubt Clearers Leaderboard</h3>
                {analytics.leaderboard.length > 5 && (
                  <button onClick={() => setShowMoreLeaderboard(!showMoreLeaderboard)} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                    {showMoreLeaderboard ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
              {displayLeaderboard.map((s:any, i:number) => (
                <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:'0.88rem' }}>
                  <span style={{ fontWeight:600 }}><span style={{ color:'var(--text-muted)', marginRight:8, minWidth:20, display:'inline-block' }}>#{i+1}</span>{s.name}</span>
                  <div style={{ display:'flex', gap:'1.5rem', color:'var(--text-muted)', fontSize:'0.82rem' }}>
                    <span>Cleared: <strong style={{ color:'#10b981' }}>{s.cleared}</strong></span>
                    <span>Asked: <strong style={{ color:'#8b5cf6' }}>{s.asked}</strong></span>
                    <span>Earned: <strong style={{ color:'#f59e0b' }}>🍪 {s.earned}</strong></span>
                  </div>
                </div>
              ))}
            </div>
            <div className="detail-card" style={{ padding:'1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin:0, fontWeight:700 }}>📚 Most Active Topics</h3>
                {analytics.topics.length > 5 && (
                  <button onClick={() => setShowMoreTopics(!showMoreTopics)} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                    {showMoreTopics ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {displayTopics.map((t:any) => (
                  <div key={t.topic} style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                    <span style={{ minWidth:140, fontSize:'0.85rem', fontWeight:600 }}>{t.topic}</span>
                    <div style={{ flex:1, background:'var(--bg-secondary)', borderRadius:999, height:10, overflow:'hidden' }}>
                      <div style={{ height:'100%', background:'#8b5cf6', borderRadius:999, width:`${Math.min(100,(t.count/(analytics.topics[0]?.count||1))*100)}%`, transition:'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize:'0.82rem', color:'var(--text-muted)', minWidth:30, textAlign:'right' }}>{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── GRAPH ── */}
      {resolvedTab==='graph' && (
        <div className="detail-card" style={{ padding:'1.25rem' }}>
          <h3 style={{ margin:'0 0 1rem', fontWeight:700 }}>Class Endorsement Network</h3>
          <EndorsementGraph edges={edges} />
          <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.75rem' }}>Arrows point from asker → helper. Edge color = topic. Node size = doubts cleared. Zoom & drag supported.</p>
        </div>
      )}
    </div>
  );
}
