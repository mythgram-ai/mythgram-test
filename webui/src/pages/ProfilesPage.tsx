import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Menu,
  Plus,
  MoreVertical,
  Pencil,
  Copy,
  Download,
  RotateCcw,
  Trash2,
  ArrowRightLeft,
  RefreshCw,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import type { ProfileSummary, ProfilesResponse } from '../lib/profilesApi';
import { activateProfile, fetchProfiles } from '../lib/profilesApi';
import { DEFAULT_PROFILE_LOGO } from '../lib/profileLogos';

const ProfileEditorModal = lazy(() =>
  import('../components/ProfileEditorModal').then((m) => ({
    default: m.ProfileEditorModal,
  }))
);

interface ProfilesPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

type ConfirmAction = {
  kind: 'delete' | 'reset';
  profile: ProfileSummary;
};

function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const ProfileSkeletonCard: React.FC<{ index: number }> = ({ index }) => (
  <div
    className="profile-card profile-card-skeleton"
    style={{ animationDelay: `${index * 45}ms` }}
    aria-hidden="true"
  >
    <div className="profile-card-top">
      <span className="skeleton profile-skeleton-logo" />
      <div className="profile-skeleton-titles">
        <span className="skeleton profile-skeleton-line" style={{ width: '58%' }} />
        <span className="skeleton profile-skeleton-line" style={{ width: '36%', marginTop: 7 }} />
      </div>
    </div>
    <span className="skeleton profile-skeleton-line" style={{ width: '92%' }} />
    <span className="skeleton profile-skeleton-line" style={{ width: '68%' }} />
    <div className="profile-skeleton-badges">
      <span className="skeleton profile-skeleton-pill" />
      <span className="skeleton profile-skeleton-pill" style={{ width: 48 }} />
    </div>
  </div>
);

