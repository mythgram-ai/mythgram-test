import React, { useMemo, useRef, useState } from 'react';
import { X, Upload, Check, Save, Sparkles } from 'lucide-react';
import {
  DEFAULT_PROFILE_LOGO,
  PROFILE_LOGO_PRESETS,
  findProfileLogoPreset,
} from '../lib/profileLogos';
import type { ProfileSummary, ProfilesResponse } from '../lib/profilesApi';

type LogoMode = 'preset' | 'upload' | 'default';

interface ProfileEditorModalProps {
  mode: 'create' | 'edit';
  profile?: ProfileSummary | null;
  onClose: () => void;
  onSaved: (data: ProfilesResponse) => void;
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function initialLogoState(profile?: ProfileSummary | null) {
  if (profile?.logo_type === 'builtin') {
    const preset = findProfileLogoPreset(profile.logo);
    if (preset) {
      return { mode: 'preset' as LogoMode, presetId: preset.id, preview: preset.dataUrl };
    }
  }
  if (profile?.logo_type === 'upload') {
    return { mode: 'upload' as LogoMode, presetId: null as string | null, preview: profile.logo };
  }
  return { mode: 'default' as LogoMode, presetId: null as string | null, preview: DEFAULT_PROFILE_LOGO };
}

export const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
  mode,
  profile,
  onClose,
  onSaved,
}) => {
  const initialLogo = useMemo(() => initialLogoState(profile), [profile]);
  const [name, setName] = useState(profile?.name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [logoMode, setLogoMode] = useState<LogoMode>(initialLogo.mode);
  const [presetId, setPresetId] = useState<string | null>(initialLogo.presetId);
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState(initialLogo.preview);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isEdit = mode === 'edit' && Boolean(profile);

  const selectMode = (next: LogoMode) => {
    setLogoMode(next);
    setError('');
    if (next === 'default') {
      setPreview(DEFAULT_PROFILE_LOGO);
      return;
    }
    if (next === 'preset') {
      const preset = presetId ? findProfileLogoPreset(presetId) : null;
      setPreview(preset?.dataUrl || DEFAULT_PROFILE_LOGO);
      return;
    }
    setPreview(uploadDataUrl || (profile?.logo_type === 'upload' ? profile.logo : DEFAULT_PROFILE_LOGO));
  };

  const selectPreset = (id: string) => {
    const preset = findProfileLogoPreset(id);
    if (!preset) return;
    setPresetId(id);
    setLogoMode('preset');
    setPreview(preset.dataUrl);
    setError('');
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setError('');
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      setError('Use a PNG, JPEG, WEBP, GIF or SVG image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Logo file is too large. Maximum size is 4 MB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUploadDataUrl(dataUrl);
      setLogoMode('upload');
      setPreview(dataUrl);
    } catch (err: any) {
      setError(err?.message || 'Could not read the selected image.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Profile name is required.');
      return;
    }
    if (logoMode === 'preset' && !presetId) {
      setError('Pick one of the preset logos or choose another option.');
      return;
    }
    if (logoMode === 'upload' && !uploadDataUrl && profile?.logo_type !== 'upload') {
      setError('Upload an image or choose another logo option.');
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
    };
    if (logoMode === 'preset' && presetId) {
      const preset = findProfileLogoPreset(presetId);
      body.logoDataUrl = preset?.dataUrl;
      body.logoSource = 'preset';
    } else if (logoMode === 'upload' && uploadDataUrl) {
      body.logoDataUrl = uploadDataUrl;
      body.logoSource = 'upload';
    } else if (logoMode === 'default') {
      body.useDefaultLogo = true;
    }

    setBusy(true);
    try {
      const res = await fetch(
        isEdit ? `/api/profiles/${encodeURIComponent(profile!.id)}` : '/api/profiles',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json()) as ProfilesResponse;
      if (!data.ok) {
        setError(data.error || 'Could not save the profile.');
        return;
      }
      onSaved(data);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit profile' : 'Create profile'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-modal-head">
          <div>
            <h2 className="profile-modal-title">
              {isEdit ? 'Edit profile' : 'Create a new profile'}
            </h2>
            <p className="profile-modal-subtitle">
              {isEdit
                ? 'Update the name, description or logo of this profile.'
                : 'A new profile starts completely empty — its own chats, agents, memory, skills and settings.'}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X size={16} />
          </button>
        </div>

        <form className="profile-modal-form" onSubmit={handleSubmit}>
          <div className="profile-modal-body">
            <div className="profile-editor-summary">
              <img
                className="profile-editor-avatar"
                src={preview || DEFAULT_PROFILE_LOGO}
                alt=""
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).src = DEFAULT_PROFILE_LOGO;
                }}
              />
              <div className="profile-editor-summary-text">
                <span className="profile-editor-summary-name">
                  {name.trim() || 'New profile'}
                </span>
                <span className="profile-editor-summary-desc">
                  {description.trim() || 'No description yet.'}
                </span>
              </div>
            </div>

            <div className="form-grid-2">
              <div>
                <label className="field-label" htmlFor="profile-name">
                  Profile name
                </label>
                <input
                  id="profile-name"
                  className="input-field"
                  placeholder="e.g. Research lab"
                  value={name}
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label" htmlFor="profile-description">
                  Description
                </label>
                <input
                  id="profile-description"
                  className="input-field"
                  placeholder="What is this profile for?"
                  value={description}
                  maxLength={400}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>

            <div className="profile-logo-section">
              <div className="profile-logo-section-head">
                <span className="field-label" style={{ marginBottom: 0 }}>
                  Profile logo
                </span>
                <div className="profile-logo-tabs" role="tablist" aria-label="Logo source">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={logoMode === 'preset'}
                    className={`profile-logo-tab ${logoMode === 'preset' ? 'is-active' : ''}`}
                    onClick={() => selectMode('preset')}
                  >
                    <Sparkles size={12} />
                    Presets
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={logoMode === 'upload'}
                    className={`profile-logo-tab ${logoMode === 'upload' ? 'is-active' : ''}`}
                    onClick={() => selectMode('upload')}
                  >
                    <Upload size={12} />
                    Upload
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={logoMode === 'default'}
                    className={`profile-logo-tab ${logoMode === 'default' ? 'is-active' : ''}`}
                    onClick={() => selectMode('default')}
                  >
                    Default
                  </button>
                </div>
              </div>

              {logoMode === 'preset' && (
                <div className="profile-logo-grid" role="listbox" aria-label="Preset logos">
                  {PROFILE_LOGO_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={presetId === preset.id}
                      title={preset.label}
                      className={`profile-logo-option ${
                        presetId === preset.id ? 'is-selected' : ''
                      }`}
                      onClick={() => selectPreset(preset.id)}
                    >
                      <img src={preset.dataUrl} alt={preset.label} loading="lazy" />
                      {presetId === preset.id && (
                        <span className="profile-logo-check">
                          <Check size={10} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {logoMode === 'upload' && (
                <div className="profile-logo-upload">
                  <button
                    type="button"
                    className="btn-secondary inline-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    Choose image
                  </button>
                  <span className="profile-logo-upload-hint">
                    PNG, JPEG, WEBP, GIF or SVG · up to 4 MB
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    hidden
                    onChange={(event) => {
                      void handleUpload(event.target.files?.[0] || null);
                      event.target.value = '';
                    }}
                  />
                </div>
              )}

              {logoMode === 'default' && (
                <div className="profile-logo-default">
                  <img src={DEFAULT_PROFILE_LOGO} alt="" />
                  <span>Use the original Mythgram logo.</span>
                </div>
              )}
            </div>

            {error && <div className="profile-editor-error">{error}</div>}
          </div>

          <div className="profile-modal-footer">
            <span className="profile-modal-footer-note">
              {isEdit
                ? 'Existing profile data is kept.'
                : 'The new profile opens with a clean slate.'}
            </span>
            <div className="workspace-footer-buttons">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary inline-center" disabled={busy}>
                <Save size={13} />
                {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create profile'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
