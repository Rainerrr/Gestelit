"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MiniPieChartProps = {
  good: number;
  scrap: number;
  planned: number;
  size?: number;
};

/**
 * SVG donut chart showing good/scrap/remaining distribution with percentage text.
 */
export const MiniPieChart = ({ good, scrap, planned, size = 56 }: MiniPieChartProps) => {
  const total = Math.max(1, planned);
  const goodPct = Math.min((good / total) * 100, 100);
  const scrapPct = Math.min((scrap / total) * 100, 100 - goodPct);
  const remainPct = Math.max(0, 100 - goodPct - scrapPct);
  const displayPct = Math.round(goodPct);

  const r = 15.9155; // radius for circumference = 100
  const cx = 20;
  const cy = 20;

  // Offsets: good starts at 0, scrap after good, remaining after scrap
  const goodOffset = 0;
  const scrapOffset = goodPct;
  const remainOffset = goodPct + scrapPct;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex-shrink-0 cursor-help" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 40 40" className="-rotate-90">
              {/* Remaining (background) */}
              {remainPct > 0 && (
                <circle
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="6"
                  strokeDasharray={`${remainPct} ${100 - remainPct}`}
                  strokeDashoffset={-remainOffset}
                />
              )}
              {/* Good */}
              {goodPct > 0 && (
                <circle
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="6"
                  strokeDasharray={`${goodPct} ${100 - goodPct}`}
                  strokeDashoffset={-goodOffset}
                />
              )}
              {/* Scrap */}
              {scrapPct > 0 && (
                <circle
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="6"
                  strokeDasharray={`${scrapPct} ${100 - scrapPct}`}
                  strokeDashoffset={-scrapOffset}
                />
              )}
            </svg>
            {/* Percentage text centered */}
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono text-muted-foreground">
              {displayPct}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-medium">
          {'נקבע ע"פ התחנה הסופית'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
