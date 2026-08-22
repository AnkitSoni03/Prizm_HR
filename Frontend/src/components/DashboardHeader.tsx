import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import { Avatar } from "./ui/Avatar";

interface DashboardHeaderStat {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** 0–100 — renders a thin progress bar under the hint when set. */
  progressPct?: number;
}

interface DashboardHeaderProps {
  name: string;
  subtitle: string;
  /** Extra subtitle text (e.g. department) appended after `subtitle` —
   * shown only from `sm:` up, so the mobile subtitle stays just `subtitle`. */
  subtitleDesktopExtra?: string;
  /** Optional status chip next to the greeting (e.g. an employee's
   * active/on-notice state). */
  status?: { label: string; tone?: "success" | "neutral" };
  /** Optional one-liner shown under the subtitle on desktop only. */
  tagline?: string;
  /** Optional headline metric card floated on the banner's right edge
   * (e.g. ESS's "This Month" days-present tile). Omit to leave the banner
   * text-only — every portal's dashboard can use this header either way. */
  stat?: DashboardHeaderStat;
}

export function DashboardHeader({
  name,
  subtitle,
  subtitleDesktopExtra,
  status,
  tagline,
  stat,
}: DashboardHeaderProps) {
  const { user } = useAuth();

  const avatar = (
    <Avatar
      src={user?.photoUrl}
      alt={name}
      size="xl"
      className="shrink-0 ring-2 ring-white/20"
    />
  );

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-2xl p-3.5 shadow-md sm:mb-6 sm:p-5"
      style={{ background: "var(--banner-gradient)" }}
    >
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {user?.employeeId ? (
            <Link
              to="/ess/profile"
              aria-label="View my profile"
              className="shrink-0 rounded-full active:scale-95"
            >
              {avatar}
            </Link>
          ) : (
            avatar
          )}
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 truncate text-base font-bold tracking-tight text-white sm:text-2xl">
              <span className="hidden sm:inline">Welcome back,</span>
              <span className="text-amber-300">{name}</span>
              <span aria-hidden="true"></span>
              {status && (
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    status.tone === "success"
                      ? "bg-emerald-400/20 text-emerald-100"
                      : "bg-white/15 text-white/80",
                  ].join(" ")}
                >
                  {status.label}
                </span>
              )}
            </h2>
            <p className="mt-0.5 truncate text-xs text-white/80 sm:mt-1 sm:text-sm">
              {subtitle}
              {subtitleDesktopExtra && (
                <span className="hidden sm:inline">
                  {" "}
                  · {subtitleDesktopExtra}
                </span>
              )}
            </p>
            {tagline && (
              <p className="mt-1 hidden text-sm text-white/70 sm:block">
                {tagline}
              </p>
            )}
          </div>
        </div>

        {stat && (
          <div className="flex shrink-0 items-end justify-end gap-1">
            <img
              src="/dashboard-profile.png"
              alt=""
              aria-hidden="true"
              className="hidden h-20 w-auto shrink-0 object-contain object-bottom drop-shadow-lg md:block lg:h-24"
            />
            <div className="relative flex shrink-0 items-center gap-2.5 rounded-xl border border-white/20 bg-white/15 px-3.5 py-2.5 shadow-lg backdrop-blur-md sm:min-w-[220px]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
                <stat.icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-white/75">
                  {stat.label}
                </p>
                <p className="truncate text-lg font-bold text-white">
                  {stat.value}
                </p>
                {stat.hint && (
                  <p className="truncate text-[11px] text-white/75">
                    {stat.hint}
                  </p>
                )}
                {typeof stat.progressPct === "number" && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, stat.progressPct))}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
