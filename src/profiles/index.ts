import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import {
  DEFAULT_PROFILE_ID,
  ensureDataDirIntegrity,
  getBasePaths,
  getProfilePaths,
  setActiveProfileDataDir,
} from '../datadir/index.js';
import { db } from '../db/index.js';

export const DEFAULT_PROFILE_LOGO = '/logo.svg';

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const MAX_INLINE_LOGO_CHARS = 400 * 1024;
const MAX_PROFILE_NAME = 60;
const MAX_PROFILE_DESCRIPTION = 400;

const LOGO_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export type ProfileLogoType = 'default' | 'builtin' | 'upload';

export interface ProfileRecord {
  id: string;
  name: string;
  description: string;
  /** Public URL (default/upload) or inline SVG data URL (builtin preset). */
  logo: string;
  logo_type: ProfileLogoType;
  logo_file?: string;
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

export interface ProfileRegistry {
  activeProfileId: string;
  profiles: ProfileRecord[];
}

export interface ProfileView extends ProfileRecord {
  isActive: boolean;
  dataDir: string;
}

function isValidProfileId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 40);
}

function defaultProfileRecord(now = Date.now()): ProfileRecord {
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Default Profile',
    description: 'The original Mythgram workspace with all existing data.',
    logo: DEFAULT_PROFILE_LOGO,
    logo_type: 'default',
    is_default: true,
    created_at: now,
    updated_at: now,
  };
}

function normalizeProfile(raw: any): ProfileRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!isValidProfileId(id)) return null;
  const isDefault = id === DEFAULT_PROFILE_ID;
  const logoType: ProfileLogoType =
    raw.logo_type === 'builtin' || raw.logo_type === 'upload' || raw.logo_type === 'default'
      ? raw.logo_type
      : 'default';
  return {
    id,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, MAX_PROFILE_NAME)
        : isDefault
        ? 'Default Profile'
        : 'Untitled Profile',
    description:
      typeof raw.description === 'string' ? raw.description.slice(0, MAX_PROFILE_DESCRIPTION) : '',
    logo: typeof raw.logo === 'string' && raw.logo ? raw.logo : DEFAULT_PROFILE_LOGO,
    logo_type: logoType,
    logo_file: typeof raw.logo_file === 'string' ? raw.logo_file : undefined,
    is_default: isDefault,
    created_at: Number(raw.created_at) || Date.now(),
    updated_at: Number(raw.updated_at) || Date.now(),
  };
}

