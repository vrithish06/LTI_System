import { useEffect, useState } from 'react';
import axios from 'axios';
import QuizBuilder from './QuizBuilder';
import QuizPlayer from './QuizPlayer';
import BrowniePointsDashboard from './pages/BrowniePointsDashboard';

export interface LtiContext {
  userId: string;
  userEmail: string;
  userName: string;
  courseId: string;
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

    axios
      .post('/api/launch', { token })
      .then((res) => {
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

  // ── Brownie Points Dashboard (Instructor mode) ─────────────────────────────
  if (mode === 'bp_dashboard' && context?.role === 'Instructor') {
    return <BrowniePointsDashboard context={context} />;
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
          <QuizBuilder context={context} />
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
