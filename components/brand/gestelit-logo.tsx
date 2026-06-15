import Image from "next/image";
import { cn } from "@/lib/utils";

type GestelitLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  imageClassName?: string;
};

const sizeClass = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-12 w-12",
};

export function GestelitLogo({ size = "md", className, imageClassName }: GestelitLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#5a1f91] shadow-sm ring-1 ring-border/40",
        sizeClass[size],
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src="/brand/gestelit-logo.png"
        alt=""
        width={120}
        height={120}
        className={cn("h-full w-full object-cover", imageClassName)}
      />
    </span>
  );
}
