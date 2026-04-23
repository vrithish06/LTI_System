import { useState, useRef } from 'react';

const MAX_DOC_SIZE_MB = 5;
const MAX_DOC_SIZE_BYTES = MAX_DOC_SIZE_MB * 1024 * 1024;
import axios from 'axios';
import { LtiContext } from './App';

interface ActivityCreatorProps {
  context: LtiContext;
  onSuccess: (hp: number) => void;
  onError: (msg: string) => void;
}

interface ValidationModal {
  visible: boolean;
  message: string;
}

export default function ActivityCreator({ context, onSuccess, onError }: ActivityCreatorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [validationModal, setValidationModal] = useState<ValidationModal>({ visible: false, message: '' });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    activityType: 'ASSIGNMENT',
    deadline: '',
    rewardType: 'ABSOLUTE',
    rewardValue: '10',
    mandatory: true,          // ← ON by default
    penaltyType: 'ABSOLUTE',
    penaltyValue: '0',
    status: 'PUBLISHED',
    isProofRequired: true,
    hpAssignmentMode: 'AUTOMATIC',
    gracePeriodDuration: '0',
    targetPercent: '50',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const showValidationError = (message: string) => {
    setValidationModal({ visible: true, message });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isMilestone = formData.activityType === 'VIBE_MILESTONE';

    // ── Validations ──────────────────────────────────────────────────
    if (!formData.title.trim()) {
      showValidationError('Please fill in the activity title.');
      return;
    }
    if (!isMilestone && !formData.deadline) {
      showValidationError('Please set a deadline for this activity.');
      return;
    }
    if (isMilestone && (Number(formData.targetPercent) <= 0 || Number(formData.targetPercent) > 100)) {
      showValidationError('Target Completion % must be between 1 and 100.');
      return;
    }

    const rewardVal = Number(formData.rewardValue);
    const penaltyVal = Number(formData.penaltyValue);

    if (rewardVal <= 0) {
      showValidationError('Reward value must be greater than 0.');
      return;
    }

    // Reward must be strictly greater than penalty
    if (formData.mandatory && penaltyVal > 0 && penaltyVal >= rewardVal) {
      showValidationError(
        `Penalty value (${penaltyVal} BP) must be less than the reward value (${rewardVal} BP).\n\nStudents should always have an incentive to submit — even late submissions should yield some net positive reward.`
      );
      return;
    }

    // If penalty is 0, grace period must also be 0
    const gracePeriodVal = Number(formData.gracePeriodDuration);
    if (penaltyVal === 0 && gracePeriodVal > 0) {
      showValidationError(
        'A grace period cannot be set when the late penalty is 0.\n\nIf there is no penalty for late submissions, the BP Store grace period window serves no purpose. Either set a penalty > 0, or keep the grace period at 0.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const formPayload = new FormData();

      // Append all text fields
      formPayload.append('title', formData.title);
      formPayload.append('description', formData.description);
      formPayload.append('activityType', formData.activityType);
      formPayload.append('courseId', context.courseId);
      formPayload.append('courseVersionId', context.courseVersionId);
      formPayload.append('isMandatory', String(formData.mandatory));
      formPayload.append('mandatory', String(formData.mandatory));
      formPayload.append('rewardType', formData.rewardType);
      formPayload.append('rewardValue', String(rewardVal));
      formPayload.append('gracePeriodDuration', formData.gracePeriodDuration);
      formPayload.append('graceRewardPercentage', '100'); // always 100% — no extra reduction
      formPayload.append('isProofRequired', String(formData.isProofRequired));
      formPayload.append('hpAssignmentMode', formData.hpAssignmentMode);
      formPayload.append('status', formData.status);
      formPayload.append('penaltyType', formData.mandatory ? formData.penaltyType : 'ABSOLUTE');
      formPayload.append('penaltyValue', formData.mandatory ? String(penaltyVal) : '0');
      if (isMilestone) {
        formPayload.append('targetPercent', formData.targetPercent);
      } else {
        formPayload.append('deadline', new Date(formData.deadline).toISOString());
      }
      formPayload.append('context', JSON.stringify(context));

      // Attach document if uploaded
      if (documentFile) {
        formPayload.append('document', documentFile);
      }

      const response = await axios.post('/api/activities', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

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
        onSuccess(rewardVal);
        if (context.isDeepLinking) window.close();
      }
    } catch (error: any) {
      console.error('Activity creation error:', error);
      const msg = error.response?.data?.error || error.response?.data?.message || 'Failed to create activity';
      showValidationError(`Error: ${msg}`);
      onError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const isMilestone = formData.activityType === 'VIBE_MILESTONE';

  return (
    <div className="activity-creator-form">
      {/* ── Validation Modal ── */}
      {validationModal.visible && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setValidationModal({ visible: false, message: '' })}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: '2rem',
              maxWidth: 440, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              animation: 'slideUp 0.2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
              <span style={{
                fontSize: '1.8rem', flexShrink: 0,
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(239,68,68,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>⚠️</span>
              <div>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: '#111' }}>
                  Cannot Create Activity
                </h3>
                <p style={{ margin: 0, color: '#555', lineHeight: 1.65, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                  {validationModal.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setValidationModal({ visible: false, message: '' })}
              style={{
                marginTop: '1.5rem', width: '100%',
                padding: '0.65rem', borderRadius: 8,
                background: '#ef4444', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
        {/* ── Title ── */}
        <div className="acr-field acr-full">
          <label className="acr-label">Title <span className="acr-req">*</span></label>
          <input
            type="text" name="title" value={formData.title} onChange={handleChange}
            placeholder="e.g. Weekly Quiz 1" className="acr-input" required
          />
        </div>

        {/* ── Description ── */}
        <div className="acr-field acr-full">
          <label className="acr-label">Description</label>
          <textarea
            name="description" value={formData.description} onChange={handleChange}
            placeholder="Describe the activity..." className="acr-input acr-textarea" rows={3}
          />
        </div>

        {/* ── Activity Type (full width, submission mode REMOVED) ── */}
        <div className="acr-field">
          <label className="acr-label">Activity Type</label>
          <select name="activityType" value={formData.activityType} onChange={handleChange} className="acr-input">
            <option value="ASSIGNMENT">Assignment</option>
            <option value="VIBE_MILESTONE">VIBE Milestone</option>
          </select>
        </div>

        {/* ── HP Assignment Mode ── */}
        {!isMilestone && (
          <div className="acr-field">
            <label className="acr-label">HP Assignment Mode</label>
            <select name="hpAssignmentMode" value={formData.hpAssignmentMode} onChange={handleChange} className="acr-input">
              <option value="AUTOMATIC">Automatic</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
        )}

        {/* ── Deadline ── */}
        {!isMilestone && (
          <div className="acr-field">
            <label className="acr-label">Deadline <span className="acr-req">*</span></label>
            <input
              type="datetime-local" name="deadline" value={formData.deadline}
              onChange={handleChange} className="acr-input"
            />
          </div>
        )}

        {/* ── VIBE Milestone fields ── */}
        {isMilestone && (
          <>
            <div className="acr-field acr-full" style={{ background: 'hsl(38,90%,97%)', border: '1px solid hsl(38,70%,82%)', borderRadius: 10, padding: '14px 16px', marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🎯</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'hsl(30,60%,28%)' }}>LMS Milestone — How it works</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'hsl(30,40%,40%)' }}>
                    When a student's course completion reaches the target percentage, Vibe automatically notifies the LTI tool and the student is instantly awarded the configured BP.
                  </p>
                </div>
              </div>
            </div>
            <div className="acr-field">
              <label className="acr-label">Target Completion % <span className="acr-req">*</span></label>
              <input
                type="number" name="targetPercent" value={formData.targetPercent}
                onChange={handleChange} className="acr-input"
                min={1} max={100} step={1} placeholder="e.g. 50"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                BP is awarded once when this threshold is crossed.
              </span>
            </div>
            <div className="acr-field" />
          </>
        )}

        <div className="acr-divider acr-full" />

        {/* ── Reward ── */}
        <div className="acr-field">
          <label className="acr-label">Reward Type</label>
          <select name="rewardType" value={formData.rewardType} onChange={handleChange} className="acr-input">
            <option value="ABSOLUTE">Absolute (Fixed BP)</option>
            <option value="PERCENTAGE">Percentage (%)</option>
          </select>
        </div>

        <div className="acr-field">
          <label className="acr-label">Reward Value (BP) <span className="acr-req">*</span></label>
          <input
            type="number" name="rewardValue" value={formData.rewardValue}
            onChange={handleChange} className="acr-input" min={1}
          />
        </div>

        {/* ── Checkboxes + Penalty ── */}
        {!isMilestone && (
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
                  <label className="acr-label">
                    Penalty Value
                    {Number(formData.penaltyValue) > 0 && Number(formData.penaltyValue) >= Number(formData.rewardValue) && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#ef4444' }}>
                        ⚠ Must be less than reward
                      </span>
                    )}
                  </label>
                  <input
                    type="number" name="penaltyValue" value={formData.penaltyValue}
                    onChange={handleChange} className="acr-input" min={0}
                    style={{
                      borderColor: Number(formData.penaltyValue) >= Number(formData.rewardValue) && Number(formData.penaltyValue) > 0
                        ? '#ef4444' : undefined,
                    }}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ── Grace Period ── */}
        {!isMilestone && (
          <>
            <div className="acr-field">
              <label className="acr-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                Grace Period (Hours)
                {Number(formData.penaltyValue) === 0 && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ef4444', whiteSpace: 'nowrap' }}>
                    ⚠ Must be 0 when penalty is 0
                  </span>
                )}
              </label>
              <input
                type="number" name="gracePeriodDuration"
                value={Number(formData.penaltyValue) === 0 ? '0' : formData.gracePeriodDuration}
                onChange={handleChange}
                className="acr-input" min={0}
                disabled={Number(formData.penaltyValue) === 0}
                style={Number(formData.penaltyValue) === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              />
              {Number(formData.penaltyValue) === 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Set a late penalty to enable a grace period for the BP Store.
                </span>
              )}
            </div>
            <div className="acr-field" />
          </>
        )}

        <div className="acr-divider acr-full" />

        {/* ── Instructor Document Upload ── */}
        <div className="acr-field acr-full">
          <label className="acr-label">
            Attach Document
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.78rem' }}>
              (optional — students can view &amp; download this)
            </span>
          </label>

          <div
            style={{
              border: `2px dashed ${documentFile ? 'hsl(258,70%,60%)' : 'var(--border)'}`,
              borderRadius: 10, padding: '1.25rem',
              background: documentFile ? 'rgba(139,92,246,0.04)' : 'var(--bg-secondary)',
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '0.85rem',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                if (file.size > MAX_DOC_SIZE_BYTES) {
                  showValidationError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is ${MAX_DOC_SIZE_MB} MB.`);
                  return;
                }
                setDocumentFile(file);
              }
            }}
          >
            <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>
              {documentFile ? '📎' : '📄'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {documentFile ? (
                <>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {documentFile.name}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {(documentFile.size / 1024).toFixed(1)} KB · Click to change
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    Click to upload or drag &amp; drop
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    PDF, DOCX, PPTX, images — max 5 MB
                  </p>
                </>
              )}
            </div>
            {documentFile && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setDocumentFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.1rem', flexShrink: 0, padding: '4px' }}
                title="Remove file"
              >✕</button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.zip"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0] || null;
              if (file && file.size > MAX_DOC_SIZE_BYTES) {
                showValidationError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is ${MAX_DOC_SIZE_MB} MB.`);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
              }
              setDocumentFile(file);
            }}
          />
        </div>

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
