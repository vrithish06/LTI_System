import { useState, useEffect } from 'react';
import axios from 'axios';
import { LtiContext } from './App';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

interface QuizBuilderProps {
  context: LtiContext;
}

export default function QuizBuilder({ context }: QuizBuilderProps) {
  const [title, setTitle] = useState(context.activityTitle || '');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (context.activityTitle) {
      axios.get(`/api/exam/${encodeURIComponent(context.activityTitle)}`)
        .then(res => {
          if (res.data.success && res.data.exam) {
            setTitle(res.data.exam.title);
            setDescription(res.data.exam.description || '');
            setQuestions(res.data.exam.questions || []);
          }
        })
        .catch(() => {}) // Silently ignore if new
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [context.activityTitle]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: Math.random().toString(36).substr(2, 9),
        text: '',
        options: ['', '', '', ''],
        correctAnswer: 0
      }
    ]);
  };

  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const updateOption = (id: string, index: number, value: string) => {
    setQuestions(questions.map(q => {
      if (q.id === id) {
        const newOptions = [...q.options];
        newOptions[index] = value;
        return { ...q, options: newOptions };
      }
      return q;
    }));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleSave = async () => {
    if (!title) return alert('Please enter an exam title.');
    if (questions.length === 0) return alert('Please add at least one question.');
    
    // Validate questions
    for (const q of questions) {
      if (!q.text) return alert('All questions must have text.');
      if (q.options.some(opt => !opt)) return alert('All multiple-choice options must be filled.');
    }

    setIsSaving(true);
    try {
      // Create quiz on lTI_System backend
      const res = await axios.post('/api/deep-link-create', {
        title,
        text: description,
        questions, // We would save this on backend in real app
        context
      });
      
      if (res.data.success) {
        // Send AJAX post to Vibe with JSON
        try {
          // Vibe expects body.JWT
          // and we can manually postMessage back to window.opener directly from here to be safe!
          const payloadObj = JSON.parse(res.data.JWT);
          const selectedItem = payloadObj['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'][0] || { title: title };
          
          if (window.opener) {
            window.opener.postMessage({
              type: 'LTI_DEEP_LINK_SUCCESS',
              payload: selectedItem
            }, '*');
          }
          
          // Also formally notify Vibe backend (if Vibe tracks it server-side)
          if (context.deepLinkReturnUrl) {
            await axios.post(context.deepLinkReturnUrl, { JWT: res.data.JWT }, {
              headers: { 'Accept': 'application/json' }
            }).catch(() => {}); // Fire and forget fallback
          }

          if (window.opener) {
              window.close();
          } else {
              alert('Exam successfully linked. Please close this window and return to Vibe.');
          }
        } catch (e) {
          alert('Failed to transmit link to Vibe.');
        }
      }
    } catch (err) {
      alert('Failed to save exam and link to Vibe.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="quiz-builder">
      <div className="activity-header">
        <div className="activity-icon">🛠️</div>
        <div className="activity-meta">
          <h2>Create New Exam</h2>
          <p>Design a multiple-choice exam that students will take via LTI.</p>
        </div>
      </div>
      
      <div className="builder-section">
        <div className="input-group">
          <label>Exam Title *</label>
          <input
            type="text"
            placeholder="e.g. Midterm Computer Science Exam"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="vibe-input"
          />
        </div>

        <div className="input-group">
          <label>Description (Optional)</label>
          <textarea
            placeholder="Instructions for students..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="vibe-input"
            rows={3}
          />
        </div>
      </div>

      <div className="questions-list">
        <h3>Questions</h3>
        {questions.length === 0 ? (
          <div className="empty-state">No questions added yet.</div>
        ) : (
          questions.map((q, index) => (
            <div key={q.id} className="question-card">
              <div className="question-header">
                <h4>Question {index + 1}</h4>
                <button onClick={() => removeQuestion(q.id)} className="btn-icon text-red">✖</button>
              </div>
              
              <div className="input-group">
                <label>Question Text *</label>
                <input
                  type="text"
                  placeholder="What is the capital of..."
                  value={q.text}
                  onChange={(e) => updateQuestion(q.id, 'text', e.target.value)}
                  className="vibe-input"
                />
              </div>

              <div className="options-grid">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="option-row">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctAnswer === optIdx}
                      onChange={() => updateQuestion(q.id, 'correctAnswer', optIdx)}
                    />
                    <input
                      type="text"
                      placeholder={`Option ${optIdx + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                      className="vibe-input"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="builder-actions">
        <button onClick={addQuestion} className="btn-secondary">
          ➕ Add Question
        </button>
        <button onClick={handleSave} disabled={isSaving} className="btn-primary">
          {isSaving ? '⏳ Saving Exam...' : '🔗 Save Exam & Link to Vibe'}
        </button>
      </div>
    </div>
  );
}
