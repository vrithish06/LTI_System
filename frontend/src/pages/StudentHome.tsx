import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';

interface Props {
  context: LtiContext;
  onNavigate: (section: string) => void;
  userBp: number | null;
}

// ── Tour steps ────────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    target: 'home-feature-bp',
    title: '🍪 My Brownie Points',
    body: 'This is your personal BP wallet. Every activity you complete earns you Brownie Points. Keep an eye on your rank among classmates!',
    section: 'bp',
  },
  {
    target: 'home-feature-activities',
    title: '📋 Activities',
    body: 'Your instructor assigns tasks here. Submit before the deadline to earn BP. Late? Check the BP Store!',
    section: 'activities',
  },
  {
    target: 'home-feature-store',
    title: '🛍️ BP Store',
    body: 'Missed a deadline? Spend your earned BP here to unlock a grace period for late submissions.',
    section: 'bp_store',
  },
  {
    target: 'home-feature-incentives',
    title: '⭐ BP Incentives',
    body: 'Your instructor publishes special rewards and motivational bonuses here. Check back often!',
    section: 'incentives',
  },
  {
    target: 'home-feature-doubt',
    title: '💬 Peer Connect',
    body: 'Stuck on something? Post a doubt, help your classmates, and earn bonus BP for being helpful.',
    section: 'doubt',
  },
];

// ── Feature card data ─────────────────────────────────────────────────────────
const FEATURES = [
  {
    id: 'home-feature-bp',
    section: 'bp',
    emoji: '🍪',
    title: 'My BP',
    subtitle: 'Brownie Points',
    description: 'Track your Brownie Points earned across all activities. See how you rank among your classmates.',
    gradient: 'linear-gradient(135deg, #f59e0b22, #d9770612)',
    border: '1px solid #f59e0b30',
    accent: '#d97706',
    tag: 'Progress Tracker',
  },
  {
    id: 'home-feature-activities',
    section: 'activities',
    emoji: '📋',
    title: 'Activities',
    subtitle: 'Assignments & Tasks',
    description: 'View and submit assignments set by your instructor. Earn BP for every on-time submission.',
    gradient: 'linear-gradient(135deg, #6366f122, #4f46e512)',
    border: '1px solid #6366f130',
    accent: '#4f46e5',
    tag: 'Core Module',
  },
  {
    id: 'home-feature-store',
    section: 'bp_store',
    emoji: '🛍️',
    title: 'BP Store',
    subtitle: 'Late Submission Rescue',
    description: 'Spend your Brownie Points to unlock a grace period for activities you missed.',
    gradient: 'linear-gradient(135deg, #10b98122, #05966912)',
    border: '1px solid #10b98130',
    accent: '#059669',
    tag: 'Spend BP',
  },
  {
    id: 'home-feature-incentives',
    section: 'incentives',
    emoji: '⭐',
    title: 'BP Incentives',
    subtitle: 'Instructor Rewards',
    description: 'See motivational rewards and bonus opportunities your instructor has published for this course.',
    gradient: 'linear-gradient(135deg, #8b5cf622, #7c3aed12)',
    border: '1px solid #8b5cf630',
    accent: '#7c3aed',
    tag: 'Rewards',
  },
  {
    id: 'home-feature-doubt',
    section: 'doubt',
    emoji: '💬',
    title: 'Peer Connect',
    subtitle: 'Ask · Help · Earn',
    description: 'Post doubts, answer classmates, and earn extra BP for being an active, helpful community member.',
    gradient: 'linear-gradient(135deg, #ec489922, #db277712)',
    border: '1px solid #ec489930',
    accent: '#db2777',
    tag: 'Community',
  },
];

