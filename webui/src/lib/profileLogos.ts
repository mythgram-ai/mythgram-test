export const DEFAULT_PROFILE_LOGO = '/logo.svg';

export interface ProfileLogoPreset {
  id: string;
  label: string;
  svg: string;
  dataUrl: string;
}

type HeadShape = 'circle' | 'star' | 'cloud';
type Ears = 'round' | 'pointy' | 'long' | 'tuft' | 'none';
type Eyes = 'dot' | 'happy' | 'wink' | 'sparkle';
type Mouth = 'smile' | 'open' | 'cat' | 'tiny';

interface AvatarConfig {
  id: string;
  label: string;
  bg: string;
  fur: string;
  accent: string;
  ears?: Ears;
  eyes?: Eyes;
  mouth?: Mouth;
  blush?: string;
  head?: HeadShape;
  extra?: (fur: string, accent: string) => string;
}

const INK = '#1c1c22';

function earsMarkup(kind: Ears, fur: string, accent: string): string {
  switch (kind) {
    case 'round':
      return `
        <circle cx="18" cy="21" r="9" fill="${fur}"/>
        <circle cx="46" cy="21" r="9" fill="${fur}"/>
        <circle cx="18" cy="21" r="4.5" fill="${accent}" opacity="0.75"/>
        <circle cx="46" cy="21" r="4.5" fill="${accent}" opacity="0.75"/>`;
    case 'pointy':
      return `
        <path d="M14 27 L17 7 L31 18 Z" fill="${fur}"/>
        <path d="M50 27 L47 7 L33 18 Z" fill="${fur}"/>
        <path d="M17.6 22 L19 12.6 L25.5 18.4 Z" fill="${accent}" opacity="0.7"/>
        <path d="M46.4 22 L45 12.6 L38.5 18.4 Z" fill="${accent}" opacity="0.7"/>`;
    case 'long':
      return `
        <ellipse cx="23" cy="14" rx="5" ry="13" fill="${fur}"/>
        <ellipse cx="41" cy="14" rx="5" ry="13" fill="${fur}"/>
        <ellipse cx="23" cy="14" rx="2.4" ry="8" fill="${accent}" opacity="0.75"/>
        <ellipse cx="41" cy="14" rx="2.4" ry="8" fill="${accent}" opacity="0.75"/>`;
    case 'tuft':
      return `
        <path d="M15 25 L20 10 L29 20 Z" fill="${fur}"/>
        <path d="M49 25 L44 10 L35 20 Z" fill="${fur}"/>`;
    default:
      return '';
  }
}

function eyesMarkup(kind: Eyes): string {
  switch (kind) {
    case 'happy':
      return `
        <path d="M21.5 33.5 q3.5 -3.6 7 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M35.5 33.5 q3.5 -3.6 7 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'wink':
      return `
        <circle cx="25" cy="33" r="2.6" fill="${INK}"/>
        <path d="M35.5 33.5 q3.5 -3.6 7 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'sparkle':
      return `
        <circle cx="25" cy="33" r="3" fill="${INK}"/>
        <circle cx="39" cy="33" r="3" fill="${INK}"/>
        <circle cx="26.2" cy="31.8" r="1" fill="#ffffff"/>
        <circle cx="40.2" cy="31.8" r="1" fill="#ffffff"/>`;
    default:
      return `
        <circle cx="25" cy="33" r="2.8" fill="${INK}"/>
        <circle cx="39" cy="33" r="2.8" fill="${INK}"/>
        <circle cx="26" cy="32" r="0.9" fill="#ffffff"/>
        <circle cx="40" cy="32" r="0.9" fill="#ffffff"/>`;
  }
}

function mouthMarkup(kind: Mouth): string {
  switch (kind) {
    case 'open':
      return `
        <ellipse cx="32" cy="43" rx="4.2" ry="3.4" fill="${INK}"/>
        <ellipse cx="32" cy="44.6" rx="2.2" ry="1.4" fill="#fb7185"/>`;
    case 'cat':
      return `
        <path d="M28 41.5 l4 3.4 l4 -3.4" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'tiny':
      return `<path d="M30 42.5 q2 2 4 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
    default:
      return `
        <path d="M26.5 41 q5.5 5 11 0" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round"/>`;
  }
}

