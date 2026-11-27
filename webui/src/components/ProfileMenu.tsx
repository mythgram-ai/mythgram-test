import React, { useEffect, useRef } from 'react';
import { UserRound, Settings, RotateCcw, ChevronRight } from 'lucide-react';
import type { ProfileSummary } from '../lib/profilesApi';
import { DEFAULT_PROFILE_LOGO } from '../lib/profileLogos';

interface ProfileMenuProps {
  profile: ProfileSummary | null;
  loading: boolean;
  error?: string;
  switching?: boolean;
  rail?: boolean;
  onClose: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
  onSwitchToDefault: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  profile,
  loading,
  error,
  switching,
  rail,
  onClose,
  onOpenProfiles,
  onOpenSettings,
  onSwitchToDefault,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (menuRef.current?.contains(target)) return;
      if (target.closest('#sidebar-profile-btn')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={`profile-menu ${rail ? 'is-rail' : ''}`}
      role="menu"
      aria-label="Profile menu"
    >
      {loading ? (
        <div className="profile-menu-loading" aria-busy="true">
          <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <span className="skeleton" style={{ width: '62%', height: 10 }} />
            <span className="skeleton" style={{ width: '42%', height: 9, marginTop: 6 }} />
          </div>
        </div>
      ) : (
        <div className="profile-menu-head">
          <img
            className="profile-menu-logo"
            src={profile?.logo || DEFAULT_PROFILE_LOGO}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = DEFAULT_PROFILE_LOGO;
            }}
          />
          <div className="profile-menu-head-text">
            <span className="profile-menu-name">{profile?.name || 'Profile'}</span>
            <span className="profile-menu-sub">
              {profile?.is_default ? 'Default profile' : 'Custom profile'}
            </span>
          </div>
        </div>
      )}

      {error && <div className="profile-menu-error">{error}</div>}

      <div className="profile-menu-items">
        <button
          type="button"
          className="profile-menu-item"
          role="menuitem"
          onClick={onOpenProfiles}
        >
          <UserRound size={15} />
          <span className="profile-menu-item-label">
            Profile
            <span className="profile-menu-item-hint">Create & manage profiles</span>
          </span>
          <ChevronRight size={13} className="profile-menu-item-chevron" />
        </button>

        <button
          type="button"
          className="profile-menu-item"
          role="menuitem"
          onClick={onOpenSettings}
        >
          <Settings size={15} />
          <span className="profile-menu-item-label">Settings</span>
        </button>

        {profile && !profile.is_default && (
          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            disabled={switching}
            onClick={onSwitchToDefault}
          >
            <RotateCcw size={15} />
            <span className="profile-menu-item-label">Default profile</span>
          </button>
        )}
      </div>

      <p className="profile-menu-note">
        Every profile keeps its own chats, agents, memory and settings.
      </p>
    </div>
  );
};
