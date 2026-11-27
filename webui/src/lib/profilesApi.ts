export interface ProfileSummary {
  id: string;
  name: string;
  description: string;
  logo: string;
  logo_type: 'default' | 'builtin' | 'upload';
  logo_file?: string;
  is_default: boolean;
  isActive: boolean;
  dataDir: string;
  created_at: number;
  updated_at: number;
}

export interface ProfilesResponse {
  ok: boolean;
  error?: string;
  activeProfileId?: string;
  profiles?: ProfileSummary[];
  profile?: ProfileSummary;
}

export async function fetchProfiles(): Promise<ProfilesResponse> {
  const res = await fetch('/api/profiles');
  return (await res.json()) as ProfilesResponse;
}

export async function fetchActiveProfile(): Promise<ProfileSummary | null> {
  try {
    const res = await fetch('/api/profiles/active');
    const data = (await res.json()) as ProfilesResponse;
    return data.profile || null;
  } catch {
    return null;
  }
}

export async function activateProfile(id: string): Promise<ProfilesResponse> {
  const res = await fetch(`/api/profiles/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  });
  return (await res.json()) as ProfilesResponse;
}
