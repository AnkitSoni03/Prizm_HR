import { UserRound } from 'lucide-react';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
  xl: 'h-20 w-20',
};

const ICON_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-9 w-9',
};

interface AvatarProps {
  // Signed download URL (or any displayable image URL) — null/undefined
  // falls back to the generic person icon, same circular treatment either
  // way. A photo is always optional; there is no broken-image state to
  // handle since callers only ever pass a URL once it's known to resolve.
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  className?: string;
}

// Single shared avatar — circular photo if one exists, otherwise the same
// UserRound-in-a-circle fallback every part of the app used to draw by hand
// (Topbar, AccountProfileCard, employee lists/cards/modals).
export function Avatar({ src, alt = '', size = 'md', className = '' }: AvatarProps) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-light text-primary ${SIZE_CLASSES[size]} ${className}`;

  if (src) {
    return (
      <span className={base}>
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className={base}>
      <UserRound className={ICON_CLASSES[size]} strokeWidth={2} />
    </span>
  );
}
