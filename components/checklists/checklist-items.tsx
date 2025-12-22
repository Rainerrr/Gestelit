import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { StationChecklistItem } from "@/lib/types";

type ChecklistItemsListProps = {
  items: StationChecklistItem[];
  responses: Record<string, boolean>;
  onToggle: (itemId: string, value: boolean) => void;
  getLabel: (item: StationChecklistItem) => string;
  requiredLabel: string;
  disabled?: boolean;
};

export function ChecklistItemsList({
  items,
  responses,
  onToggle,
  getLabel,
  requiredLabel,
  disabled,
}: ChecklistItemsListProps) {
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const checked = Boolean(responses[item.id]);
        return (
          <li
            key={item.id}
            className={cn(
              "rounded-xl border border-border bg-card/50 px-4 py-3 backdrop-blur-sm",
              item.is_required ? "ring-1 ring-primary/30" : "",
            )}
          >
            <label className="flex w-full cursor-pointer items-center justify-between gap-4 text-right">
              <div className="space-y-1 text-right">
                <p className="font-medium text-foreground">{getLabel(item)}</p>
                {item.is_required ? (
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/10 text-primary"
                  >
                    {requiredLabel}
                  </Badge>
                ) : null}
              </div>
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggle(item.id, value === true)
                }
                disabled={disabled}
                aria-label={getLabel(item)}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}



