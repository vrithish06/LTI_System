import { useEffect, useState } from 'react';
import axios from 'axios';
import QuizPlayer from './QuizPlayer';
import BrowniePointsDashboard from './pages/BrowniePointsDashboard';
import StudentBPDashboard from './pages/StudentBPDashboard';
import ActivityDetail from './pages/ActivityDetail';
import ActivityCreator from './ActivityCreator';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import DoubtExchange from './pages/doubt/DoubtExchange';
import DoubtInstructor from './pages/doubt/DoubtInstructor';

export interface LtiContext {
  userId: string;
  userEmail: string;
  userName: string;
  courseId: string;
  courseName?: string;
  courseVersionId: string;
  activityId: string;
  activityTitle: string;
  role: string;
  toolId: string;
  agsScoreUrl: string;
  isDeepLinking?: boolean;
  deepLinkReturnUrl?: string;
}

type AppState = 'loading' | 'ready' | 'success' | 'error';

// ─── Session helpers ──────────────────────────────────────────────────────────
const SESSION_KEY = 'lti_session_id';

function saveSession(id: string) {
  sessionStorage.setItem(SESSION_KEY, id);
}

function loadSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Derive a human-readable clean URL from the current LTI mode.
 * The token and all other query params are stripped.
 * Tabs are preserved as a simple param so users can bookmark sections.
 */
function buildCleanUrl(mode: string | null, role: string, tab?: string): string {
  let path = '/dashboard';

  if (mode === 'bp_dashboard') path = '/instructor/bp';
  else if (mode === 'bp_student') path = '/student/bp';
  else if (mode === 'activity_detail' || mode === 'activity') path = '/activity';
  else if (mode === 'doubt') path = '/doubt';
  else if (mode === 'doubt_instructor') path = '/doubt/instructor';
  else if (mode === 'dashboard' || window.location.pathname.startsWith('/lti')) path = '/dashboard';

  const q = tab ? `?tab=${tab}` : '';
  return path + q;
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const path = window.location.pathname;
  if (path === '/admin') return <AdminDashboard />;

  const [state, setState] = useState<AppState>('loading');
  const [context, setContext] = useState<LtiContext | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [hpAwarded, setHpAwarded] = useState<number>(0);

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const tab  = params.get('tab') || undefined;

  useEffect(() => {
    const ltiToken  = params.get('lti_token');
    const sessionId = ltiToken ? null : loadSession(); // prefer fresh token over stored session

    // ── Path 1: Fresh LTI launch — exchange token for session ────────────────
    if (ltiToken) {
      axios.post('/api/launch', { token: ltiToken })
        .then(res => {
          const { context: ctx, sessionId: sid } = res.data;

          // Persist session id so page refreshes don't need the long token
          if (sid) saveSession(sid);

          setContext(ctx);
          setState('ready');

          // ✅ Replace the ugly long URL with a clean, readable one
          const cleanUrl = buildCleanUrl(mode, ctx.role, tab);
          window.history.replaceState({ sessionId: sid }, '', cleanUrl);
        })
        .catch(err => {
          clearSession();
          setErrorMsg(err?.response?.data?.detail || err?.response?.data?.error || 'Token validation failed.');
          setState('error');
        });
      return;
    }

    // ── Path 2: Page refresh — restore context from server session ───────────
    if (sessionId) {
      axios.get(`/api/session/${sessionId}`)
        .then(res => {
          setContext(res.data.context);
          setState('ready');
        })
        .catch(() => {
          // Session expired — ask user to re-launch from Vibe
          clearSession();
          setErrorMsg('Your session has expired. Please re-launch from Vibe to continue.');
          setState('error');
        });
      return;
    }

    // ── Path 3: No token, no session ─────────────────────────────────────────
    setErrorMsg('No LTI session found. This page must be launched from Vibe.');
    setState('error');
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="app-wrapper">
        <div className="loading-state">
          <div className="spinner" />
          <p>Validating your session with Vibe LMS...</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="app-wrapper">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h2>Launch Failed</h2>
          <p>{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ── Quiz submitted successfully ──────────────────────────────────────────────
  if (state === 'success') {
    return (
      <div className="app-wrapper">
        <div className="success-state">
          <div className="success-icon">🎉</div>
          <h2>Activity Completed!</h2>
          <p>Your score has been sent to Vibe LMS and your Brownie Points have been updated.</p>
          <div className="hp-awarded-badge">🍪 +{hpAwarded} BP Awarded</div>
        </div>
      </div>
    );
  }

  // ─── Route by clean path (after URL was replaced) or by original mode ───────
  const cleanPath = window.location.pathname;

  // Doubt Exchange pages (use resolved context from session)
  if (cleanPath === '/doubt') return <DoubtExchange context={context!} />;
  if (cleanPath === '/doubt/instructor' && context?.role === 'Instructor') return <DoubtInstructor context={context!} />;

  // Unified dashboard — all /lti/* paths, /dashboard, or dashboard mode
  if (
    cleanPath === '/dashboard' ||
    cleanPath.startsWith('/lti') ||
    mode === 'dashboard'
  ) {
    return <Dashboard context={context!} />;
  }

  // Instructor BP dashboard
  if (cleanPath === '/instructor/bp' || (mode === 'bp_dashboard' && context?.role === 'Instructor')) {
    return <BrowniePointsDashboard context={context!} />;
  }

  // Student BP dashboard
  if (cleanPath === '/student/bp' || (mode === 'bp_student' && context?.role === 'Learner')) {
    return <StudentBPDashboard context={context!} />;
  }

  // Activity detail (student)
  if (
    cleanPath === '/activity' ||
    ((mode === 'activity_detail' || mode === 'activity') && context?.role === 'Learner')
  ) {
    return (
      <div className="app-wrapper">
        <div className="tool-page">
          <div className="tool-header">
            <div className="header-left">
              <div className="lti-badge">LTI Tool</div>
              <h1 style={{ color: 'var(--text-primary)' }}>{context?.activityTitle || 'Activity'}</h1>
            </div>
          </div>
          <ActivityDetail
            context={context!}
            onSuccess={(hp: number) => { setHpAwarded(hp); setState('success'); }}
            onError={(msg: string) => { setErrorMsg(msg); setState('error'); }}
          />
        </div>
      </div>
    );
  }

  // Deep-linking (instructor creates activity)
  if (context?.isDeepLinking) {
    return (
      <div className="app-wrapper">
        <div className="tool-page">
          <div className="tool-header">
            <div className="header-left">
              <div className="lti-badge">LTI Tool</div>
              <h1 style={{ color: 'var(--text-primary)' }}>Create Activity</h1>
            </div>
          </div>
          <ActivityCreator
            context={context}
            onSuccess={(hp: number) => { setHpAwarded(hp); setState('success'); }}
            onError={(msg: string) => { setErrorMsg(msg); setState('error'); }}
          />
        </div>
      </div>
    );
  }

  // Fallback — student quiz player
  return (
    <div className="app-wrapper">
      <div className="tool-page">
        <div className="tool-header">
          <div className="header-left">
            <div className="lti-badge">LTI Tool</div>
            <h1 style={{ color: 'var(--text-primary)' }}>{context?.activityTitle || 'Activity'}</h1>
          </div>
        </div>
        {context && (
          <QuizPlayer
            context={context}
            onSuccess={hp => { setHpAwarded(hp); setState('success'); }}
            onError={msg => { setErrorMsg(msg); setState('error'); }}
          />
        )}
      </div>
    </div>
  );
}
