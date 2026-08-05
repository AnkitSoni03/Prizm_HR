import {
  CalendarDays,
  Clock,
  FileText,
  Home,
  LogOut,
  Lock,
  Shirt,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

interface Rule {
  pattern: RegExp;
  icon: LucideIcon;
  // Index into chartColors.ts's 4-slot categorical palette.
  colorIndex: number;
}

// A handful of common policy types get a recognizable icon; matched against
// the policy's own title so this needs no extra field on the model.
const RULES: Rule[] = [
  { pattern: /leave/i, icon: CalendarDays, colorIndex: 0 },
  { pattern: /conduct|ethic|behavio/i, icon: ShieldCheck, colorIndex: 1 },
  { pattern: /attendance|punctual/i, icon: Clock, colorIndex: 2 },
  { pattern: /harassment|safety|posh/i, icon: ShieldAlert, colorIndex: 2 },
  { pattern: /remote|work.?from.?home|\bwfh\b/i, icon: Home, colorIndex: 3 },
  { pattern: /travel|expense|reimburse/i, icon: Wallet, colorIndex: 0 },
  { pattern: /dress/i, icon: Shirt, colorIndex: 1 },
  { pattern: /\bit\b|data|privacy|password|security/i, icon: Lock, colorIndex: 3 },
  { pattern: /exit|resignation|notice period/i, icon: LogOut, colorIndex: 2 },
];

// Cheap, stable string hash — same policy (by id) always lands on the same
// fallback color across reloads, unlike hashing by list position.
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Picks an icon + a categorical palette slot for a policy card. Anything
// that doesn't match a known policy type falls back to a generic document
// icon with a color chosen deterministically from its id — still visually
// varied card-to-card, never random on re-render.
export function pickPolicyIcon(title: string, id: string): { icon: LucideIcon; colorIndex: number } {
  const match = RULES.find((rule) => rule.pattern.test(title));
  if (match) return { icon: match.icon, colorIndex: match.colorIndex };
  return { icon: FileText, colorIndex: hashSeed(id) % 4 };
}
