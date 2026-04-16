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
    mandatory: false,
    penaltyType: 'PERCENTAGE',
    penaltyValue: '0',
    submissionMode: 'IN_PLATFORM',
    status: 'PUBLISHED',
    isProofRequired: true,
    hpAssignmentMode: 'AUTOMATIC',
    gracePeriodDuration: '0',
    graceRewardPercentage: '100',
    milestoneTargetPercent: '50',
    milestoneRewardHp: '10',
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
    if (!formData.title || (!formData.deadline && formData.activityType !== 'VIBE_MILESTONE')) {
      alert('Please fill in all required fields (title, deadline)');
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
        deadline: formData.activityType !== 'VIBE_MILESTONE' ? new Date(formData.deadline).toISOString() : undefined,
        penaltyType: formData.mandatory ? formData.penaltyType : null,
        penaltyValue: formData.mandatory ? Number(formData.penaltyValue) : null,
        // Milestone-specific — only sent when relevant
        milestoneTargetPercent: formData.activityType === 'VIBE_MILESTONE' ? Number(formData.milestoneTargetPercent) : undefined,
        milestoneRewardHp: formData.activityType === 'VIBE_MILESTONE' ? Number(formData.milestoneRewardHp) : undefined,
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
            <option value="EXTERNAL_IMPORT">External Import</option>
            <option value="LTI_TOOL">External Tool (LTI)</option>
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
              required={formData.activityType !== 'VIBE_MILESTONE'}
            />
          </div>
        )}

        <div className="acr-field">
          <label className="acr-label">HP Assignment Mode</label>
          <select name="hpAssignmentMode" value={formData.hpAssignmentMode} onChange={handleChange} className="acr-input">
            <option value="AUTOMATIC">Automatic</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        <div className="acr-divider acr-full" />

        {/* ── VIBE_MILESTONE config ── */}
        {formData.activityType === 'VIBE_MILESTONE' && (
          <>
            <div className="acr-field acr-full" style={{ background: 'hsl(38,80%,97%)', border: '1px solid hsl(38,70%,80%)', borderRadius: 10, padding: '16px 18px', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: '1.1rem' }}>🎯</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-dark)', fontSize: '0.95rem' }}>Milestone Configuration</span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                A background job checks each student's course completion percentage every 5 minutes.
                When their progress reaches the target, they are automatically awarded the specified BP.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="acr-label">Target Completion % <span className="acr-req">*</span></label>
                  <input
                    type="number" min="1" max="100"
                    name="milestoneTargetPercent"
                    value={formData.milestoneTargetPercent}
                    onChange={handleChange}
                    placeholder="e.g. 50"
                    className="acr-input"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Award once student reaches this % in Vibe</span>
                </div>
                <div>
                  <label className="acr-label">BP to Award <span className="acr-req">*</span></label>
                  <input
                    type="number" min="1"
                    name="milestoneRewardHp"
                    value={formData.milestoneRewardHp}
                    onChange={handleChange}
                    placeholder="e.g. 20"
                    className="acr-input"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Brownie Points awarded at milestone</span>
                </div>
              </div>
            </div>
            <div className="acr-divider acr-full" />
          </>
        )}

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

        {/* ── Row: Grace Period + Grace Reward ── */}
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

        <div className="acr-divider acr-full" />

        {/* ── Checkboxes ── */}
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

        {/* ── Penalty (mandatory only) ── */}
        {formData.mandatory && (
          <>
            <div className="acr-field">
              <label className="acr-label">Penalty Type</label>
              <select name="penaltyType" value={formData.penaltyType} onChange={handleChange} className="acr-input">
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="ABSOLUTE">Absolute (Fixed BP)</option>
              </select>
            </div>
            <div className="acr-field">
              <label className="acr-label">Penalty Value</label>
              <input type="number" name="penaltyValue" value={formData.penaltyValue} onChange={handleChange} className="acr-input" />
            </div>
          </>
        )}

        {/* ── Submit ── */}
        <div className="acr-actions acr-full">
          {!context.courseId && (
            <p className="acr-warn">⚠ Missing course context — re-launch from Vibe to link this activity.</p>
          )}
          <button type="submit" disabled={isLoading || !context.courseId} className="acr-submit-btn">
            {isLoading ? 'Creating…' : '✓ Create Activity & Link to Vibe'}
          </button>
        </div>
      </form>
    </div>
  );
}
