import { useState, useEffect } from 'react';
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
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleToggle = (name: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: !(prev as any)[name]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.deadline) {
      alert("Please fill in all required fields (title, deadline)");
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
        deadline: new Date(formData.deadline).toISOString(),
        penaltyType: formData.mandatory ? formData.penaltyType : null,
        penaltyValue: formData.mandatory ? Number(formData.penaltyValue) : null,
        context // pass full context for deep-linking detection
      };

      const response = await axios.post('/api/activities', requestBody);

      if (response.data.success) {
        // Handle LTI Deep Linking: Return the link to Vibe
        if (context.isDeepLinking && context.deepLinkReturnUrl && response.data.JWT) {
          // To ensure the browser follows the Vibe backend's redirect, 
          // we use a classic form submission instead of just an AJAX call.
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
        
        alert("Activity created successfully in LTI!");
        if (context.isDeepLinking) window.close();
      }
    } catch (error: any) {
      console.error('Activity creation error:', error);
      const msg = error.response?.data?.error || error.response?.data?.message || "Failed to create activity";
      alert(`Error: ${msg}`);
      onError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="activity-creator-form">
      <div className="activity-header">
        <div className="activity-icon">✨</div>
        <div className="activity-meta">
          <h2>{context.isDeepLinking ? 'Configure New Activity' : 'Create Activity'}</h2>
          <p>Set up the details, rewards, and deadlines for this activity.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="vibe-form-grid">
        <div className="form-section full-width">
          <label>Title *</label>
          <input 
            type="text" 
            name="title" 
            value={formData.title} 
            onChange={handleChange} 
            placeholder="e.g. Weekly Quiz 1" 
            className="vibe-input" 
            required 
          />
        </div>

        <div className="form-section full-width">
          <label>Description</label>
          <textarea 
            name="description" 
            value={formData.description} 
            onChange={handleChange} 
            placeholder="Describe the activity..." 
            className="vibe-input" 
            rows={3} 
          />
        </div>

        <div className="form-section mt-1">
          <label>Activity Type</label>
          <select name="activityType" value={formData.activityType} onChange={handleChange} className="vibe-input">
            <option value="ASSIGNMENT">Assignment</option>
            <option value="VIBE_MILESTONE">VIBE Milestone</option>
            <option value="EXTERNAL_IMPORT">External Import</option>
            <option value="LTI_TOOL">External Tool (LTI)</option>
          </select>
        </div>

        <div className="form-section mt-1">
          <label>Submission Mode</label>
          <select name="submissionMode" value={formData.submissionMode} onChange={handleChange} className="vibe-input">
            <option value="IN_PLATFORM">In Platform</option>
            <option value="EXTERNAL_LINK">External Link</option>
            <option value="CSV_IMPORT">CSV Import</option>
          </select>
        </div>

        <div className="form-section mt-1">
          <label>Deadline *</label>
          <input 
            type="datetime-local" 
            name="deadline" 
            value={formData.deadline} 
            onChange={handleChange} 
            className="vibe-input" 
            required 
          />
        </div>

        <div className="form-section mt-1">
          <label>HP Assignment Mode</label>
          <select name="hpAssignmentMode" value={formData.hpAssignmentMode} onChange={handleChange} className="vibe-input">
            <option value="AUTOMATIC">Automatic</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        <div className="form-divider full-width"></div>

        <div className="form-section mt-1">
          <label>Reward Type</label>
          <select name="rewardType" value={formData.rewardType} onChange={handleChange} className="vibe-input">
            <option value="ABSOLUTE">Absolute (Fixed HP)</option>
            <option value="PERCENTAGE">Percentage (%)</option>
          </select>
        </div>

        <div className="form-section mt-1">
          <label>Reward Value</label>
          <input 
            type="number" 
            name="rewardValue" 
            value={formData.rewardValue} 
            onChange={handleChange} 
            className="vibe-input" 
          />
        </div>

        <div className="form-section checkbox-section">
          <div className="checkbox-wrapper">
             <input 
               type="checkbox" 
               id="mandatory" 
               name="mandatory" 
               checked={formData.mandatory} 
               onChange={handleChange} 
             />
             <label htmlFor="mandatory">Mandatory Activity</label>
          </div>
        </div>

        <div className="form-section checkbox-section">
          <div className="checkbox-wrapper">
             <input 
               type="checkbox" 
               id="isProofRequired" 
               name="isProofRequired" 
               checked={formData.isProofRequired} 
               onChange={handleChange} 
             />
             <label htmlFor="isProofRequired">Proof Required</label>
          </div>
        </div>

        {formData.mandatory && (
          <>
            <div className="form-section mt-1">
              <label>Penalty Type</label>
              <select name="penaltyType" value={formData.penaltyType} onChange={handleChange} className="vibe-input">
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="ABSOLUTE">Absolute (Fixed HP)</option>
              </select>
            </div>
            <div className="form-section mt-1">
              <label>Penalty Value</label>
              <input 
                type="number" 
                name="penaltyValue" 
                value={formData.penaltyValue} 
                onChange={handleChange} 
                className="vibe-input" 
              />
            </div>
          </>
        )}

        <div className="form-divider full-width"></div>

        <div className="form-section mt-1">
          <label>Grace Period (Hours)</label>
          <input 
            type="number" 
            name="gracePeriodDuration" 
            value={formData.gracePeriodDuration} 
            onChange={handleChange} 
            className="vibe-input" 
          />
        </div>

        {Number(formData.gracePeriodDuration) > 0 && (
          <div className="form-section mt-1">
            <label>Grace Reward (%)</label>
            <input 
              type="number" 
              name="graceRewardPercentage" 
              value={formData.graceRewardPercentage} 
              onChange={handleChange} 
              className="vibe-input" 
            />
          </div>
        )}

        <div className="form-actions full-width">
          <button type="submit" disabled={isLoading} className="btn-primary-v2">
            {isLoading ? 'Creating...' : 'Create Activity & Link to Vibe'}
          </button>
        </div>
      </form>
    </div>
  );
}