export const ProfilesPage: React.FC<ProfilesPageProps> = ({ onOpenSettings, onOpenSidebar }) => {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; profile?: ProfileSummary } | null>(
    null
  );
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<ProfileSummary | null>(null);
  const menuAreaRef = useRef<HTMLDivElement | null>(null);

  const applyResponse = useCallback((data: ProfilesResponse) => {
    if (Array.isArray(data.profiles)) setProfiles(data.profiles);
    if (data.activeProfileId) setActiveProfileId(data.activeProfileId);
  }, []);

  const loadProfiles = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const data = await fetchProfiles();
      if (!data.ok) {
        setError(data.error || 'Could not load profiles.');
        return;
      }
      setError('');
      applyResponse(data);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    void loadProfiles(true);
  }, [loadProfiles]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(''), 3200);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (menuAreaRef.current?.contains(target)) return;
      setOpenMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  const switchProfile = async (profile: ProfileSummary) => {
    if (profile.isActive) return;
    setOpenMenuId(null);
    setError('');
    setSwitching(profile);
    try {
      const data = await activateProfile(profile.id);
      if (!data.ok) {
        setError(data.error || 'Could not switch profile.');
        setSwitching(null);
        return;
      }
      // A full reload guarantees every page, cache and store starts fresh.
      window.location.assign('/');
    } catch {
      setError('Could not reach the server.');
      setSwitching(null);
    }
  };

  const duplicateProfile = async (profile: ProfileSummary) => {
    setOpenMenuId(null);
    setBusyId(profile.id);
    setError('');
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}/duplicate`, {
        method: 'POST',
      });
      const data = (await res.json()) as ProfilesResponse;
      if (!data.ok) {
        setError(data.error || 'Could not duplicate profile.');
        return;
      }
      applyResponse(data);
      setStatus(`Duplicated "${profile.name}".`);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusyId(null);
    }
  };

  const exportProfile = (profile: ProfileSummary) => {
    setOpenMenuId(null);
    const link = document.createElement('a');
    link.href = `/api/profiles/${encodeURIComponent(profile.id)}/export`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus(`Preparing "${profile.name}" export…`);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const { kind, profile } = confirmAction;
    setBusyId(profile.id);
    setError('');
    try {
      const res = await fetch(
        kind === 'delete'
          ? `/api/profiles/${encodeURIComponent(profile.id)}`
          : `/api/profiles/${encodeURIComponent(profile.id)}/reset`,
        { method: kind === 'delete' ? 'DELETE' : 'POST' }
      );
      const data = (await res.json()) as ProfilesResponse;
      if (!data.ok) {
        setError(data.error || `Could not ${kind === 'delete' ? 'delete' : 'reset'} profile.`);
        return;
      }
      applyResponse(data);
      setConfirmAction(null);
      if (profile.isActive) {
        window.location.assign('/');
        return;
      }
      setStatus(
        kind === 'delete' ? `Deleted "${profile.name}".` : `Reset data of "${profile.name}".`
      );
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusyId(null);
    }
  };

  const activeProfile = profiles.find((profile) => profile.isActive) || null;

  return (
    <main className="main-canvas profiles-page">
      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            aria-label="Open navigation"
            title="Open navigation"
            onClick={onOpenSidebar}
          >
            <Menu size={18} />
          </button>
          <div className="app-topbar-brand">
            <span>Profiles</span>
            <span className="version-block">.mythgram/profiles</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-btn"
            onClick={() => void loadProfiles(true)}
            title="Refresh profiles"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn-primary inline-center"
            onClick={() => setEditor({ mode: 'create' })}
          >
            <Plus size={14} />
            <span>New profile</span>
          </button>
        </div>
      </header>

      <div className="profiles-scroll">
        <div className="profiles-inner">
          <section className="profiles-intro">
            <span className="profiles-intro-icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div className="profiles-intro-text">
              <h1 className="profiles-title">Isolated profiles</h1>
              <p>
                Each profile is a fresh Mythgram: its own chats, agents, skills, memory, knowledge,
                connectors, automation and settings. Switch anytime from the logo at the bottom of
                the sidebar.
              </p>
            </div>
            {activeProfile && (
              <div className="profiles-active-chip" title="Currently active profile">
                <img src={activeProfile.logo || DEFAULT_PROFILE_LOGO} alt="" />
                <span>{activeProfile.name}</span>
              </div>
            )}
          </section>

          {error && (
            <div className="profiles-error" role="alert">
              <span>{error}</span>
              <button type="button" className="icon-btn" onClick={() => setError('')}>
                <X size={14} />
              </button>
            </div>
          )}

          {status && (
            <div className="profiles-toast" role="status">
              <Check size={13} />
              <span>{status}</span>
            </div>
          )}

          {loading ? (
            <div className="profiles-grid" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <ProfileSkeletonCard key={index} index={index} />
              ))}
            </div>
          ) : (
            <div className="profiles-grid">
              {profiles.map((profile) => (
                <article
                  key={profile.id}
                  className={`profile-card ${profile.isActive ? 'is-active' : ''} ${
                    busyId === profile.id ? 'is-busy' : ''
                  }`}
                >
                  <div className="profile-card-top">
                    <img
                      className="profile-card-logo"
                      src={profile.logo || DEFAULT_PROFILE_LOGO}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).src = DEFAULT_PROFILE_LOGO;
                      }}
                    />
                    <div className="profile-card-titles">
                      <span className="profile-card-name" title={profile.name}>
                        {profile.name}
                      </span>
                      <span className="profile-card-kind">
                        {profile.is_default ? 'Default profile' : 'Custom profile'}
                      </span>
                    </div>
                    <div className="profile-card-menu-area" ref={openMenuId === profile.id ? menuAreaRef : undefined}>
                      <button
                        type="button"
                        className={`icon-btn profile-card-more ${
                          openMenuId === profile.id ? 'is-active' : ''
                        }`}
                        aria-label={`Manage ${profile.name}`}
                        aria-expanded={openMenuId === profile.id}
                        onClick={() =>
                          setOpenMenuId((current) => (current === profile.id ? null : profile.id))
                        }
                      >
                        <MoreVertical size={15} />
                      </button>
                      {openMenuId === profile.id && (
                        <div className="profile-card-menu" role="menu">
                          {!profile.isActive && (
                            <button
                              type="button"
                              role="menuitem"
                              className="profile-card-menu-item"
                              onClick={() => void switchProfile(profile)}
                            >
                              <ArrowRightLeft size={13} />
                              Switch to this profile
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            className="profile-card-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              setEditor({ mode: 'edit', profile });
                            }}
                          >
                            <Pencil size={13} />
                            Edit name, description & logo
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="profile-card-menu-item"
                            onClick={() => void duplicateProfile(profile)}
                          >
                            <Copy size={13} />
                            Duplicate profile
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="profile-card-menu-item"
                            onClick={() => exportProfile(profile)}
                          >
                            <Download size={13} />
                            Export data (.zip)
                          </button>
                          <div className="profile-card-menu-divider" />
                          <button
                            type="button"
                            role="menuitem"
                            className="profile-card-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              setConfirmAction({ kind: 'reset', profile });
                            }}
                          >
                            <RotateCcw size={13} />
                            Reset profile data
                          </button>
                          {!profile.is_default && (
                            <button
                              type="button"
                              role="menuitem"
                              className="profile-card-menu-item is-danger"
                              onClick={() => {
                                setOpenMenuId(null);
                                setConfirmAction({ kind: 'delete', profile });
                              }}
                            >
                              <Trash2 size={13} />
                              Delete profile
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="profile-card-desc">
                    {profile.description || 'No description.'}
                  </p>

                  <div className="profile-card-badges">
                    {profile.isActive && <span className="profile-badge is-active">Active</span>}
                    {profile.is_default && <span className="profile-badge">Default</span>}
                    <span className="profile-badge is-muted">
                      Created {formatDate(profile.created_at)}
                    </span>
                  </div>

                  {busyId === profile.id && <div className="profile-card-busy" aria-hidden="true" />}
                </article>
              ))}

              <button
                type="button"
                className="profile-card profile-card-add"
                onClick={() => setEditor({ mode: 'create' })}
              >
                <span className="profile-card-add-icon">
                  <Plus size={18} />
                </span>
                <span className="profile-card-add-title">New profile</span>
                <span className="profile-card-add-sub">Start from a clean slate</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {editor && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="modal-loading">
                <div className="spinner" />
              </div>
            </div>
          }
        >
          <ProfileEditorModal
            mode={editor.mode}
            profile={editor.profile}
            onClose={() => setEditor(null)}
            onSaved={(data) => {
              applyResponse(data);
              setEditor(null);
              setStatus(editor.mode === 'create' ? 'Profile created.' : 'Profile updated.');
            }}
          />
        </Suspense>
      )}

      {confirmAction && (
        <div className="modal-backdrop" onMouseDown={() => setConfirmAction(null)}>
          <div
            className="profile-modal profile-confirm"
            role="alertdialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="profile-modal-head">
              <div>
                <h2 className="profile-modal-title">
                  {confirmAction.kind === 'delete' ? 'Delete profile?' : 'Reset profile data?'}
                </h2>
                <p className="profile-modal-subtitle">
                  {confirmAction.kind === 'delete'
                    ? `"${confirmAction.profile.name}" and all of its data will be permanently removed.`
                    : `Every chat, agent, memory and setting inside "${confirmAction.profile.name}" will be erased. The profile itself stays.`}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setConfirmAction(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="profile-modal-footer">
              <span className="profile-modal-footer-note">
                {confirmAction.kind === 'delete'
                  ? 'This cannot be undone.'
                  : confirmAction.profile.is_default
                  ? 'The default profile keeps its registry, but all app data is removed.'
                  : 'This cannot be undone.'}
              </span>
              <div className="workspace-footer-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger inline-center"
                  disabled={busyId === confirmAction.profile.id}
                  onClick={() => void runConfirmAction()}
                >
                  {busyId === confirmAction.profile.id
                    ? 'Working…'
                    : confirmAction.kind === 'delete'
                    ? 'Delete profile'
                    : 'Reset data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {switching && (
        <div className="profile-switch-overlay" role="status" aria-live="polite">
          <div className="profile-switch-card">
            <img src={switching.logo || DEFAULT_PROFILE_LOGO} alt="" />
            <div className="profile-switch-text">
              <span className="profile-switch-title">Switching to {switching.name}</span>
              <span className="profile-switch-sub">Loading a fresh workspace…</span>
            </div>
            <span className="spinner" />
          </div>
        </div>
      )}
    </main>
  );
};
