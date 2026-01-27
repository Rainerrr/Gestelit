import { cn } from "@/lib/utils";

export interface SpinnerProps {
  /** Size variant: sm (20px), md (32px), lg (40px) */
  size?: "sm" | "md" | "lg";
  /** Optional label text displayed below the spinner */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-10 w-10 border-[3px]",
} as const;

/**
 * Reusable loading spinner with consistent styling.
 * Uses cyan accent color to match app theme.
 */
export function Spinner({ size = "md", label, className }: SpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className={cn(
          "rounded-full border-cyan-500 border-t-transparent animate-spin",
          sizeClasses[size]
        )}
        role="status"
        aria-label={label ?? "Loading"}
      />
      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

/**
 * Full-screen overlay with centered spinner.
 * Use for page-level loading states.
 */
export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Spinner size="lg" label={label} />
    </div>
  );
}