// ── Tour Overlay ──────────────────────────────────────────────────────────────
function TourOverlay({
  step,
  total,
  onNext,
  onSkip,
  onNavigate,
}: {
  step: (typeof TOUR_STEPS)[0];
  stepIndex: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  onNavigate: (s: string) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const el = document.getElementById(step.target);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [step.target]);

  return (
    <>
      {/* Dark overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Highlight ring */}
      {pos && (
        <div
          style={{
            position: 'absolute',
            top: pos.top - 8,
            left: pos.left - 8,
            width: pos.width + 16,
            height: 'auto',
            borderRadius: 20,
            boxShadow: '0 0 0 4px #f59e0b, 0 0 0 8px rgba(245,158,11,0.3)',
            zIndex: 1001,
            pointerEvents: 'none',
            minHeight: 180,
          }}
        />
      )}
      {/* Tooltip card */}
      <div
        style={{
          position: 'fixed',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1002,
          background: '#fff',
          borderRadius: 20,
          padding: '24px 28px',
          minWidth: 340,
          maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          border: '1.5px solid #f59e0b40',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a1a1a' }}>{step.title}</div>
          <div style={{
            fontSize: '0.72rem', background: '#f59e0b15', color: '#d97706',
            border: '1px solid #f59e0b30', borderRadius: 20, padding: '3px 10px', fontWeight: 700,
          }}>
            {total} features
          </div>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.7, marginBottom: 20 }}>{step.body}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => { onNavigate(step.section); onSkip(); }}
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', border: 'none', borderRadius: 12, padding: '9px 20px',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flex: 1,
            }}
          >
            Go There →
          </button>
          <button
            onClick={onNext}
            style={{
              background: '#f5f5f5', color: '#333', border: '1px solid #ddd',
              borderRadius: 12, padding: '9px 20px', fontWeight: 600,
              fontSize: '0.85rem', cursor: 'pointer', flex: 1,
            }}
          >
            Next
          </button>
          <button
            onClick={onSkip}
            style={{
              background: 'none', color: '#aaa', border: 'none',
              fontSize: '0.8rem', cursor: 'pointer', padding: '4px 8px',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StudentHome({ context, onNavigate, userBp }: Props) {
  const [stats, setStats] = useState({ totalActivities: 0, completed: 0, pending: 0, missed: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showFirstTimeGuide, setShowFirstTimeGuide] = useState(false);

  // Check if first visit
  useEffect(() => {
    const key = `vibe_home_seen_${context.userId}`;
    if (!localStorage.getItem(key)) {
      setShowFirstTimeGuide(true);
    }
  }, [context.userId]);

  const dismissFirstTime = () => {
    const key = `vibe_home_seen_${context.userId}`;
    localStorage.setItem(key, 'true');
    setShowFirstTimeGuide(false);
  };

  const startTour = () => {
    dismissFirstTime();
    setTourStep(0);
    setTourActive(true);
  };

  const nextTourStep = () => {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep(s => s + 1);
    } else {
      setTourActive(false);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const [actRes, subRes] = await Promise.allSettled([
        axios.get(`/api/lti/course/${context.courseId}/activities?userId=${context.userId}`),
        axios.get(`/api/lti/submissions/${context.userId}/${context.courseId}`),
      ]);

      const activities: any[] = actRes.status === 'fulfilled'
        ? (actRes.value.data.data || actRes.value.data.activities || [])
        : [];
      const submissions: any[] = subRes.status === 'fulfilled'
        ? (subRes.value.data.data || subRes.value.data.submissions || [])
        : [];

      const now = Date.now();
      const submittedIds = new Set(submissions.map((s: any) => s.activity_id));
      const completed = activities.filter(a => submittedIds.has(a.activity_id)).length;
      const missed = activities.filter(a => {
        if (submittedIds.has(a.activity_id)) return false;
        if (!a.deadline) return false;
        const hardDl = new Date(a.deadline).getTime() + (a.grace_period || 0) * 60000;
        return now > hardDl;
      }).length;
      const pending = activities.filter(a => {
        if (submittedIds.has(a.activity_id)) return false;
        if (!a.deadline) return true;
        return now <= new Date(a.deadline).getTime();
      }).length;

      setStats({ totalActivities: activities.length, completed, pending, missed });
    } catch (err) {
      console.error('Failed to load home stats', err);
    } finally {
      setLoadingStats(false);
    }
  }, [context.courseId, context.userId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const firstName = context.userName?.split(' ')[0] || 'Student';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px' }}>

      {/* ── First-Time Welcome Banner ── */}
      {showFirstTimeGuide && (
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: 20, padding: '24px 28px', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 8px 30px rgba(245,158,11,0.3)',
            flexWrap: 'wrap', gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              👋 Welcome to ViBe — your course engagement platform!
            </div>
            <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
              Earn Brownie Points by completing activities, help your peers, and unlock rewards.<br />
              Take a quick tour to see how everything works.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={startTour}
              style={{
                background: '#fff', color: '#d97706', border: 'none',
                borderRadius: 12, padding: '10px 22px', fontWeight: 800,
                fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              🗺️ Take Tour
            </button>
            <button
              onClick={dismissFirstTime}
              style={{
                background: 'rgba(255,255,255,0.2)', color: '#fff',
                border: '1.5px solid rgba(255,255,255,0.4)',
                borderRadius: 12, padding: '10px 18px', fontWeight: 600,
                fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Hero Greeting ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #fff8ed, #fff3d6)',
          border: '1.5px solid #f59e0b25',
          borderRadius: 20, padding: '28px 32px', marginBottom: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 20,
          boxShadow: '0 4px 20px rgba(245,158,11,0.08)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d97706', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
            {greeting}
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1a1a1a', margin: '0 0 6px', lineHeight: 1.2 }}>
            {firstName} 👋
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.92rem' }}>
            Here's a snapshot of your progress in <strong style={{ color: '#1a1a1a' }}>{context.courseName || 'your course'}</strong>
          </p>
        </div>

        {/* Live Stats Row */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Your BP', value: userBp !== null ? Number(userBp.toFixed(1)) : '—', color: '#d97706', bg: '#f59e0b15' },
            { label: 'Pending', value: loadingStats ? '…' : stats.pending, color: '#4f46e5', bg: '#6366f115' },
            { label: 'Done', value: loadingStats ? '…' : stats.completed, color: '#059669', bg: '#10b98115' },
            { label: 'Missed', value: loadingStats ? '…' : stats.missed, color: '#dc2626', bg: '#ef444415' },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                background: stat.bg, border: `1.5px solid ${stat.color}25`,
                borderRadius: 14, padding: '12px 18px', textAlign: 'center', minWidth: 72,
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1a1a1a', margin: 0 }}>Explore Features</h2>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '3px 0 0' }}>Click any card to jump straight there</p>
        </div>
        <button
          onClick={startTour}
          style={{
            background: 'linear-gradient(135deg, #f59e0b15, #d9770608)',
            color: '#d97706', border: '1.5px solid #f59e0b30',
            borderRadius: 12, padding: '8px 16px', fontWeight: 700,
            fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
          </svg>
          Replay Tour
        </button>
      </div>

      {/* ── Feature Cards Grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 18,
        }}
      >
        {FEATURES.map(f => (
          <div
            id={f.id}
            key={f.id}
            onClick={() => onNavigate(f.section)}
            onMouseEnter={() => setHoveredCard(f.id)}
            onMouseLeave={() => setHoveredCard(null)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onNavigate(f.section)}
            style={{
              background: hoveredCard === f.id ? f.gradient.replace('22', '33').replace('12', '1a') : f.gradient,
              border: f.border,
              borderRadius: 20,
              padding: '24px 22px',
              cursor: 'pointer',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              transform: hoveredCard === f.id ? 'translateY(-4px)' : 'translateY(0)',
              boxShadow: hoveredCard === f.id
                ? `0 12px 32px ${f.accent}20`
                : '0 2px 10px rgba(0,0,0,0.04)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Background emoji watermark */}
            <div style={{
              position: 'absolute', right: 16, top: 12,
              fontSize: '3.5rem', opacity: 0.08, userSelect: 'none', pointerEvents: 'none',
            }}>
              {f.emoji}
            </div>

            {/* Tag pill */}
            <div style={{
              display: 'inline-block', fontSize: '0.68rem', fontWeight: 700,
              background: `${f.accent}18`, color: f.accent,
              border: `1px solid ${f.accent}25`, borderRadius: 20,
              padding: '3px 10px', marginBottom: 14, letterSpacing: '0.05em',
            }}>
              {f.tag}
            </div>

            <div style={{ fontSize: '2rem', marginBottom: 10 }}>{f.emoji}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1a1a1a', marginBottom: 3 }}>{f.title}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: f.accent, marginBottom: 10 }}>{f.subtitle}</div>
            <p style={{ fontSize: '0.84rem', color: '#555', lineHeight: 1.65, margin: 0 }}>{f.description}</p>

            {/* Arrow indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, marginTop: 18,
              fontSize: '0.78rem', fontWeight: 700, color: f.accent,
              opacity: hoveredCard === f.id ? 1 : 0.5,
              transition: 'opacity 0.18s ease',
            }}>
              Open
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={f.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* ── How it works strip ── */}
      <div
        style={{
          marginTop: 36, borderRadius: 20,
          background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
          padding: '28px 32px', color: '#fff',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 20, opacity: 0.9 }}>
          💡 How CodeXP Works
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { n: '1', text: 'Complete activities on time to earn Brownie Points' },
            { n: '2', text: 'Use BP in the Store to rescue late submissions' },
            { n: '3', text: 'Help peers in Peer Connect to earn bonus BP' },
            { n: '4', text: 'Watch for instructor incentives & climb the leaderboard' },
          ].map(step => (
            <div
              key={step.n}
              style={{
                flex: '1 1 180px', display: 'flex', gap: 12, alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(245,158,11,0.25)', color: '#fbbf24',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '0.8rem',
              }}>
                {step.n}
              </div>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tour Overlay ── */}
      {tourActive && (
        <TourOverlay
          step={TOUR_STEPS[tourStep]}
          stepIndex={tourStep}
          total={TOUR_STEPS.length}
          onNext={nextTourStep}
          onSkip={() => setTourActive(false)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