export async function ensureProfilesStore(): Promise<void> {
  const base = getBasePaths();
  for (const dir of [base.profilesDir, base.profileLogosDir, base.profilesDataDir]) {
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
  if (!fsSync.existsSync(base.profilesJsonPath)) {
    const registry: ProfileRegistry = {
      activeProfileId: DEFAULT_PROFILE_ID,
      profiles: [defaultProfileRecord()],
    };
    await fs.writeFile(base.profilesJsonPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  }
}

function normalizeRegistry(parsed: any): ProfileRegistry {
  const seen = new Set<string>();
  const profiles: ProfileRecord[] = [];
  const list = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
  for (const raw of list) {
    const profile = normalizeProfile(raw);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  if (!seen.has(DEFAULT_PROFILE_ID)) {
    profiles.unshift(defaultProfileRecord());
  }
  profiles.sort((a, b) => {
    if (a.is_default) return -1;
    if (b.is_default) return 1;
    return a.created_at - b.created_at;
  });
  const requestedActive =
    typeof parsed?.activeProfileId === 'string' ? parsed.activeProfileId.trim() : '';
  const activeProfileId =
    requestedActive && profiles.some((p) => p.id === requestedActive)
      ? requestedActive
      : DEFAULT_PROFILE_ID;
  return { activeProfileId, profiles };
}

async function readRegistry(): Promise<ProfileRegistry> {
  await ensureProfilesStore();
  const base = getBasePaths();
  try {
    const parsed = JSON.parse(await fs.readFile(base.profilesJsonPath, 'utf-8'));
    return normalizeRegistry(parsed);
  } catch {
    return { activeProfileId: DEFAULT_PROFILE_ID, profiles: [defaultProfileRecord()] };
  }
}

async function writeRegistry(registry: ProfileRegistry): Promise<void> {
  await ensureProfilesStore();
  const base = getBasePaths();
  await fs.writeFile(base.profilesJsonPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}

function toView(profile: ProfileRecord, activeProfileId: string): ProfileView {
  const dataDir = profile.is_default ? getBasePaths().dataDir : getProfilePaths(profile.id).dataDir;
  return {
    ...profile,
    isActive: profile.id === activeProfileId,
    dataDir,
  };
}

export async function listProfiles(): Promise<{
  activeProfileId: string;
  profiles: ProfileView[];
}> {
  const registry = await readRegistry();
  return {
    activeProfileId: registry.activeProfileId,
    profiles: registry.profiles.map((p) => toView(p, registry.activeProfileId)),
  };
}

export async function getProfileById(id: string): Promise<ProfileRecord | null> {
  if (!isValidProfileId(id)) return null;
  const registry = await readRegistry();
  return registry.profiles.find((p) => p.id === id) || null;
}

export async function getActiveProfile(): Promise<ProfileRecord> {
  const registry = await readRegistry();
  return (
    registry.profiles.find((p) => p.id === registry.activeProfileId) ||
    registry.profiles.find((p) => p.is_default) ||
    defaultProfileRecord()
  );
}

export async function getActiveProfileView(): Promise<ProfileView> {
  const registry = await readRegistry();
  const active =
    registry.profiles.find((p) => p.id === registry.activeProfileId) ||
    registry.profiles.find((p) => p.is_default) ||
    defaultProfileRecord();
  return toView(active, registry.activeProfileId);
}

interface LogoInput {
  logoDataUrl?: string;
  logoSource?: 'preset' | 'upload';
  useDefaultLogo?: boolean;
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+)(;charset=[^;,]+)?;base64,(.+)$/s.exec(
    dataUrl.trim()
  );
  if (!match) {
    const svgMatch = /^data:image\/svg\+xml(;charset=[^;,]+)?;utf8,(.+)$/s.exec(dataUrl.trim());
    if (svgMatch) {
      const decoded = decodeURIComponent(svgMatch[2]);
      return { mime: 'image/svg+xml', buffer: Buffer.from(decoded, 'utf-8') };
    }
    throw new Error('Invalid logo image. Upload a PNG, JPEG, WEBP, GIF, or SVG file.');
  }
  const mime = match[1].toLowerCase();
  if (!LOGO_EXTENSIONS[mime]) {
    throw new Error('Unsupported logo format. Use PNG, JPEG, WEBP, GIF, or SVG.');
  }
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length === 0) {
    throw new Error('The selected logo file is empty.');
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error('Logo file is too large. Maximum size is 4 MB.');
  }
  return { mime, buffer };
}

async function removeLogoFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    if (fsSync.existsSync(filePath)) await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

async function applyLogo(
  profileId: string,
  input: LogoInput,
  previous: ProfileRecord | undefined
): Promise<Pick<ProfileRecord, 'logo' | 'logo_type' | 'logo_file'>> {
  const base = getBasePaths();
  const previousFile = previous?.logo_file;

  if (input.logoDataUrl && input.logoDataUrl.trim()) {
    const { mime, buffer } = parseDataUrl(input.logoDataUrl);
    const treatAsPreset =
      input.logoSource === 'preset' ||
      (mime === 'image/svg+xml' && input.logoSource !== 'upload');
    if (treatAsPreset) {
      if (mime !== 'image/svg+xml') {
        throw new Error('Preset logos must be SVG images.');
      }
      const inline = input.logoDataUrl.trim();
      if (inline.length > MAX_INLINE_LOGO_CHARS) {
        throw new Error('Preset logo is too large.');
      }
      await removeLogoFile(previousFile);
      return { logo: inline, logo_type: 'builtin', logo_file: undefined };
    }
    const ext = LOGO_EXTENSIONS[mime];
    const filePath = path.join(base.profileLogosDir, `${profileId}.${ext}`);
    await fs.writeFile(filePath, buffer);
    if (previousFile && previousFile !== filePath) {
      await removeLogoFile(previousFile);
    }
    return {
      logo: `/api/profiles/${encodeURIComponent(profileId)}/logo?v=${Date.now()}`,
      logo_type: 'upload',
      logo_file: filePath,
    };
  }

  if (input.useDefaultLogo || !previous) {
    if (previousFile) await removeLogoFile(previousFile);
    return { logo: DEFAULT_PROFILE_LOGO, logo_type: 'default', logo_file: undefined };
  }

  return {
    logo: previous.logo,
    logo_type: previous.logo_type,
    logo_file: previous.logo_file,
  };
}

function validateName(name: string, profiles: ProfileRecord[], excludeId?: string): string {
  const clean = name.trim();
  if (!clean) throw new Error('Profile name is required.');
  if (clean.length > MAX_PROFILE_NAME) {
    throw new Error(`Profile name must be ${MAX_PROFILE_NAME} characters or fewer.`);
  }
  if (clean.toLowerCase() === DEFAULT_PROFILE_ID && excludeId !== DEFAULT_PROFILE_ID) {
    throw new Error('"Default" is a reserved profile name.');
  }
  const clash = profiles.some(
    (p) => p.id !== excludeId && p.name.toLowerCase() === clean.toLowerCase()
  );
  if (clash) throw new Error('A profile with this name already exists.');
  return clean;
}

export async function createProfile(params: {
  name: string;
  description?: string;
  logoDataUrl?: string;
  logoSource?: 'preset' | 'upload';
  useDefaultLogo?: boolean;
}): Promise<ProfileView> {
  const registry = await readRegistry();
  const name = validateName(params.name, registry.profiles);
  const now = Date.now();
  const id = `prof_${slugify(name) || 'profile'}_${now}`;
  const logo = await applyLogo(id, params, undefined);

  const profile: ProfileRecord = {
    id,
    name,
    description: String(params.description || '').trim().slice(0, MAX_PROFILE_DESCRIPTION),
    ...logo,
    is_default: false,
    created_at: now,
    updated_at: now,
  };

  getProfilePaths(id);
  registry.profiles.push(profile);
  await writeRegistry(registry);
  return toView(profile, registry.activeProfileId);
}

export async function updateProfile(
  id: string,
  params: {
    name?: string;
    description?: string;
    logoDataUrl?: string;
    logoSource?: 'preset' | 'upload';
    useDefaultLogo?: boolean;
  }
): Promise<ProfileView> {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.');
  const registry = await readRegistry();
  const index = registry.profiles.findIndex((p) => p.id === id);
  if (index === -1) throw new Error('Profile not found.');
  const existing = registry.profiles[index];

  const name =
    params.name === undefined ? existing.name : validateName(params.name, registry.profiles, id);

  const logo = await applyLogo(id, params, existing);

  const updated: ProfileRecord = {
    ...existing,
    name,
    description:
      params.description === undefined
        ? existing.description
        : String(params.description).trim().slice(0, MAX_PROFILE_DESCRIPTION),
    ...logo,
    updated_at: Date.now(),
  };
  registry.profiles[index] = updated;
  await writeRegistry(registry);
  return toView(updated, registry.activeProfileId);
}

export async function duplicateProfile(id: string): Promise<ProfileView> {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.');
  const registry = await readRegistry();
  const source = registry.profiles.find((p) => p.id === id);
  if (!source) throw new Error('Profile not found.');

  const now = Date.now();
  let name = `${source.name} copy`;
  let counter = 2;
  while (registry.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    name = `${source.name} copy ${counter}`;
    counter += 1;
  }

  const newId = `prof_${slugify(name) || 'profile'}_${now}`;
  let logo: Pick<ProfileRecord, 'logo' | 'logo_type' | 'logo_file'> = {
    logo: source.logo,
    logo_type: source.logo_type,
    logo_file: source.logo_file,
  };

  if (source.logo_type === 'upload' && source.logo_file) {
    const base = getBasePaths();
    const ext = path.extname(source.logo_file).replace('.', '').toLowerCase() || 'png';
    const target = path.join(base.profileLogosDir, `${newId}.${ext}`);
    try {
      await fs.copyFile(source.logo_file, target);
      logo = {
        logo: `/api/profiles/${encodeURIComponent(newId)}/logo?v=${now}`,
        logo_type: 'upload',
        logo_file: target,
      };
    } catch {
      logo = { logo: DEFAULT_PROFILE_LOGO, logo_type: 'default', logo_file: undefined };
    }
  }

  const profile: ProfileRecord = {
    id: newId,
    name,
    description: source.description,
    ...logo,
    is_default: false,
    created_at: now,
    updated_at: now,
  };

  getProfilePaths(newId);
  registry.profiles.push(profile);
  await writeRegistry(registry);
  return toView(profile, registry.activeProfileId);
}

function hasRunningSessions(): boolean {
  return db.listSessions().some((session) => session.status === 'running');
}

export async function activateProfile(id: string): Promise<ProfileView> {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.');
  const registry = await readRegistry();
  const profile = registry.profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found.');
  if (registry.activeProfileId === id) {
    return toView(profile, registry.activeProfileId);
  }
  if (hasRunningSessions()) {
    throw new Error('Stop running tasks before switching to another profile.');
  }

  const previousActive = registry.activeProfileId;
  registry.activeProfileId = id;
  await writeRegistry(registry);

  try {
    const paths = setActiveProfileDataDir(profile.is_default ? null : profile.id);
    db.switchDatabase(paths.dbPath);
  } catch (err) {
    registry.activeProfileId = previousActive;
    await writeRegistry(registry);
    const paths = setActiveProfileDataDir(
      previousActive === DEFAULT_PROFILE_ID ? null : previousActive
    );
    db.switchDatabase(paths.dbPath);
    throw err;
  }

  return toView(profile, id);
}

export async function deleteProfile(id: string): Promise<void> {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.');
  if (id === DEFAULT_PROFILE_ID) {
    throw new Error('The default profile cannot be deleted.');
  }
  const registry = await readRegistry();
  const profile = registry.profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found.');

  if (registry.activeProfileId === id) {
    await activateProfile(DEFAULT_PROFILE_ID);
  }

  const refreshed = await readRegistry();
  refreshed.profiles = refreshed.profiles.filter((p) => p.id !== id);
  await writeRegistry(refreshed);

  await removeLogoFile(profile.logo_file);
  const dataDir = getProfilePaths(id).dataDir;
  await fs.rm(dataDir, { recursive: true, force: true });
}

export async function resetProfileData(id: string): Promise<void> {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.');
  const registry = await readRegistry();
  const profile = registry.profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found.');

  let reopenDefaultDb = false;
  if (registry.activeProfileId === id) {
    if (profile.is_default) {
      // The live handle points at the files that are about to be deleted.
      db.closeDatabase();
      reopenDefaultDb = true;
    } else {
      await activateProfile(DEFAULT_PROFILE_ID);
    }
  }

  if (profile.is_default) {
    // Keep the profiles registry and the shared profile folders intact.
    const base = getBasePaths();
    const entries = await fs.readdir(base.dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'profiles') continue;
      await fs.rm(path.join(base.dataDir, entry.name), { recursive: true, force: true });
    }
    ensureDataDirIntegrity(base);
    if (reopenDefaultDb) db.openDatabase();
  } else {
    const dataDir = getProfilePaths(id).dataDir;
    await fs.rm(dataDir, { recursive: true, force: true });
    getProfilePaths(id);
  }
}

export async function getProfileLogo(
  id: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const profile = await getProfileById(id);
  if (!profile || profile.logo_type !== 'upload' || !profile.logo_file) return null;
  try {
    if (!fsSync.existsSync(profile.logo_file)) return null;
    const buffer = await fs.readFile(profile.logo_file);
    const ext = path.extname(profile.logo_file).replace('.', '').toLowerCase();
    return { buffer, contentType: EXTENSION_MIME[ext] || 'application/octet-stream' };
  } catch {
    return null;
  }
}

export async function exportProfileArchive(id: string): Promise<{
  filePath: string;
  fileName: string;
}> {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.');
  const registry = await readRegistry();
  const profile = registry.profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found.');

  if (registry.activeProfileId === id) {
    db.flushRamToSqlite();
  }

  const base = getBasePaths();
  const dataDir = profile.is_default ? base.dataDir : getProfilePaths(id).dataDir;
  const exportDir = path.join(base.cacheDir, 'profile-exports');
  await fs.mkdir(exportDir, { recursive: true });

  const safeName = slugify(profile.name) || profile.id;
  const fileName = `${safeName}-${Date.now()}.zip`;
  const filePath = path.join(exportDir, fileName);

  const ignore = ['cache/profile-exports/**'];
  if (profile.is_default) {
    ignore.push('profiles/**');
  }

  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('warning', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', { cwd: dataDir, dot: true, ignore });
    void archive.finalize();
  });

  return { filePath, fileName };
}
