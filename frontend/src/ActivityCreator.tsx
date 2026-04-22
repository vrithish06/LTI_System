import { useState } from 'react';
import axios from 'axios';
import { LtiContext } from './App';

interface ActivityCreatorProps {
  context: LtiContext;
  onSuccess: (hp: number) => void;
  onError: (msg: string) => void;
}

export default function ActivityCreator({ context, onSuccess, onError }: ActivityCreatorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    activityType: 'ASSIGNMENT',
    deadline: '',
    rewardType: 'ABSOLUTE',
    rewardValue: '10',
    mandatory: true,
    penaltyType: 'ABSOLUTE',
    penaltyValue: '0',
    submissionMode: 'IN_PLATFORM',
    status: 'PUBLISHED',
    isProofRequired: true,
    hpAssignmentMode: 'AUTOMATIC',
    gracePeriodDuration: '0',
    graceRewardPercentage: '100',
    // VIBE_MILESTONE specific
    targetPercent: '50',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isMilestone = formData.activityType === 'VIBE_MILESTONE';
    if (!formData.title) {
      alert('Please fill in the activity title.');
      return;
    }
    if (!isMilestone && !formData.deadline) {
      alert('Please fill in the deadline.');
      return;
    }
    if (isMilestone && (Number(formData.targetPercent) <= 0 || Number(formData.targetPercent) > 100)) {
      alert('Target Completion % must be between 1 and 100.');
      return;
    }
    setIsLoading(true);
    try {
      const requestBody = {
        ...formData,
        courseId: context.courseId,
        courseVersionId: context.courseVersionId,
        isMandatory: formData.mandatory,
        rewardValue: Number(formData.rewardValue),
        gracePeriodDuration: Number(formData.gracePeriodDuration),
        graceRewardPercentage: Number(formData.graceRewardPercentage),
        deadline: isMilestone ? null : new Date(formData.deadline).toISOString(),
        penaltyType: formData.mandatory ? formData.penaltyType : null,
        penaltyValue: formData.mandatory ? Number(formData.penaltyValue) : null,
        targetPercent: isMilestone ? Number(formData.targetPercent) : undefined,
        context,
      };

      const response = await axios.post('/api/activities', requestBody);

      if (response.data.success) {
        if (context.isDeepLinking && context.deepLinkReturnUrl && response.data.JWT) {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = context.deepLinkReturnUrl;
          const jwtInput = document.createElement('input');
          jwtInput.type = 'hidden';
          jwtInput.name = 'JWT';
          jwtInput.value = response.data.JWT;
          form.appendChild(jwtInput);
          document.body.appendChild(form);
          form.submit();
          return;
        }
        onSuccess(requestBody.rewardValue);
        if (context.isDeepLinking) window.close();
      }
    } catch (error: any) {
      console.error('Activity creation error:', error);
      const msg = error.response?.data?.error || error.response?.data?.message || 'Failed to create activity';
      alert(`Error: ${msg}`);
      onError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="activity-creator-form">
      {/* Header */}
      <div className="acr-header">
        <div className="acr-header-icon">✨</div>
        <div>
          <h2 className="acr-title">
            {context.isDeepLinking ? 'Configure New Activity' : 'Create Activity'}
          </h2>
          <p className="acr-subtitle">Set up the details, rewards and deadlines for this activity.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="acr-form">
        {/* ── Full: Title ── */}
        <div className="acr-field acr-full">
          <label className="acr-label">Title <span className="acr-req">*</span></label>
          <input
            type="text" name="title" value={formData.title} onChange={handleChange}
            placeholder="e.g. Weekly Quiz 1" className="acr-input" required
          />
        </div>

        {/* ── Full: Description ── */}
        <div className="acr-field acr-full">
          <label className="acr-label">Description</label>
          <textarea
            name="description" value={formData.description} onChange={handleChange}
            placeholder="Describe the activity..." className="acr-input acr-textarea" rows={3}
          />
        </div>

        {/* ── Row: Activity Type + Submission Mode ── */}
        <div className="acr-field">
          <label className="acr-label">Activity Type</label>
          <select name="activityType" value={formData.activityType} onChange={handleChange} className="acr-input">
            <option value="ASSIGNMENT">Assignment</option>
            <option value="VIBE_MILESTONE">VIBE Milestone</option>
          </select>
        </div>

        <div className="acr-field">
          <label className="acr-label">Submission Mode</label>
          <select name="submissionMode" value={formData.submissionMode} onChange={handleChange} className="acr-input">
            <option value="IN_PLATFORM">In Platform</option>
            <option value="EXTERNAL_LINK">External Link</option>
            <option value="CSV_IMPORT">CSV Import</option>
          </select>
        </div>

        {/* ── Row: Deadline + HP Assignment Mode ── */}
        {formData.activityType !== 'VIBE_MILESTONE' && (
          <div className="acr-field">
            <label className="acr-label">Deadline <span className="acr-req">*</span></label>
            <input
              type="datetime-local" name="deadline" value={formData.deadline}
              onChange={handleChange} className="acr-input"
            />
          </div>
        )}

        {formData.activityType !== 'VIBE_MILESTONE' && (
          <div className="acr-field">
            <label className="acr-label">HP Assignment Mode</label>
            <select name="hpAssignmentMode" value={formData.hpAssignmentMode} onChange={handleChange} className="acr-input">
              <option value="AUTOMATIC">Automatic</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
        )}

        {/* ── VIBE Milestone specific fields ── */}
        {formData.activityType === 'VIBE_MILESTONE' && (
          <>
            <div className="acr-field acr-full" style={{ background: 'hsl(38,90%,97%)', border: '1px solid hsl(38,70%,82%)', borderRadius: 10, padding: '14px 16px', marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🎯</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'hsl(30,60%,28%)' }}>LMS Milestone — How it works</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'hsl(30,40%,40%)' }}>
                    When a student's course completion reaches the target percentage, Vibe automatically notifies the LTI tool via a real-time webhook and the student is instantly awarded the configured BP.
                    Works with any LMS that supports progress webhooks.
                  </p>
                </div>
              </div>
            </div>
            <div className="acr-field">
              <label className="acr-label">Target Completion % <span className="acr-req">*</span></label>
              <input
                type="number" name="targetPercent" value={formData.targetPercent}
                onChange={handleChange} className="acr-input"
                min={1} max={100} step={1}
                placeholder="e.g. 50"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                BP is awarded once when this threshold is crossed.
              </span>
            </div>
            <div className="acr-field" />
          </>
        )}

        <div className="acr-divider acr-full" />

        {/* ── Row: Reward Type + Reward Value ── */}
        <div className="acr-field">
          <label className="acr-label">Reward Type</label>
          <select name="rewardType" value={formData.rewardType} onChange={handleChange} className="acr-input">
            <option value="ABSOLUTE">Absolute (Fixed BP)</option>
            <option value="PERCENTAGE">Percentage (%)</option>
          </select>
        </div>

        <div className="acr-field">
          <label className="acr-label">Reward Value (BP)</label>
          <input type="number" name="rewardValue" value={formData.rewardValue} onChange={handleChange} className="acr-input" />
        </div>

        {/* ── Row: Grace Period (hidden for milestones) ── */}
        {formData.activityType !== 'VIBE_MILESTONE' && (
          <>
            <div className="acr-field">
              <label className="acr-label">Grace Period (Hours)</label>
              <input type="number" name="gracePeriodDuration" value={formData.gracePeriodDuration} onChange={handleChange} className="acr-input" />
            </div>
            {Number(formData.gracePeriodDuration) > 0 ? (
              <div className="acr-field">
                <label className="acr-label">Grace Reward (%)</label>
                <input type="number" name="graceRewardPercentage" value={formData.graceRewardPercentage} onChange={handleChange} className="acr-input" />
              </div>
            ) : <div className="acr-field" />}
          </>
        )}

        <div className="acr-divider acr-full" />

        {/* ── Checkboxes + Penalty (hidden for VIBE_MILESTONE) ── */}
        {formData.activityType !== 'VIBE_MILESTONE' && (
          <>
            <div className="acr-checks acr-full">
              <label className="acr-check-row">
                <input type="checkbox" name="mandatory" checked={formData.mandatory} onChange={handleChange} className="acr-checkbox" />
                <span className="acr-check-label">
                  <span className="acr-check-title">Mandatory Activity</span>
                  <span className="acr-check-sub">Students must complete this for full credit</span>
                </span>
              </label>
              <label className="acr-check-row">
                <input type="checkbox" name="isProofRequired" checked={formData.isProofRequired} onChange={handleChange} className="acr-checkbox" />
                <span className="acr-check-label">
                  <span className="acr-check-title">Proof Required</span>
                  <span className="acr-check-sub">Students must upload evidence of completion</span>
                </span>
              </label>
            </div>
            {formData.mandatory && (
              <>
                <div className="acr-field">
                  <label className="acr-label">Penalty Type</label>
                  <select name="penaltyType" value={formData.penaltyType} onChange={handleChange} className="acr-input">
                    <option value="ABSOLUTE">Fixed (Absolute BP)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>
                <div className="acr-field">
                  <label className="acr-label">Penalty Value</label>
                  <input type="number" name="penaltyValue" value={formData.penaltyValue} onChange={handleChange} className="acr-input" />
                </div>
              </>
            )}
          </>
        )}

        {/* ── Submit ── */}
        <div className="acr-actions acr-full">
          {!context.courseId && (
            <p className="acr-warn">⚠ Missing course context — re-launch from Vibe to link this activity.</p>
          )}
          <button type="submit" disabled={isLoading || !context.courseId} className="acr-submit-btn">
            {isLoading ? 'Creating…' : '✓ Create Activity'}
          </button>
        </div>
      </form>
    </div>
  );
}
