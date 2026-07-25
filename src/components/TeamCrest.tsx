import { cn } from "@/lib/cn";

type CrestTeam = {
  shortName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

const sizes = {
  sm: "size-6 text-[9px]",
  md: "size-8 text-[11px]",
  lg: "size-12 text-sm",
  xl: "size-20 text-xl",
};

/**
 * Эмблема команды. Пока логотипы не загружены, рисуем кружок с инициалами
 * в фирменном цвете команды — так строки матчей всё равно легко различать.
 */
export function TeamCrest({
  team,
  size = "md",
  className,
}: {
  team: CrestTeam;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initials = team.shortName
    .replace(/[«»"]/g, "")
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  if (team.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logoUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", sizes[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: team.primaryColor ?? "#64748b" }}
    >
      {initials}
    </span>
  );
}