function headMarkup(shape: HeadShape, fur: string): string {
  if (shape === 'star') {
    return `<path d="M32 12 L38.5 26.5 L54 28.5 L42.5 39.5 L45.5 55 L32 47 L18.5 55 L21.5 39.5 L10 28.5 L25.5 26.5 Z" fill="${fur}" stroke="${fur}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  if (shape === 'cloud') {
    return `
      <circle cx="21" cy="38" r="12" fill="${fur}"/>
      <circle cx="43" cy="38" r="12" fill="${fur}"/>
      <circle cx="32" cy="30" r="14" fill="${fur}"/>
      <rect x="15" y="36" width="34" height="14" rx="7" fill="${fur}"/>`;
  }
  return `<circle cx="32" cy="35" r="19" fill="${fur}"/>`;
}

function buildAvatarSvg(config: AvatarConfig): string {
  const {
    bg,
    fur,
    accent,
    ears = 'none',
    eyes = 'dot',
    mouth = 'smile',
    blush,
    head = 'circle',
    extra,
  } = config;
  const blushMarkup = blush
    ? `<circle cx="19.5" cy="40" r="3.2" fill="${blush}" opacity="0.6"/>
       <circle cx="44.5" cy="40" r="3.2" fill="${blush}" opacity="0.6"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="18" fill="${bg}"/>
  ${earsMarkup(ears, fur, accent)}
  ${headMarkup(head, fur)}
  ${extra ? extra(fur, accent) : ''}
  ${blushMarkup}
  ${eyesMarkup(eyes)}
  ${mouthMarkup(mouth)}
</svg>`;
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const CONFIGS: AvatarConfig[] = [
  {
    id: 'cat',
    label: 'Peach Cat',
    bg: '#fde68a',
    fur: '#fbbf24',
    accent: '#f472b6',
    ears: 'pointy',
    eyes: 'dot',
    mouth: 'cat',
    blush: '#fb7185',
    extra: () => `
      <path d="M12 37 h7 M12 41 h7 M52 37 h-7 M52 41 h-7" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>`,
  },
  {
    id: 'bear',
    label: 'Caramel Bear',
    bg: '#fde2c8',
    fur: '#c08552',
    accent: '#f3c79a',
    ears: 'round',
    eyes: 'dot',
    mouth: 'smile',
    blush: '#fb923c',
    extra: () => `<ellipse cx="32" cy="41" rx="7" ry="5.5" fill="#f3c79a"/>`,
  },
  {
    id: 'panda',
    label: 'Panda',
    bg: '#e5e7eb',
    fur: '#f9fafb',
    accent: '#111827',
    ears: 'round',
    eyes: 'dot',
    mouth: 'smile',
    extra: (_fur, accent) => `
      <ellipse cx="24.5" cy="33" rx="6" ry="7" fill="${accent}" transform="rotate(-18 24.5 33)"/>
      <ellipse cx="39.5" cy="33" rx="6" ry="7" fill="${accent}" transform="rotate(18 39.5 33)"/>
      <circle cx="25" cy="33" r="2.6" fill="#f9fafb"/>
      <circle cx="39" cy="33" r="2.6" fill="#f9fafb"/>`,
  },
  {
    id: 'fox',
    label: 'Fox',
    bg: '#ffedd5',
    fur: '#fb923c',
    accent: '#fed7aa',
    ears: 'pointy',
    eyes: 'dot',
    mouth: 'smile',
    blush: '#f97316',
    extra: () => `<path d="M20 40 q12 12 24 0 q-12 4 -24 0 Z" fill="#fff7ed"/>`,
  },
  {
    id: 'bunny',
    label: 'Bunny',
    bg: '#fce7f3',
    fur: '#fbcfe8',
    accent: '#f9a8d4',
    ears: 'long',
    eyes: 'dot',
    mouth: 'tiny',
    blush: '#fb7185',
  },
  {
    id: 'frog',
    label: 'Frog',
    bg: '#dcfce7',
    fur: '#4ade80',
    accent: '#bbf7d0',
    ears: 'none',
    eyes: 'dot',
    mouth: 'smile',
    blush: '#86efac',
    extra: () => `
      <circle cx="23" cy="27" r="8" fill="#f0fdf4"/>
      <circle cx="41" cy="27" r="8" fill="#f0fdf4"/>
      <circle cx="23" cy="27" r="3" fill="${INK}"/>
      <circle cx="41" cy="27" r="3" fill="${INK}"/>
      <path d="M22 42 q10 6 20 0" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round"/>`,
  },
  {
    id: 'penguin',
    label: 'Penguin',
    bg: '#cffafe',
    fur: '#334155',
    accent: '#f8fafc',
    ears: 'none',
    eyes: 'dot',
    mouth: 'tiny',
    blush: '#fda4af',
    extra: () => `
      <ellipse cx="32" cy="44" rx="12" ry="11" fill="#f8fafc"/>
      <path d="M28 40 l4 3 l4 -3 Z" fill="#fbbf24"/>`,
  },
  {
    id: 'koala',
    label: 'Koala',
    bg: '#e0e7ff',
    fur: '#9ca3af',
    accent: '#d1d5db',
    ears: 'round',
    eyes: 'dot',
    mouth: 'tiny',
    blush: '#c4b5fd',
    extra: () => `<ellipse cx="32" cy="40.5" rx="5" ry="4" fill="#4b5563"/>`,
  },
  {
    id: 'owl',
    label: 'Owl',
    bg: '#ede9fe',
    fur: '#a78bfa',
    accent: '#ddd6fe',
    ears: 'tuft',
    eyes: 'dot',
    mouth: 'tiny',
    extra: () => `
      <circle cx="24" cy="33" r="7.5" fill="#f5f3ff"/>
      <circle cx="40" cy="33" r="7.5" fill="#f5f3ff"/>
      <circle cx="24" cy="33" r="3" fill="${INK}"/>
      <circle cx="40" cy="33" r="3" fill="${INK}"/>
      <path d="M32 38 l-3.5 4 l7 0 Z" fill="#fbbf24"/>`,
  },
  {
    id: 'pig',
    label: 'Piggy',
    bg: '#ffe4e6',
    fur: '#fda4af',
    accent: '#fecdd3',
    ears: 'round',
    eyes: 'dot',
    mouth: 'smile',
    blush: '#fb7185',
    extra: () => `
      <ellipse cx="32" cy="41" rx="8" ry="5.5" fill="#fb7185"/>
      <circle cx="29" cy="41" r="1.3" fill="#9f1239"/>
      <circle cx="35" cy="41" r="1.3" fill="#9f1239"/>`,
  },
  {
    id: 'tiger',
    label: 'Tiger',
    bg: '#fef3c7',
    fur: '#f59e0b',
    accent: '#fde68a',
    ears: 'round',
    eyes: 'dot',
    mouth: 'cat',
    blush: '#f97316',
    extra: () => `
      <path d="M32 18 v6 M26 19 l1 5 M38 19 l-1 5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/>
      <path d="M15 32 h5 M44 32 h5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/>`,
  },
  {
    id: 'lion',
    label: 'Lion',
    bg: '#fef9c3',
    fur: '#facc15',
    accent: '#f59e0b',
    ears: 'round',
    eyes: 'dot',
    mouth: 'smile',
    blush: '#fb923c',
    extra: (_fur, accent) => `
      <circle cx="32" cy="35" r="22" fill="${accent}" opacity="0.55"/>`,
  },
  {
    id: 'dog',
    label: 'Puppy',
    bg: '#ffedd5',
    fur: '#d97706',
    accent: '#fcd34d',
    ears: 'round',
    eyes: 'dot',
    mouth: 'open',
    blush: '#fb923c',
    extra: () => `
      <ellipse cx="16" cy="34" rx="5" ry="10" fill="#b45309"/>
      <ellipse cx="48" cy="34" rx="5" ry="10" fill="#b45309"/>`,
  },
  {
    id: 'mouse',
    label: 'Mouse',
    bg: '#f3e8ff',
    fur: '#c4b5fd',
    accent: '#ddd6fe',
    ears: 'round',
    eyes: 'dot',
    mouth: 'tiny',
    blush: '#f0abfc',
    extra: () => `
      <circle cx="32" cy="39" r="2.2" fill="${INK}"/>
      <path d="M14 39 h6 M14 43 h6 M44 39 h6 M44 43 h6" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>`,
  },
  {
    id: 'chick',
    label: 'Chick',
    bg: '#fef9c3',
    fur: '#fde047',
    accent: '#fbbf24',
    ears: 'none',
    eyes: 'dot',
    mouth: 'tiny',
    blush: '#fb923c',
    extra: () => `<path d="M28 39 l4 5 l4 -5 Z" fill="#f97316"/>`,
  },
  {
    id: 'octopus',
    label: 'Octo',
    bg: '#cffafe',
    fur: '#67e8f9',
    accent: '#a5f3fc',
    ears: 'none',
    eyes: 'happy',
    mouth: 'smile',
    blush: '#22d3ee',
    extra: () => `
      <circle cx="18" cy="47" r="3.4" fill="#67e8f9"/>
      <circle cx="32" cy="50" r="3.4" fill="#67e8f9"/>
      <circle cx="46" cy="47" r="3.4" fill="#67e8f9"/>`,
  },
  {
    id: 'whale',
    label: 'Whale',
    bg: '#dbeafe',
    fur: '#60a5fa',
    accent: '#bfdbfe',
    ears: 'none',
    eyes: 'dot',
    mouth: 'smile',
    blush: '#93c5fd',
    extra: () => `
      <path d="M32 12 q0 -5 5 -6 q-1 4 3 6" fill="none" stroke="#93c5fd" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="32" cy="46" rx="11" ry="6" fill="#bfdbfe" opacity="0.7"/>`,
  },
  {
    id: 'cloud',
    label: 'Cloud',
    bg: '#e0f2fe',
    fur: '#f8fafc',
    accent: '#bae6fd',
    ears: 'none',
    eyes: 'happy',
    mouth: 'tiny',
    blush: '#bae6fd',
    head: 'cloud',
  },
  {
    id: 'star',
    label: 'Star',
    bg: '#fef3c7',
    fur: '#fbbf24',
    accent: '#fde68a',
    ears: 'none',
    eyes: 'sparkle',
    mouth: 'smile',
    blush: '#fb923c',
    head: 'star',
  },
  {
    id: 'ghost',
    label: 'Ghost',
    bg: '#ede9fe',
    fur: '#f8fafc',
    accent: '#e9d5ff',
    ears: 'none',
    eyes: 'dot',
    mouth: 'open',
    blush: '#ddd6fe',
    extra: () => `
      <path d="M13 47 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 6 0 v6 h-38 Z" fill="#f8fafc"/>`,
  },
];

export const PROFILE_LOGO_PRESETS: ProfileLogoPreset[] = CONFIGS.map((config) => {
  const svg = buildAvatarSvg(config);
  return { id: config.id, label: config.label, svg, dataUrl: toDataUrl(svg) };
});

export function findProfileLogoPreset(idOrDataUrl: string | undefined | null): ProfileLogoPreset | null {
  if (!idOrDataUrl) return null;
  return (
    PROFILE_LOGO_PRESETS.find((preset) => preset.id === idOrDataUrl) ||
    PROFILE_LOGO_PRESETS.find((preset) => preset.dataUrl === idOrDataUrl) ||
    null
  );
}
