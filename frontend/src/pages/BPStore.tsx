import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import type { ActivityRecord } from './ActivitiesTypes';

interface Props {
  context: LtiContext;
}

export default function BPStore({ context }: Props) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [userBp, setUserBp] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [actRes, bpRes] = await Promise.allSettled([
          axios.get(`/api/lti/course/${context.courseId}/activities?userId=${context.userId}`),
          axios.get(`/api/bp/student/${context.courseId}/${context.userId}`)
        ]);

        if (actRes.status === 'fulfilled') {
          setActivities(actRes.value.data.data || actRes.value.data.activities || []);
        }
        if (bpRes.status === 'fulfilled' && bpRes.value.data.success) {
          setUserBp(bpRes.value.data.record?.points ?? 0);
        }
      } catch (err) {
        console.error('Failed to load store data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [context.courseId, context.userId]);

  // Determine late activities and live costs
  const lateActivities = useMemo(() => {
    return activities.filter(a => {
      if (a.is_submitted || !a.deadline) return false;
      const now = new Date().getTime();
      const dl = new Date(a.deadline).getTime();
      const gracePeriodMs = (a.grace_period || 0) * 60000;
      return now > dl && now <= (dl + gracePeriodMs);
    });
  }, [activities]);

  const removeActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.activity_id !== id));
  };

  const updateBalance = (newBal: number) => {
    setUserBp(newBal);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <div className="al-header" style={{ marginBottom: '24px' }}>
        <div className="al-header-left">
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 2px 8px rgba(245,158,11,0.3)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>BP Store</h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Spend your BP to unlock late submissions before the hard deadline closes.</p>
          </div>
        </div>
        <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b30', color: '#d97706', padding: '8px 16px', borderRadius: 20, fontWeight: 'bold', fontSize: '0.9rem' }}>
          Your Balance: {Number(userBp.toFixed(2))} BP
        </div>
      </div>

      {loading ? (
        <div className="activities-loading">Loading store...</div>
      ) : lateActivities.length === 0 ? (
        <div className="al-tab-empty">
          <div className="al-tab-empty-icon">🛍️</div>
          <h3 style={{ margin: '16px 0 8px', color: 'var(--text-primary)', fontSize: '1.2rem' }}>All Caught Up!</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No late submissions available right now.</p>
        </div>
      ) : (
        <div>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            📬 Available to Unlock <span className="al-tab-count al-tab-count-active">{lateActivities.length}</span>
          </h2>
          <ul className="activity-items-list">
            {lateActivities.map(activity => (
              <LateSubmissionCard 
                key={activity.activity_id} 
                activity={activity} 
                userBp={userBp}
                context={context}
                onDone={(newBal) => {
                  updateBalance(newBal);
                  removeActivity(activity.activity_id);
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LateSubmissionCard({ activity, userBp, context, onDone }: { activity: ActivityRecord, userBp: number, context: LtiContext, onDone: (newBal: number) => void }) {
  const [cost, setCost] = useState(0);
  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [expired, setExpired] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Submission state
  const [submitState, setSubmitState] = useState<'idle'|'submitting'|'error'>('idle');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      if (!activity.deadline) return;
      const now = new Date().getTime();
      const dl = new Date(activity.deadline).getTime();
      const gracePeriodMs = (activity.grace_period || 0) * 60000;
      const hardDl = dl + gracePeriodMs;

      if (now > hardDl) {
        setExpired(true);
        return;
      }

      // Calculate cost
      const penaltyRate = activity.rules?.late_penalty_hp || 0;
      if (gracePeriodMs > 0 && penaltyRate > 0) {
        const timePastNormal = now - dl;
        const currentCost = Math.round((timePastNormal / gracePeriodMs) * penaltyRate * 100) / 100;
        setCost(currentCost);
      }

      // Calculate time left
      const diff = hardDl - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeftStr(`${h}h ${m}m ${s}s`);
    };

    updateTimer();
    const intv = setInterval(updateTimer, 1000);
    return () => clearInterval(intv);
  }, [activity]);

  const handleSubmit = async () => {
    setSubmitState('submitting');
    setErrorMsg('');
    try {
      let reqData: any;
      let headers: any = {};

      if (activity.is_proof_required) {
        if (!proofFile) {
          setErrorMsg('Proof file is required.');
          setSubmitState('error');
          return;
        }
        const formData = new FormData();
        formData.append('user_id', context.userId);
        formData.append('course_id', context.courseId);
        formData.append('proof', proofFile);
        reqData = formData;
        headers['Content-Type'] = 'multipart/form-data';
      } else {
        reqData = { user_id: context.userId, course_id: context.courseId };
      }

      await axios.post(`/api/lti/activities/${activity.activity_id}/submit`, reqData, { headers });

      // Refresh HP balance
      try {
        const hpRes = await axios.get(`/api/bp/student/${context.courseId}/${context.userId}`);
        const bal = hpRes.data.record?.points ?? 0;
        onDone(bal);
      } catch (_) { 
        onDone(userBp - cost + (activity.rules?.reward_hp || 0));
      }

    } catch (err: any) {
      setSubmitState('error');
      setErrorMsg(err?.response?.data?.error || 'Submission failed.');
    }
  };

  if (expired) {
    return (
      <li className="activity-list-item al-card-pending" style={{ opacity: 0.5, pointerEvents: 'none' }}>
         <div className="al-status-stripe" style={{ background: '#cbd5e1' }} />
         <div className="activity-item-content" style={{ padding: '12px 16px' }}>
           <span className="activity-item-title" style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{activity.title}</span>
           <span className="activity-item-deadline overdue">Hard deadline passed.</span>
         </div>
      </li>
    );
  }

  const canAfford = userBp >= cost;
  const baseReward = activity.rules?.reward_hp || 0;
  const netGain = Math.round((baseReward - cost) * 100) / 100;

  return (
    <>
      <li className="al-done-card" style={{ cursor: 'default', overflow: 'hidden' }}>
        {/* Card Header (mimics pending card) */}
        <div className="al-done-row" style={{ cursor: 'default' }}>
          <div className="al-status-stripe al-stripe-amber" />
          <div className="activity-item-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
               <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
             </svg>
          </div>
          <div className="activity-item-content">
            <span className="activity-item-title">{activity.title}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span className="activity-item-deadline" style={{ color: '#ef4444', fontWeight: 600 }}>
                Hard deadline in: {timeLeftStr}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                · Base: +{baseReward} BP
              </span>
            </div>
          </div>
          
          <div style={{ paddingRight: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: canAfford ? 'var(--text-primary)' : '#ef4444' }}>
                Cost: {cost} BP
              </div>
              <div style={{ fontSize: '0.75rem', color: netGain > 0 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                Net: {netGain > 0 ? '+' : ''}{netGain} BP
              </div>
            </div>
            
            {!isUnlocked && (
              <button 
                onClick={() => setShowConfirm(true)}
                disabled={!canAfford}
                style={{
                  background: canAfford ? '#f59e0b' : '#cbd5e1',
                  color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px',
                  fontWeight: 600, fontSize: '0.85rem', cursor: canAfford ? 'pointer' : 'not-allowed',
                }}
              >
                Unlock
              </button>
            )}
          </div>
        </div>

        {/* Expanded Submission Area */}
        {isUnlocked && (
          <div className="al-submission-detail" style={{ background: '#fafafa', borderTop: '1px solid #f1f5f9' }}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: '0.95rem' }}>Submit Activity</h4>
            
            {activity.is_proof_required && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Upload Proof (PDF, JPG, PNG) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.85rem', background: '#fff' }}
                />
              </div>
            )}

            {!activity.is_proof_required && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  I confirm I have completed this activity.
                </label>
              </div>
            )}

            {errorMsg && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '12px' }}>{errorMsg}</div>}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={handleSubmit}
                disabled={submitState === 'submitting' || (activity.is_proof_required ? !proofFile : !confirmed)}
                style={{
                  background: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px',
                  fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', flex: 1,
                  opacity: (submitState === 'submitting' || (activity.is_proof_required ? !proofFile : !confirmed)) ? 0.6 : 1
                }}
              >
                {submitState === 'submitting' ? 'Submitting...' : `Submit & Pay ${cost} BP`}
              </button>
            </div>
          </div>
        )}
      </li>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 16, maxWidth: 400, width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Unlock Submission</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24, fontSize: '0.9rem' }}>
              You are about to unlock the submission panel for <strong>{activity.title}</strong>.<br/><br/>
              This will <strong style={{ color: '#ef4444' }}>cost {cost} BP</strong> immediately upon submission.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowConfirm(false)}
                style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setShowConfirm(false);
                  setIsUnlocked(true);
                }}
                style={{ padding: '8px 16px', background: '#f59e0b', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
