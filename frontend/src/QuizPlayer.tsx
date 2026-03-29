import { useState, useEffect } from 'react';
import axios from 'axios';
import { LtiContext } from './App';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

interface Exam {
  title: string;
  description: string;
  questions: Question[];
}

interface QuizPlayerProps {
  context: LtiContext;
  onSuccess: (hp: number) => void;
  onError: (msg: string) => void;
}

export default function QuizPlayer({ context, onSuccess, onError }: QuizPlayerProps) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Attempt to load the exam based on the activity title passed by Vibe
    axios.get(`/api/exam/${encodeURIComponent(context.activityTitle)}`)
      .then(res => {
        if (res.data.success && res.data.exam) {
          setExam(res.data.exam);
        }
      })
      .catch(() => {
         // Silently ignore, component will just render "No specific questions"
      })
      .finally(() => {
        setLoading(false);
      });
  }, [context.activityTitle]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    setAnswers({ ...answers, [questionId]: optionIndex });
  };

  const handleSubmit = async () => {
    if (!exam) return;
    
    // Calculate Score
    let correctCount = 0;
    exam.questions.forEach(q => {
      if (answers[q.id] === q.correctAnswer) {
        correctCount += 1;
      }
    });

    const scoreGiven = correctCount;
    const scoreMax = exam.questions.length;

    setIsSubmitting(true);
    try {
      await axios.post('/api/submit', {
        context,
        scoreGiven,
        scoreMaximum: scoreMax,
        comment: `Automated grading from lTI_System QuizPlayer`,
      });

      const hpEstimate = Math.round((scoreGiven / scoreMax) * 100);
      onSuccess(hpEstimate);
    } catch (err: any) {
      onError(err?.response?.data?.error || 'Score submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  // Fallback to simple mocking UI if NO exam is configured in the DB
  if (!exam || exam.questions.length === 0) {
    return (
      <div className="activity-card">
        <div className="activity-header">
          <div className="activity-icon">⚠️</div>
          <div className="activity-meta">
            <h2>{context.activityTitle}</h2>
            <p>No questions were configured for this exam by the instructor in the LTI tool database.</p>
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === exam.questions.length;

  return (
    <div className="quiz-builder">
      <div className="activity-header">
        <div className="activity-icon">📝</div>
        <div className="activity-meta">
          <h2>{exam.title}</h2>
          <p>{exam.description || 'Answer all questions to submit your score.'}</p>
        </div>
      </div>

      <div className="questions-list">
        {exam.questions.map((q, index) => (
          <div key={q.id} className="question-card">
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '1rem', fontSize: '1.1rem' }}>
              {index + 1}. {q.text}
            </h4>
            <div className="options-grid">
              {q.options.map((opt, optIdx) => (
                <label 
                  key={optIdx} 
                  className={`btn-secondary ${answers[q.id] === optIdx ? 'selected' : ''}`}
                  style={{ 
                    display: 'flex', gap: '1rem', textAlign: 'left', 
                    padding: '1rem', cursor: 'pointer',
                    background: answers[q.id] === optIdx ? 'rgba(99, 102, 241, 0.2)' : undefined,
                    borderColor: answers[q.id] === optIdx ? '#6366f1' : undefined
                  }}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === optIdx}
                    onChange={() => handleSelectOption(q.id, optIdx)}
                    style={{ accentColor: '#6366f1', transform: 'scale(1.2)' }}
                  />
                  <span style={{ color: 'var(--text-primary)' }}>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="builder-actions" style={{ flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <p style={{ color: '#94a3b8' }}>
          {answeredCount} of {exam.questions.length} questions answered
        </p>
        <button 
          onClick={handleSubmit} 
          disabled={!isComplete || isSubmitting}
          className="btn-primary"
          style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }}
        >
          {isSubmitting ? '⏳ Submitting Quiz to Vibe...' : '✅ Submit Exam to LMS'}
        </button>
      </div>
    </div>
  );
}
