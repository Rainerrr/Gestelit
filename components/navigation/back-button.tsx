"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

type BackButtonProps = {
  href?: string;
  label?: string;
};

export function BackButton({ href, label }: BackButtonProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="mb-4 gap-2 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <ArrowRight className="h-4 w-4" />
      <span>{label ?? t("common.back")}</span>
    </Button>
  );
}
