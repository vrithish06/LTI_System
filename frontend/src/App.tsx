import { useEffect, useState } from 'react';
import axios from 'axios';
import QuizBuilder from './QuizBuilder';
import QuizPlayer from './QuizPlayer';

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

type AppState = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [context, setContext] = useState<LtiContext | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [score, setScore] = useState<number>(10);
  const [hpAwarded, setHpAwarded] = useState<number>(0);
  const SCORE_MAX = 10;

  // 1. On mount: read the JWT token from the URL and validate it with our backend
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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

  // 2. Submit score back to Vibe
  const handleSubmit = async () => {
    if (!context) return;
    setState('submitting');

    try {
      const res = await axios.post('/api/submit', {
        context,
        scoreGiven: score,
        scoreMaximum: SCORE_MAX,
        comment: `Completed via lTI_System external tool`,
      });

      const hp = Math.round((score / SCORE_MAX) * 100);
      setHpAwarded(hp);
      setState('success');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Submission failed.');
      setState('error');
    }
  };

  const estimatedHP = Math.round((score / SCORE_MAX) * 100);
  const initials = context?.userName?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'ST';

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

  if (state === 'success') {
    return (
      <div className="app-wrapper">
        <div className="success-state">
          <div className="success-icon">🎉</div>
          <h2>Activity Completed!</h2>
          <p>Your score has been sent to Vibe LMS and your Health Points have been updated.</p>
          <div className="hp-awarded-badge">
            ⚡ +{hpAwarded} HP Awarded
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="tool-page">

        {/* Header */}
        <div className="tool-header">
          <div className="header-left">
            <div className="lti-badge">LTI Tool</div>
            <h1 style={{ color: 'var(--text-primary)' }}>External Activity</h1>
          </div>
        </div>




        {/* Deep Linking Teacher View */}
        {context?.isDeepLinking && (
          <QuizBuilder context={context} />
        )}

        {/* Activity / Score Input (Quiz Player) */}
        {context && !context.isDeepLinking && (
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
