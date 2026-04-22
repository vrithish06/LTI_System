import { useEffect, useState } from 'react';
import axios from 'axios';
import QuizPlayer from './QuizPlayer';
import BrowniePointsDashboard from './pages/BrowniePointsDashboard';
import StudentBPDashboard from './pages/StudentBPDashboard';
import ActivityDetail from './pages/ActivityDetail';
import ActivityCreator from './ActivityCreator';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';

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

export default function App() {
  const path = window.location.pathname;
  if (path === '/admin') {
    return <AdminDashboard />;
  }

  const [state, setState] = useState<AppState>('loading');
  const [context, setContext] = useState<LtiContext | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [hpAwarded, setHpAwarded] = useState<number>(0);

  // Detect launch mode from URL params
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode'); // 'bp_dashboard' for teacher BP management

  useEffect(() => {
    const token = params.get('lti_token');

    if (!token) {
      setErrorMsg('No LTI token found in URL. This page must be launched from Vibe.');
      setState('error');
      return;
    }

    // Try loading from session cache to avoid repeating /launch and survive token expiration on reload
    const cacheKey = `lti_context_${token}`;
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr) {
      try {
        setContext(JSON.parse(cachedStr));
        setState('ready');
        return;
      } catch (e) {
        sessionStorage.removeItem(cacheKey);
      }
    }

    axios
      .post('/api/launch', { token })
      .then((res) => {
        sessionStorage.setItem(cacheKey, JSON.stringify(res.data.context));
        setContext(res.data.context);
        setState('ready');
      })
      .catch((err) => {
        setErrorMsg(err?.response?.data?.detail || err?.response?.data?.error || 'Token validation failed.');
        setState('error');
      });
  }, []);

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── Error ──────────────────────────────────────────────────────────────────
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

  // ── Quiz submitted successfully ────────────────────────────────────────────
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

  // ── Unified LTI Dashboard (new single-entry-point mode) ─────────────────────
  if (mode === 'dashboard') {
    return <Dashboard context={context} />;
  }

  // ── Brownie Points Dashboard (Instructor mode) ─────────────────────────────
  if (mode === 'bp_dashboard' && context?.role === 'Instructor') {
    return <BrowniePointsDashboard context={context} />;
  }

  // ── Brownie Points Dashboard (Student mode) ────────────────────────────────
  if (mode === 'bp_student' && context?.role === 'Learner') {
    return <StudentBPDashboard context={context} />;
  }

  // ── Activity Detail (Student submits an activity) ─────────────────────────
  // Launched when a student clicks an activity in Vibe (mode=activity_detail)
  if ((mode === 'activity_detail' || mode === 'activity') && context?.role === 'Learner') {
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
            context={context}
            onSuccess={(hp: number) => {
              setHpAwarded(hp);
              setState('success');
            }}
            onError={(msg: string) => {
              setErrorMsg(msg);
              setState('error');
            }}
          />
        </div>
      </div>
    );
  }

  // ── Deep-linking (Quiz Builder for teacher) ────────────────────────────────
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
            onSuccess={(hp: number) => {
              setHpAwarded(hp);
              setState('success');
            }}
            onError={(msg: string) => {
              setErrorMsg(msg);
              setState('error');
            }}
          />
        </div>
      </div>
    );
  }

  // ── Student Quiz Player ───────────────────────────────────────────────────
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
            onSuccess={(hp) => {
              setHpAwarded(hp);
              setState('success');
            }}
            onError={(msg) => {
              setErrorMsg(msg);
              setState('error');
            }}
          />
        )}
      </div>
    </div>
  );
}
