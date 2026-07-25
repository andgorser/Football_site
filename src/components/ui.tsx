import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-[var(--shadow)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 text-xs">{action}</div> : null}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = "neutral" | "brand" | "live" | "win" | "loss" | "warning";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-muted",
  brand: "bg-brand-soft text-brand",
  live: "bg-live-soft text-live",
  win: "bg-[color-mix(in_srgb,var(--win)_15%,transparent)] text-win",
  loss: "bg-[color-mix(in_srgb,var(--loss)_15%,transparent)] text-loss",
  warning: "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-warning",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return (
    <Badge tone="live">
      <span className="live-dot inline-block size-1.5 rounded-full bg-live" />
      {label}
    </Badge>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/** Ссылки-вкладки. Активная определяется по переданному признаку. */
export function TabLinks({
  items,
}: {
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <div className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            item.active
              ? "bg-brand text-brand-fg"
              : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

const buttonVariants = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "bg-surface-3 text-fg hover:bg-border",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-loss text-white hover:opacity-90",
  outline: "border border-border bg-surface text-fg hover:bg-surface-2",
};

export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    buttonVariants[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  className,
  ...rest
}: { variant?: keyof typeof buttonVariants } & ComponentProps<"button">) {
  return <button className={buttonClass(variant, className)} {...rest} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-loss">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-brand focus:bg-surface";

export function Alert({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "error" | "success" | "warning";
  children: ReactNode;
}) {
  const tones = {
    neutral: "border-border bg-surface-2 text-muted",
    error: "border-[color-mix(in_srgb,var(--loss)_40%,transparent)] bg-[color-mix(in_srgb,var(--loss)_10%,transparent)] text-loss",
    success:
      "border-[color-mix(in_srgb,var(--win)_40%,transparent)] bg-[color-mix(in_srgb,var(--win)_10%,transparent)] text-win",
    warning:
      "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-warning",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone])}>{children}</div>
  );
}
