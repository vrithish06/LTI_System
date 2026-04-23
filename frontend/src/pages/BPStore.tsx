import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import type { ActivityRecord } from './ActivitiesTypes';

interface Props {
  context: LtiContext;
  onOpenActivity?: (activity: ActivityRecord) => void;
}

export default function BPStore({ context, onOpenActivity }: Props) {
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
                onOpen={() => onOpenActivity?.(activity)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LateSubmissionCard({ activity, userBp, onOpen }: { activity: ActivityRecord, userBp: number, onOpen: () => void }) {
  const [cost, setCost] = useState(0);
  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [expired, setExpired] = useState(false);

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
      setTimeLeftStr(`${h}h ${m}m`);
    };

    updateTimer();
    const intv = setInterval(updateTimer, 1000);
    return () => clearInterval(intv);
  }, [activity]);

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
    <li 
      className="activity-list-item al-card-pending cursor-pointer" 
      onClick={onOpen}
      role="listitem"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen()}
    >
      <div className="al-status-stripe al-stripe-amber" />
      <div className="activity-item-icon al-pending-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <div className="activity-item-content" style={{ flex: 1 }}>
        <span className="activity-item-title">{activity.title}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Base Reward: +{baseReward} BP
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: '2px' }}>Hard Deadline</span>
        <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>
          {timeLeftStr}
        </span>
      </div>
      
      <div style={{ paddingRight: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: canAfford ? 'var(--text-primary)' : '#ef4444' }}>
            Cost: {cost} BP
          </div>
          <div style={{ fontSize: '0.75rem', color: netGain > 0 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            Net: {netGain > 0 ? '+' : ''}{netGain} BP
          </div>
        </div>
        
        <button 
          disabled={!canAfford}
          style={{
            background: canAfford ? '#f59e0b' : '#cbd5e1',
            color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px',
            fontWeight: 600, fontSize: '0.85rem', cursor: canAfford ? 'pointer' : 'not-allowed',
          }}
        >
          Unlock
        </button>
      </div>
    </li>
  );
}
