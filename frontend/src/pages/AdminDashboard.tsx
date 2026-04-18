import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface LtiPlatform {
  _id: string;
  name: string;
  issuer: string;
  client_id: string;
  jwks_url: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminDashboard() {
  const [adminSecret, setAdminSecret] = useState(localStorage.getItem('adminSecret') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [platforms, setPlatforms] = useState<LtiPlatform[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    issuer: '',
    client_id: '',
    jwks_url: '',
    oidc_auth_url: '',
    token_url: ''
  });

  const checkAuth = async (secret: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/admin/platforms', {
        headers: { 'x-admin-secret': secret }
      });
      setPlatforms(res.data.data);
      setIsAuthenticated(true);
      localStorage.setItem('adminSecret', secret);
    } catch (err: any) {
      setIsAuthenticated(false);
      localStorage.removeItem('adminSecret');
      if (err.response?.status === 401) {
        setError('Unauthorized: Invalid Master Key');
      } else {
        setError(err.response?.data?.error || 'Failed to connect to backend.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminSecret) checkAuth(adminSecret);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    checkAuth(adminSecret);
  };

  const handleSubmitPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (editingPlatformId) {
        const res = await axios.put(`/api/admin/platforms/${editingPlatformId}`, formData, {
          headers: { 'x-admin-secret': adminSecret }
        });
        setPlatforms(platforms.map(p => p._id === editingPlatformId ? res.data.data : p));
      } else {
        const res = await axios.post('/api/admin/platforms', formData, {
          headers: { 'x-admin-secret': adminSecret }
        });
        setPlatforms([res.data.data, ...platforms]);
      }
      setShowAddForm(false);
      setEditingPlatformId(null);
      setFormData({ name: '', issuer: '', client_id: '', jwks_url: '', oidc_auth_url: '', token_url: '' });
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${editingPlatformId ? 'update' : 'add'} platform.`);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (platform: LtiPlatform) => {
    setFormData({
      name: platform.name,
      issuer: platform.issuer,
      client_id: platform.client_id,
      jwks_url: platform.jwks_url,
      oidc_auth_url: platform.oidc_auth_url,
      token_url: platform.token_url
    });
    setEditingPlatformId(platform._id);
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fcfaf6' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '40px', background: 'white', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', maxWidth: '400px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ background: 'var(--primary-color)', color: 'white', fontWeight: 900, borderRadius: '8px', padding: '10px 16px', fontSize: '1.2rem', letterSpacing: '-0.5px' }}>
              LTI System
            </div>
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '1.4rem' }}>Admin Gateway</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem', color: '#555' }}>Master Secret Key</label>
              <input 
                type="password" 
                value={adminSecret} 
                onChange={(e) => setAdminSecret(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
                placeholder="Enter ADMIN_SECRET"
                required
              />
            </div>
            {error && <div style={{ color: '#d93025', fontSize: '0.85rem', fontWeight: 500, padding: '8px', background: '#fce8e6', borderRadius: '6px' }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ background: 'var(--primary-color)', color: '#fff', padding: '12px', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Authenticating...' : 'Unlock Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fcfaf6', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: '8px', letterSpacing: '-0.5px', color: '#111' }}>LMS Integrations</h1>
            <p style={{ color: '#555', margin: 0 }}>Register and manage connected LTI 1.3 Platforms.</p>
          </div>
          <button 
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showAddForm) {
                setEditingPlatformId(null);
                setFormData({ name: '', issuer: '', client_id: '', jwks_url: '', oidc_auth_url: '', token_url: '' });
              }
            }}
            style={{ background: '#111', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1)' }}
          >
            {showAddForm ? '✕ Cancel' : '+ Add New Integration'}
          </button>
        </div>

        {error && <div style={{ color: '#d93025', marginBottom: '20px', padding: '12px', background: '#fce8e6', borderRadius: '8px', fontWeight: 500 }}>{error}</div>}

        {showAddForm && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>{editingPlatformId ? 'Edit Platform Configuration' : 'Configure New Platform'}</h2>
            <form onSubmit={handleSubmitPlatform} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Platform Name (e.g., Canvas, Vibe)</label>
                <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Platform Issuer (Identifier)</label>
                <input value={formData.issuer} onChange={e => setFormData({...formData, issuer: e.target.value})} required placeholder="https://canvas.instructure.com" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Client ID</label>
                <input value={formData.client_id} onChange={e => setFormData({...formData, client_id: e.target.value})} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '6px' }}>OIDC Auth URL</label>
                <input value={formData.oidc_auth_url} onChange={e => setFormData({...formData, oidc_auth_url: e.target.value})} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '6px' }}>JWKS URL</label>
                <input value={formData.jwks_url} onChange={e => setFormData({...formData, jwks_url: e.target.value})} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '6px' }}>Access Token URL</label>
                <input value={formData.token_url} onChange={e => setFormData({...formData, token_url: e.target.value})} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              </div>
              
              <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="submit" disabled={loading} style={{ background: '#111', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
                  {loading ? 'Saving...' : (editingPlatformId ? 'Save Changes' : 'Register Integration')}
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
          {platforms.map(p => (
            <div key={p._id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #eaeaea' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {p.name}
                  {p.is_active ? <span style={{ width: 8, height: 8, background: '#34a853', borderRadius: '50%', display: 'inline-block' }}></span> : <span style={{ width: 8, height: 8, background: '#ea4335', borderRadius: '50%', display: 'inline-block' }}></span>}
                </h3>
                <button 
                  onClick={() => startEditing(p)}
                  style={{ background: 'transparent', border: '1px solid #ddd', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: '#444' }}
                >
                  Edit
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Issuer</div>
                  <div style={{ fontSize: '0.9rem', color: '#333', background: '#f5f5f5', padding: '6px 10px', borderRadius: '4px', wordBreak: 'break-all' }}>{p.issuer}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Client ID</div>
                    <div style={{ fontSize: '0.9rem', color: '#333', background: '#f5f5f5', padding: '6px 10px', borderRadius: '4px' }}>{p.client_id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Added</div>
                    <div style={{ fontSize: '0.9rem', color: '#333', paddingTop: '6px' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {platforms.length === 0 && !loading && (
            <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', color: '#666', border: '1px dashed #ccc' }}>
              No platforms registered yet. Click "Add New Integration" to connect your first LMS.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
