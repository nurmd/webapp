import React, { useState, useRef, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Package,
  Layers,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react';
import { formatINR } from '../../core/utils/formatters.ts';
import { DatePreset, DateFilterRange, getDateFilterBounds } from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import type {
  TradingProfitAndStockSummary,
  PerformanceTimeSeriesResult,
} from './utils/reportAggregations.ts';
import { computePerformanceTimeSeries } from './utils/reportAggregations.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { InventoryItem } from '../../models/item.ts';

interface BusinessPerformanceCardProps {
  summary: TradingProfitAndStockSummary;
  datePreset: DatePreset;
  customStart?: string;
  customEnd?: string;
  onSelectDateRange: (preset: DatePreset, start?: string, end?: string) => void;
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  expenses?: Expense[];
  items?: InventoryItem[];
}

const SLIDES = [
  { id: 'profitability', label: 'Profits & Margins', icon: Sparkles },
  { id: 'turnover', label: 'Sales & Purchases', icon: ShoppingBag },
  { id: 'inventory', label: 'Stock Valuation', icon: Layers },
];

export const BusinessPerformanceCard: React.FC<BusinessPerformanceCardProps> = ({
  summary,
  datePreset,
  customStart,
  customEnd,
  onSelectDateRange,
  invoices,
  purchases,
  expenses,
  items,
}) => {
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Interactive Touch & Drag Scrubber state per slide
  const [scrubIndexBySlide, setScrubIndexBySlide] = useState<{ [key: number]: number | null }>({
    0: null,
    1: null,
    2: null,
  });
  const [isScrubbingBySlide, setIsScrubbingBySlide] = useState<{ [key: number]: boolean }>({
    0: false,
    1: false,
    2: false,
  });
  const scrubTimeoutRef = useRef<{ [key: number]: NodeJS.Timeout | null }>({
    0: null,
    1: null,
    2: null,
  });
  const svgRefs = useRef<{ [key: number]: SVGSVGElement | null }>({
    0: null,
    1: null,
    2: null,
  });
  const touchStateRef = useRef<{
    x: number;
    y: number;
    time: number;
    isScrubbing: boolean;
    timer: NodeJS.Timeout | null;
  }>({
    x: 0,
    y: 0,
    time: 0,
    isScrubbing: false,
    timer: null,
  });

  const dateBounds: DateFilterRange = getDateFilterBounds(datePreset, customStart, customEnd);

  const formatDisplayPeriod = () => {
    if (datePreset === 'TODAY') return 'Today';
    if (datePreset === 'YESTERDAY') return 'Yesterday';
    if (datePreset === 'THIS_MONTH') return 'This Month';
    if (datePreset === 'THIS_QUARTER') return 'This Quarter';
    if (datePreset === 'THIS_FY') return 'This FY';
    if (datePreset === 'ALL_TIME') return 'All Time';
    if (customStart && customEnd) return `${customStart} - ${customEnd}`;
    return dateBounds.label;
  };

  const scrollRafRef = useRef<number | null>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      if (clientWidth > 0) {
        let bestIndex = 0;
        let minDiff = Infinity;
        const children = scrollRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const child = children[i] as HTMLElement;
          if (child) {
            const diff = Math.abs(child.offsetLeft - scrollLeft);
            if (diff < minDiff) {
              minDiff = diff;
              bestIndex = i;
            }
          }
        }
        if (bestIndex !== activeSlide && bestIndex >= 0 && bestIndex < SLIDES.length) {
          if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
          scrollRafRef.current = requestAnimationFrame(() => {
            setActiveSlide(bestIndex);
          });
        }
      }
    }
  };

  const scrollToSlide = (index: number) => {
    if (scrollRef.current) {
      const targetChild = scrollRef.current.children[index] as HTMLElement | undefined;
      const targetPos = targetChild ? targetChild.offsetLeft : index * scrollRef.current.clientWidth;
      scrollRef.current.scrollTo({
        left: targetPos,
        behavior: 'smooth',
      });
      setActiveSlide(index);
    }
  };

  const isGrossProfitPositive = summary.grossProfit >= 0;
  const isNetProfitPositive = summary.netProfit >= 0;

  const avgSalesBill = summary.salesBillCount > 0
    ? Math.round(summary.totalSales / summary.salesBillCount)
    : 0;
  const avgPurchaseBill = summary.purchasesBillCount > 0
    ? Math.round(summary.totalPurchases / summary.purchasesBillCount)
    : 0;
  const tradeNetSurplus = summary.totalSales - summary.totalPurchases;
  const stockDelta = summary.closingStockValue - summary.openingStockValue;

  // Compute dynamic time-series interval data based on date filter:
  // - 'MONTH': If date filter set to year (THIS_FY, ALL_TIME) or custom range >= 180 days (half-year)
  // - 'WEEK': If date range exceeds a month (> 31 days, e.g. THIS_QUARTER)
  // - 'DAY': For the rest (<= 31 days, e.g. THIS_MONTH, TODAY, YESTERDAY, custom <= 31 days)
  const timeSeries: PerformanceTimeSeriesResult | null = useMemo(() => {
    if (invoices && purchases && expenses && items) {
      return computePerformanceTimeSeries(
        invoices,
        purchases,
        expenses,
        items,
        datePreset,
        customStart,
        customEnd
      );
    }
    return null;
  }, [invoices, purchases, expenses, items, datePreset, customStart, customEnd]);

  // Smooth Catmull-Rom to Cubic Bézier spline helper
  const buildSmoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return '';
    if (pts.length === 2) {
      const p0 = pts[0];
      const p1 = pts[1];
      const midX = (p0.x + p1.x) * 0.5;
      return `M ${p0.x} ${p0.y} C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  // Build baseline-bounded area fill (from zeroY to line)
  const buildBaselineAreaPath = (pts: { x: number; y: number }[], zeroY: number): string => {
    if (pts.length < 2) return '';
    const curve = buildSmoothPath(pts);
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `${curve} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z`;
  };

  // Build stacked area fill (layer between line 2 and line 1)
  const buildStackedAreaPath = (
    line2Pts: { x: number; y: number }[],
    line1Pts: { x: number; y: number }[]
  ): string => {
    if (line1Pts.length < 2 || line2Pts.length < 2) return '';
    const forwardCurve = buildSmoothPath(line2Pts);
    const reversed1 = [...line1Pts].reverse();
    const backwardCurve = buildSmoothPath(reversed1).replace(/^M\s*[\d.-]+\s+[\d.-]+/, '');
    return `${forwardCurve} L ${reversed1[0].x} ${reversed1[0].y} ${backwardCurve} Z`;
  };

  // 2 Lines of Data configuration for Area Chart based on active tab & interval data
  const getAreaChartData = (slideIndex: number) => {
    // If ongoing period (THIS_MONTH, THIS_QUARTER, THIS_FY, THIS_WEEK), trim trailing future dates beyond today
    // so we don't plot non-existent future days as a flatline sitting on 0
    const todayStr = new Date().toISOString().split('T')[0];
    const isOngoingPreset =
      datePreset === 'THIS_MONTH' ||
      datePreset === 'THIS_QUARTER' ||
      datePreset === 'THIS_FY' ||
      datePreset === 'THIS_WEEK';

    let rawPts = timeSeries?.points && timeSeries.points.length >= 2 ? timeSeries.points : null;
    if (rawPts && isOngoingPreset) {
      const activePts = rawPts.filter((p) => !p.fullDate || p.fullDate <= todayStr);
      if (activePts.length >= 2) {
        rawPts = activePts;
      }
    }
    const pts = rawPts;
    const granularityBadge = timeSeries ? timeSeries.granularityLabel : undefined;

    if (slideIndex === 0) {
      // Tab 1: Profits & Margins -> 2 lines: Gross Profit (Line 1) & Net Profit (Line 2)
      // Accumulate cumulative running totals across intervals so the curve builds to the actual totals
      let runGross = 0;
      let runNet = 0;
      const rawGrossSum = pts ? pts.reduce((acc, p) => acc + p.grossProfit, 0) : 0;
      const rawNetSum = pts ? pts.reduce((acc, p) => acc + p.netProfit, 0) : 0;
      const grossScale = rawGrossSum !== 0 ? summary.grossProfit / rawGrossSum : 1;
      const netScale = rawNetSum !== 0 ? summary.netProfit / rawNetSum : 1;

      const pointsLine1 = pts
        ? pts.map((p, idx) => {
            if (idx === pts.length - 1) {
              return { xLabel: p.label, value: summary.grossProfit };
            }
            runGross = Math.round((runGross + p.grossProfit * grossScale) * 100) / 100;
            return { xLabel: p.label, value: runGross };
          })
        : [
            { xLabel: 'Start', value: 0 },
            { xLabel: 'Total', value: summary.grossProfit },
          ];
      const pointsLine2 = pts
        ? pts.map((p, idx) => {
            if (idx === pts.length - 1) {
              return { xLabel: p.label, value: summary.netProfit };
            }
            runNet = Math.round((runNet + p.netProfit * netScale) * 100) / 100;
            return { xLabel: p.label, value: runNet };
          })
        : [
            { xLabel: 'Start', value: 0 },
            { xLabel: 'Total', value: summary.netProfit },
          ];

      return {
        title: 'Profitability Trend',
        granularityBadge,
        line1: {
          label: 'Gross Profit',
          strokeColor: '#10b981',
          badgeColor: '#34d399',
          formattedEnd: (summary.grossProfit >= 0 ? '+' : '-') + formatINR(Math.abs(summary.grossProfit)),
          points: pointsLine1,
        },
        line2: {
          label: 'Net Profit',
          strokeColor: summary.netProfit >= 0 ? '#06b6d4' : '#f43f5e',
          badgeColor: summary.netProfit >= 0 ? '#22d3ee' : '#fb7185',
          formattedEnd: (summary.netProfit >= 0 ? '+' : '-') + formatINR(Math.abs(summary.netProfit)),
          points: pointsLine2,
        },
      };
    }

    if (slideIndex === 1) {
      // Tab 2: Sales & Purchases -> 2 lines: Total Sales (Line 1) & Total Purchases (Line 2)
      // Accumulate cumulative running totals across intervals so the curve builds to total sales and purchases
      let runSales = 0;
      let runPurchases = 0;
      const rawSalesSum = pts ? pts.reduce((acc, p) => acc + p.sales, 0) : 0;
      const rawPurchasesSum = pts ? pts.reduce((acc, p) => acc + p.purchases, 0) : 0;
      const salesScale = rawSalesSum !== 0 ? summary.totalSales / rawSalesSum : 1;
      const purchasesScale = rawPurchasesSum !== 0 ? summary.totalPurchases / rawPurchasesSum : 1;

      const pointsLine1 = pts
        ? pts.map((p, idx) => {
            if (idx === pts.length - 1) {
              return { xLabel: p.label, value: summary.totalSales };
            }
            runSales = Math.round((runSales + p.sales * salesScale) * 100) / 100;
            return { xLabel: p.label, value: runSales };
          })
        : [
            { xLabel: 'Start', value: 0 },
            { xLabel: 'Total', value: summary.totalSales },
          ];
      const pointsLine2 = pts
        ? pts.map((p, idx) => {
            if (idx === pts.length - 1) {
              return { xLabel: p.label, value: summary.totalPurchases };
            }
            runPurchases = Math.round((runPurchases + p.purchases * purchasesScale) * 100) / 100;
            return { xLabel: p.label, value: runPurchases };
          })
        : [
            { xLabel: 'Start', value: 0 },
            { xLabel: 'Total', value: summary.totalPurchases },
          ];

      return {
        title: 'Volume Trend',
        granularityBadge,
        line1: {
          label: 'Total Sales',
          strokeColor: '#10b981',
          badgeColor: '#34d399',
          formattedEnd: formatINR(summary.totalSales),
          points: pointsLine1,
        },
        line2: {
          label: 'Total Purchases',
          strokeColor: '#818cf8',
          badgeColor: '#a5b4fc',
          formattedEnd: formatINR(summary.totalPurchases),
          points: pointsLine2,
        },
      };
    }

    // Tab 3: Stock Valuation -> 2 lines: Closing Stock (Line 1) & Opening Stock (Line 2)
    const pointsLine1 = pts
      ? pts.map((p) => ({ xLabel: p.label, value: p.closingStock || summary.closingStockValue }))
      : [
          { xLabel: 'Opening', value: summary.openingStockValue },
          { xLabel: 'Closing', value: summary.closingStockValue },
        ];
    const pointsLine2 = pts
      ? pts.map((p) => ({ xLabel: p.label, value: p.openingStock || summary.openingStockValue }))
      : [
          { xLabel: 'Opening', value: summary.openingStockValue },
          { xLabel: 'Closing', value: summary.openingStockValue },
        ];

    return {
      title: 'Valuation Trend',
      granularityBadge,
      line1: {
        label: 'Closing Stock',
        strokeColor: stockDelta >= 0 ? '#10b981' : '#fb7185',
        badgeColor: stockDelta >= 0 ? '#34d399' : '#fca5a5',
        formattedEnd: formatINR(summary.closingStockValue),
        points: pointsLine1,
      },
      line2: {
        label: 'Opening Stock',
        strokeColor: '#38bdf8',
        badgeColor: '#7dd3fc',
        formattedEnd: formatINR(summary.openingStockValue),
        points: pointsLine2,
      },
    };
  };

  // Render Stacked 2-Line SVG Area Chart anchored to a specific slide tab (0: Profits, 1: Sales, 2: Stock)
  const renderAreaChart = (slideIndex: number) => {
    const { title, granularityBadge, line1, line2 } = getAreaChartData(slideIndex);

    const W = 500;
    const H = 145;
    const padTop = 22;
    const padBottom = 26;
    const padLeft = 55;
    const padRight = 55;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const N = line1.points.length;

    // All values to establish Y scale
    const allValues = [
      ...line1.points.map((p) => p.value),
      ...line2.points.map((p) => p.value),
      0,
    ];
    const rawMax = Math.max(...allValues);
    const rawMin = Math.min(...allValues);
    const span = Math.max(1, rawMax - rawMin);

    const maxVal = rawMax + span * 0.18;
    const minVal = rawMin - span * 0.18;
    const effectiveSpan = maxVal - minVal || 100;

    // Coordinate conversion function
    const getY = (val: number) => {
      return padTop + ((maxVal - val) / effectiveSpan) * chartH;
    };

    // Zero baseline Y coordinate
    const zeroY = Math.min(
      H - padBottom,
      Math.max(padTop, getY(0))
    );

    // Compute coordinate arrays for both lines
    const P1 = line1.points.map((pt, idx) => ({
      x: padLeft + (idx / Math.max(1, N - 1)) * chartW,
      y: getY(pt.value),
      label: pt.xLabel,
      value: pt.value,
    }));

    const P2 = line2.points.map((pt, idx) => ({
      x: padLeft + (idx / Math.max(1, N - 1)) * chartW,
      y: getY(pt.value),
      label: pt.xLabel,
      value: pt.value,
    }));

    // Gradient definition IDs unique to each slide to prevent SVG DOM collisions
    const grad1Id = `stack-area-grad1-${slideIndex}`;
    const grad2Id = `stack-area-grad2-${slideIndex}`;

    // Base area for Line 2
    const areaLine2Path = buildBaselineAreaPath(P2, zeroY);

    // Stacked Area calculation:
    // If Net Profit is negative in any interval, fill from zeroY to line1
    let areaLine1Path: string;
    const hasNegativeLine2 = line2.points.some((p) => p.value < 0);
    if (hasNegativeLine2 || (slideIndex === 0 && summary.netProfit < 0)) {
      areaLine1Path = buildBaselineAreaPath(P1, zeroY);
    } else {
      areaLine1Path = buildStackedAreaPath(P2, P1);
    }

    const curve1 = buildSmoothPath(P1);
    const curve2 = buildSmoothPath(P2);

    // Filter which X-axis ticks to display to avoid label overlap
    const shouldShowXLabel = (idx: number, total: number) => {
      if (total <= 7) return true;
      if (idx === 0 || idx === total - 1) return true;
      if (total <= 14) return idx % 2 === 0;
      return idx % Math.ceil(total / 6) === 0;
    };

    const lastP1 = P1[N - 1];
    const lastP2 = P2[N - 1];

    // Interactive Touch & Drag Scrubber calculations
    const isScrubbing = isScrubbingBySlide[slideIndex] || false;
    const scrubIdx = scrubIndexBySlide[slideIndex];
    const activeIdx = scrubIdx !== null && scrubIdx >= 0 && scrubIdx < N ? scrubIdx : N - 1;
    const activeP1 = P1[activeIdx] || lastP1;
    const activeP2 = P2[activeIdx] || lastP2;

    const formatPointVal = (val: number) => {
      if (slideIndex === 0) {
        return (val >= 0 ? '+' : '-') + formatINR(Math.abs(val));
      }
      return formatINR(val);
    };

    const activeFormatted1 = formatPointVal(activeP1.value);
    const activeFormatted2 = formatPointVal(activeP2.value);
    const activeDateLabel = activeP1.label;

    const updateScrubPoint = (clientX: number, targetSvg?: SVGSVGElement | null) => {
      const svg = targetSvg || svgRefs.current[slideIndex];
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relativeX = clientX - rect.left;
      const svgX = (relativeX / rect.width) * W;

      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < N; i++) {
        const dist = Math.abs(P1[i].x - svgX);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      if (scrubTimeoutRef.current[slideIndex]) {
        clearTimeout(scrubTimeoutRef.current[slideIndex]!);
        scrubTimeoutRef.current[slideIndex] = null;
      }

      setScrubIndexBySlide((prev) => ({ ...prev, [slideIndex]: closestIdx }));
      setIsScrubbingBySlide((prev) => ({ ...prev, [slideIndex]: true }));
    };

    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse') {
        updateScrubPoint(e.clientX, e.currentTarget);
      }
    };

    const handlePointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse') {
        if (scrubTimeoutRef.current[slideIndex]) {
          clearTimeout(scrubTimeoutRef.current[slideIndex]!);
        }
        scrubTimeoutRef.current[slideIndex] = setTimeout(() => {
          setIsScrubbingBySlide((prev) => ({ ...prev, [slideIndex]: false }));
          setScrubIndexBySlide((prev) => ({ ...prev, [slideIndex]: null }));
        }, 1200);
      }
    };

    const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const targetSvg = e.currentTarget;

      if (touchStateRef.current.timer) {
        clearTimeout(touchStateRef.current.timer);
      }

      touchStateRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        isScrubbing: false,
        timer: setTimeout(() => {
          touchStateRef.current.isScrubbing = true;
          updateScrubPoint(touch.clientX, targetSvg);
        }, 140),
      };
    };

    const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStateRef.current.x);
      const dy = Math.abs(touch.clientY - touchStateRef.current.y);

      if (!touchStateRef.current.isScrubbing) {
        // If finger moved > 7px before 140ms hold, cancel scrub timer to allow native scroll or swipe
        if (dx > 7 || dy > 7) {
          if (touchStateRef.current.timer) {
            clearTimeout(touchStateRef.current.timer);
            touchStateRef.current.timer = null;
          }
        }
        return;
      }

      // User held finger for > 140ms and is now dragging/scrubbing across chart data points
      if (e.cancelable) {
        e.preventDefault();
      }
      updateScrubPoint(touch.clientX, e.currentTarget);
    };

    const handleTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
      if (touchStateRef.current.timer) {
        clearTimeout(touchStateRef.current.timer);
        touchStateRef.current.timer = null;
      }

      const touch = e.changedTouches?.[0];
      if (touch && !touchStateRef.current.isScrubbing) {
        const dx = Math.abs(touch.clientX - touchStateRef.current.x);
        const dy = Math.abs(touch.clientY - touchStateRef.current.y);
        // Single quick tap with minimal movement (< 10px): select tapped data point
        if (dx < 10 && dy < 10) {
          updateScrubPoint(touch.clientX, e.currentTarget);
        }
      }

      touchStateRef.current.isScrubbing = false;

      if (scrubTimeoutRef.current[slideIndex]) {
        clearTimeout(scrubTimeoutRef.current[slideIndex]!);
      }
      scrubTimeoutRef.current[slideIndex] = setTimeout(() => {
        setIsScrubbingBySlide((prev) => ({ ...prev, [slideIndex]: false }));
        setScrubIndexBySlide((prev) => ({ ...prev, [slideIndex]: null }));
      }, 3000);
    };

    return (
      <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-slate-850 shadow-sm mt-2.5">
        {/* Header with Clean Title, Granularity Badge, and Dynamic Responsive Amounts */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80 gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar py-0.5">
            <BarChart3 size={13} className="text-emerald-400 shrink-0" />
            <span className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider truncate shrink-0">
              {title}
            </span>
            {granularityBadge && (
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 whitespace-nowrap shrink-0">
                {granularityBadge}
              </span>
            )}
            {isScrubbing && (
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-sky-950 text-sky-300 border border-sky-800/80 animate-pulse whitespace-nowrap shrink-0">
                {activeDateLabel}
              </span>
            )}
          </div>

          {/* Dynamic Real-time Metric Amounts */}
          <div className="flex items-center gap-3 shrink-0 overflow-x-auto no-scrollbar py-0.5">
            <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: line1.strokeColor }} />
              <span className="text-[10px] text-slate-300 font-semibold">{line1.label}:</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: line1.badgeColor }}>
                {activeFormatted1}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: line2.strokeColor }} />
              <span className="text-[10px] text-slate-300 font-semibold">{line2.label}:</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: line2.badgeColor }}>
                {activeFormatted2}
              </span>
            </div>
          </div>
        </div>

        {/* Responsive Stacked Area Chart SVG with Touch & Drag Scrubber */}
        <div className="w-full overflow-hidden">
          <svg
            ref={(el) => {
              svgRefs.current[slideIndex] = el;
            }}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto overflow-visible select-none cursor-crosshair"
            style={{ touchAction: 'pan-x pan-y' }}
            preserveAspectRatio="xMidYMid meet"
            onClick={(e) => updateScrubPoint(e.clientX, e.currentTarget)}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <defs>
              {/* Line 1 Area Gradient */}
              <linearGradient id={grad1Id} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={line1.strokeColor} stopOpacity="0.45" />
                <stop offset="100%" stopColor={line1.strokeColor} stopOpacity="0.08" />
              </linearGradient>
              {/* Line 2 Area Gradient */}
              <linearGradient id={grad2Id} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={line2.strokeColor} stopOpacity="0.45" />
                <stop offset="100%" stopColor={line2.strokeColor} stopOpacity="0.08" />
              </linearGradient>
            </defs>

            {/* Zero Baseline Reference Line and Label */}
            <line
              x1={padLeft - 15}
              y1={zeroY}
              x2={W - padRight + 15}
              y2={zeroY}
              stroke="#64748b"
              strokeDasharray="4 3"
              strokeWidth="1.2"
              strokeOpacity="0.5"
            />
            <text
              x={padLeft - 18}
              y={zeroY + 3.5}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              ₹0
            </text>

            {/* Vertical Guide Lines at Start and End */}
            <line
              x1={P1[0].x}
              y1={Math.min(P1[0].y, P2[0].y, zeroY)}
              x2={P1[0].x}
              y2={Math.max(P1[0].y, P2[0].y, zeroY)}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            <line
              x1={lastP1.x}
              y1={Math.min(lastP1.y, lastP2.y, zeroY)}
              x2={lastP1.x}
              y2={Math.max(lastP1.y, lastP2.y, zeroY)}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeWidth="1"
              strokeOpacity="0.4"
            />

            {/* Stacked Area Fills */}
            <path d={areaLine2Path} fill={`url(#${grad2Id})`} />
            <path d={areaLine1Path} fill={`url(#${grad1Id})`} />

            {/* Stacked Curve Stroke Lines */}
            <path
              d={curve2}
              fill="none"
              stroke={line2.strokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={curve1}
              fill="none"
              stroke={line1.strokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Point Markers for dense or moderate interval series */}
            {N <= 14 && (
              <>
                {P1.map((pt, i) => (
                  <circle key={`p1-dot-${i}`} cx={pt.x} cy={pt.y} r="2.5" fill={line1.strokeColor} />
                ))}
                {P2.map((pt, i) => (
                  <circle key={`p2-dot-${i}`} cx={pt.x} cy={pt.y} r="2.5" fill={line2.strokeColor} />
                ))}
              </>
            )}

            {/* Scrubber Vertical Tracking Guide Line & Date Pill */}
            {isScrubbing && (
              <g pointerEvents="none">
                <line
                  x1={activeP1.x}
                  y1={padTop - 6}
                  x2={activeP1.x}
                  y2={H - padBottom}
                  stroke="#38bdf8"
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  strokeOpacity="0.9"
                />
                <g transform={`translate(${Math.max(padLeft + 22, Math.min(W - padRight - 22, activeP1.x))}, ${padTop - 8})`}>
                  <rect x="-24" y="-8" width="48" height="14" rx="3.5" fill="#020617" stroke="#38bdf8" strokeWidth="1" />
                  <text textAnchor="middle" y="2.5" fill="#38bdf8" fontSize="8.5" fontWeight="bold">
                    {activeDateLabel}
                  </text>
                </g>
              </g>
            )}

            {/* Active Beacons and Floating Responsive Amount Badges */}
            <g pointerEvents="none">
              {/* Line 1 Beacon */}
              <circle
                cx={activeP1.x}
                cy={activeP1.y}
                r={isScrubbing ? 8 : 6.5}
                fill={line1.strokeColor}
                fillOpacity={isScrubbing ? 0.35 : 0.25}
              />
              <circle
                cx={activeP1.x}
                cy={activeP1.y}
                r={4}
                fill={line1.strokeColor}
                stroke="#020617"
                strokeWidth="2"
              />

              {/* Line 2 Beacon */}
              <circle
                cx={activeP2.x}
                cy={activeP2.y}
                r={isScrubbing ? 8 : 6.5}
                fill={line2.strokeColor}
                fillOpacity={isScrubbing ? 0.35 : 0.25}
              />
              <circle
                cx={activeP2.x}
                cy={activeP2.y}
                r={4}
                fill={line2.strokeColor}
                stroke="#020617"
                strokeWidth="2"
              />

              {/* Responsive Amount Badges next to active data points */}
              {(() => {
                const isNearRight = activeP1.x > W - 110;
                const textX = isNearRight ? activeP1.x - 9 : activeP1.x + 9;
                const textAnchor = isNearRight ? 'end' : 'start';

                let y1 = activeP1.y + 3.5;
                let y2 = activeP2.y + 3.5;
                const minGap = 20;
                if (Math.abs(y1 - y2) < minGap) {
                  const needed = (minGap - Math.abs(y1 - y2)) / 2;
                  if (y1 <= y2) {
                    y1 = Math.max(padTop + 6, y1 - needed);
                    y2 = Math.min(H - padBottom - 2, y2 + needed);
                  } else {
                    y2 = Math.max(padTop + 6, y2 - needed);
                    y1 = Math.min(H - padBottom - 2, y1 + needed);
                  }
                }

                return (
                  <>
                    <text
                      x={textX}
                      y={y1}
                      textAnchor={textAnchor}
                      fill={line1.badgeColor}
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                      paintOrder="stroke"
                      stroke="#020617"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    >
                      {activeFormatted1}
                    </text>
                    <text
                      x={textX}
                      y={y2}
                      textAnchor={textAnchor}
                      fill={line2.badgeColor}
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                      paintOrder="stroke"
                      stroke="#020617"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    >
                      {activeFormatted2}
                    </text>
                  </>
                );
              })()}
            </g>

            {/* X-axis Labels */}
            {P1.map((pt, idx) => {
              if (!shouldShowXLabel(idx, N)) return null;
              return (
                <text
                  key={`x-label-${idx}`}
                  x={pt.x}
                  y={H - 5}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontWeight={idx === 0 || idx === N - 1 ? '700' : '500'}
                >
                  {pt.label}
                </text>
              );
            })}

            {/* Interactive Tap & Drag Hit Columns across all data points */}
            {P1.map((pt, i) => {
              const colW = chartW / Math.max(1, N - 1);
              return (
                <rect
                  key={`col-hit-${i}`}
                  x={pt.x - colW / 2}
                  y={0}
                  width={colW}
                  height={H}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (scrubTimeoutRef.current[slideIndex]) {
                      clearTimeout(scrubTimeoutRef.current[slideIndex]!);
                    }
                    setScrubIndexBySlide((prev) => ({ ...prev, [slideIndex]: i }));
                    setIsScrubbingBySlide((prev) => ({ ...prev, [slideIndex]: true }));
                    scrubTimeoutRef.current[slideIndex] = setTimeout(() => {
                      setIsScrubbingBySlide((prev) => ({ ...prev, [slideIndex]: false }));
                      setScrubIndexBySlide((prev) => ({ ...prev, [slideIndex]: null }));
                    }, 3500);
                  }}
                />
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl p-3 sm:p-4 border border-slate-850 shadow-xl relative overflow-hidden transition-all">
      {/* Background Accent Subtle Glow */}
      <div className="absolute top-0 right-0 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

      {/* Screen-reader hidden string for formula accessibility and backward compatibility */}
      <span className="sr-only">
        Trading Formula: Opening ({formatINR(summary.openingStockValue)}) + Purchases ({formatINR(summary.totalPurchases)}) - Closing ({formatINR(summary.closingStockValue)}) = COGS ({formatINR(summary.totalCogs)}). Core metrics: Total Sales ({formatINR(summary.totalSales)}), Total Purchases ({formatINR(summary.totalPurchases)}), Opening Stock ({formatINR(summary.openingStockValue)}), Closing Stock ({formatINR(summary.closingStockValue)}), Net Profit (Bottom Line).
      </span>

      {/* Header Row: Title, Date Filter, and Slide Controls */}
      <div className="relative flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-850">
        <div className="flex items-center gap-2 min-w-0 pr-1">
          <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-emerald-400 shrink-0">
            <Sparkles size={13} />
          </span>
          <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight m-0 truncate">
            Business Performance &amp; Profit
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Date Filter Pill Button */}
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-[11px] sm:text-xs border border-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
            aria-label="Change report time period"
          >
            <Calendar size={11} className="text-emerald-400" />
            <span className="whitespace-nowrap">{formatDisplayPeriod()}</span>
            <span className="text-slate-400 text-[10px]">▾</span>
          </button>

          {/* Expand / Collapse Toggle Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-[11px] sm:text-xs border border-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
            aria-label={isCollapsed ? 'Expand performance details' : 'Collapse performance details'}
          >
            <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
            {isCollapsed ? (
              <ChevronDown size={11} className="text-emerald-400" />
            ) : (
              <ChevronUp size={11} className="text-emerald-400" />
            )}
          </button>

          {/* Slide Arrow Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollToSlide(Math.max(0, activeSlide - 1))}
              disabled={activeSlide === 0}
              className="w-6 h-6 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none text-slate-300 border border-slate-800 flex items-center justify-center transition-all cursor-pointer active:scale-90"
              aria-label="Previous card slide"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => scrollToSlide(Math.min(SLIDES.length - 1, activeSlide + 1))}
              disabled={activeSlide === SLIDES.length - 1}
              className="w-6 h-6 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none text-slate-300 border border-slate-800 flex items-center justify-center transition-all cursor-pointer active:scale-90"
              aria-label="Next card slide"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Swipeable Carousel: Each slide supports 2-Column Collapsed view OR Detailed Expanded view with Chart */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4 pb-0.5 -mx-0.5 px-0.5"
        style={{ scrollBehavior: 'smooth', touchAction: 'pan-x pan-y' }}
      >
        {/* ============================================================ */}
        {/* SLIDE 1: PROFITS & MARGINS */}
        {/* ============================================================ */}
        <div className="w-full flex-shrink-0 snap-start flex flex-col gap-2.5">
          {isCollapsed ? (
            /* Collapsed Two-Column View: Just Gross Profit & Net Profit */
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {/* Gross Profit Card */}
              <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-emerald-500/25 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                      Gross Profit
                    </span>
                  </div>
                  <div
                    className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-bold shrink-0 ${
                      isGrossProfitPositive
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {isGrossProfitPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    <span>{summary.grossMarginPct > 0 ? `+${summary.grossMarginPct}%` : `${summary.grossMarginPct}%`}</span>
                  </div>
                </div>

                <div className="my-1">
                  <div
                    className={`text-lg sm:text-2xl font-black font-mono tracking-tight truncate ${
                      isGrossProfitPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatINR(summary.grossProfit)}
                  </div>
                </div>
              </div>

              {/* Net Profit Card */}
              <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-teal-500/25 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isNetProfitPositive ? 'bg-teal-400' : 'bg-rose-400'}`} />
                    <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                      Net Profit
                    </span>
                  </div>
                  <div
                    className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-bold shrink-0 ${
                      isNetProfitPositive
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {isNetProfitPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    <span>{summary.netMarginPct > 0 ? `+${summary.netMarginPct}%` : `${summary.netMarginPct}%`}</span>
                  </div>
                </div>

                <div className="my-1">
                  <div
                    className={`text-lg sm:text-2xl font-black font-mono tracking-tight truncate ${
                      isNetProfitPositive ? 'text-teal-400' : 'text-rose-400'
                    }`}
                  >
                    {formatINR(summary.netProfit)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Expanded Full Details + Area Chart */
            <>
              <div className="flex flex-col gap-2 sm:gap-2.5">
                {/* Gross Profit Card (Full Width) */}
                <div className="w-full bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-emerald-500/25 shadow-xs transition-all">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                        Gross Profit
                      </span>
                    </div>
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 ${
                        isGrossProfitPositive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isGrossProfitPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      <span>{summary.grossMarginPct > 0 ? `+${summary.grossMarginPct}%` : `${summary.grossMarginPct}%`} Margin</span>
                    </div>
                  </div>

                  <div className="my-1">
                    <div
                      className={`text-xl sm:text-2xl font-black font-mono tracking-tight truncate ${
                        isGrossProfitPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatINR(summary.grossProfit)}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-300 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <span>Total Revenue: <strong className="text-white font-mono">{formatINR(summary.totalSales)}</strong></span>
                    <span className="text-slate-400">COGS: <strong className="text-slate-200 font-mono">{formatINR(summary.totalCogs)}</strong></span>
                  </div>
                </div>

                {/* Net Profit Card (Full Width) */}
                <div className="w-full bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-teal-500/25 shadow-xs transition-all">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isNetProfitPositive ? 'bg-teal-400' : 'bg-rose-400'}`} />
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                        Net Profit (Bottom Line)
                      </span>
                    </div>
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 ${
                        isNetProfitPositive
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {isNetProfitPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      <span>{summary.netMarginPct > 0 ? `+${summary.netMarginPct}%` : `${summary.netMarginPct}%`} Margin</span>
                    </div>
                  </div>

                  <div className="my-1">
                    <div
                      className={`text-xl sm:text-2xl font-black font-mono tracking-tight truncate ${
                        isNetProfitPositive ? 'text-teal-300' : 'text-rose-300'
                      }`}
                    >
                      {formatINR(summary.netProfit)}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-300 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <span>Gross Profit: <strong className="text-white font-mono">{formatINR(summary.grossProfit)}</strong></span>
                    <span className="text-rose-400">Operating Exp: <strong className="font-mono">-{formatINR(summary.totalExpenses)}</strong></span>
                  </div>
                </div>
              </div>
              {/* Anchored Chart for Profits & Margins */}
              {renderAreaChart(0)}
            </>
          )}
        </div>

        {/* ============================================================ */}
        {/* SLIDE 2: SALES & PURCHASES */}
        {/* ============================================================ */}
        <div className="w-full flex-shrink-0 snap-start flex flex-col gap-2.5">
          {isCollapsed ? (
            /* Collapsed Two-Column View: Just Total Sales & Total Purchases */
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {/* Total Sales */}
              <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-blue-500/25 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                      Total Sales
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                    {summary.salesBillCount} Invoices
                  </span>
                </div>

                <div className="my-1">
                  <div className="text-lg sm:text-2xl font-black font-mono tracking-tight text-white truncate">
                    {formatINR(summary.totalSales)}
                  </div>
                </div>
              </div>

              {/* Total Purchases */}
              <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-amber-500/25 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                      Total Purchases
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    {summary.purchasesBillCount} Bills
                  </span>
                </div>

                <div className="my-1">
                  <div className="text-lg sm:text-2xl font-black font-mono tracking-tight text-amber-300 truncate">
                    {formatINR(summary.totalPurchases)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Expanded Full Details + Area Chart */
            <>
              <div className="flex flex-col gap-2 sm:gap-2.5">
                {/* Total Sales (Full Width) */}
                <div className="w-full bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-blue-500/25 shadow-xs transition-all">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                        Total Sales
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                      {summary.salesBillCount} Invoices
                    </span>
                  </div>

                  <div className="my-1">
                    <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white truncate">
                      {formatINR(summary.totalSales)}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-300 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <span>Avg Bill: <strong className="text-white font-mono">{formatINR(avgSalesBill)}</strong></span>
                    <span className="text-slate-400 truncate">Outward Supply Turnover</span>
                  </div>
                </div>

                {/* Total Purchases (Full Width) */}
                <div className="w-full bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-amber-500/25 shadow-xs transition-all">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                        Total Purchases
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                      {summary.purchasesBillCount} Bills
                    </span>
                  </div>

                  <div className="my-1">
                    <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-300 truncate">
                      {formatINR(summary.totalPurchases)}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-300 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <span>Trade Surplus: <strong className={`font-mono ${tradeNetSurplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatINR(tradeNetSurplus)}</strong></span>
                    <span className="text-slate-400 truncate">Inward Inventory Inflow</span>
                  </div>
                </div>
              </div>
              {/* Anchored Chart for Sales & Purchases */}
              {renderAreaChart(1)}
            </>
          )}
        </div>

        {/* ============================================================ */}
        {/* SLIDE 3: STOCK VALUATION */}
        {/* ============================================================ */}
        <div className="w-full flex-shrink-0 snap-start flex flex-col gap-2.5">
          {isCollapsed ? (
            /* Collapsed Two-Column View: Just Opening Stock & Closing Stock */
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {/* Opening Stock */}
              <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-purple-500/25 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                      Opening Stock
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                    {summary.openingStockQuantity} Units
                  </span>
                </div>

                <div className="my-1">
                  <div className="text-lg sm:text-2xl font-black font-mono tracking-tight text-purple-300 truncate">
                    {formatINR(summary.openingStockValue)}
                  </div>
                </div>
              </div>

              {/* Closing Stock */}
              <div className="bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-teal-500/25 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                      Closing Stock
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                    {summary.closingStockQuantity} Units
                  </span>
                </div>

                <div className="my-1">
                  <div className="text-lg sm:text-2xl font-black font-mono tracking-tight text-teal-300 truncate">
                    {formatINR(summary.closingStockValue)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Expanded Full Details + Area Chart */
            <>
              <div className="flex flex-col gap-2 sm:gap-2.5">
                {/* Opening Stock (Full Width) */}
                <div className="w-full bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-purple-500/25 shadow-xs transition-all">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                        Opening Stock
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                      {summary.openingStockQuantity} Units
                    </span>
                  </div>

                  <div className="my-1">
                    <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-purple-300 truncate">
                      {formatINR(summary.openingStockValue)}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-400 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <span>Valuation Basis: <strong className="text-slate-200 font-medium">Cost basis</strong></span>
                    <span className="text-slate-300 font-medium truncate">Period Start Asset</span>
                  </div>
                </div>

                {/* Closing Stock (Full Width) */}
                <div className="w-full bg-slate-900/90 rounded-xl p-2.5 sm:p-3 border border-teal-500/25 shadow-xs transition-all">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
                        Closing Stock
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                      {summary.closingStockQuantity} Units
                    </span>
                  </div>

                  <div className="my-1">
                    <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-teal-300 truncate">
                      {formatINR(summary.closingStockValue)}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-400 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <span>Stock Change: <strong className={`font-mono ${stockDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stockDelta >= 0 ? '+' : ''}{formatINR(stockDelta)}</strong></span>
                    <span className="text-slate-300 font-medium truncate">Current On-Hand Asset</span>
                  </div>
                </div>
              </div>
              {/* Anchored Chart for Stock Valuation */}
              {renderAreaChart(2)}
            </>
          )}
        </div>
      </div>

      {/* Square-like Slim Tab Bar (Profits & Margins, Sales & Purchases, Stock Valuation) Below Graph */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-850 mt-2.5">
        {SLIDES.map((slide, idx) => {
          const Icon = slide.icon;
          const isActive = activeSlide === idx;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => scrollToSlide(idx)}
              className={`py-1.5 px-2 rounded-md text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-white shadow-xs border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60 border border-transparent'
              }`}
              aria-label={`Switch to ${slide.label}`}
            >
              <Icon size={12} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
              <span className="truncate">{slide.label}</span>
            </button>
          );
        })}
      </div>

      {/* Date Filter Modal */}
      {isDateModalOpen && (
        <DateFilterModal
          isOpen={isDateModalOpen}
          activePreset={datePreset}
          customStartDate={customStart}
          customEndDate={customEnd}
          onSelectRange={(preset: DatePreset, start?: string, end?: string) => {
            onSelectDateRange(preset, start, end);
            setIsDateModalOpen(false);
          }}
          onClose={() => setIsDateModalOpen(false)}
        />
      )}
    </div>
  );
};
