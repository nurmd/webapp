import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProgressiveWindowOptions {
  threshold?: number;
  initial?: number;
  step?: number;
  rootId?: string;
}

export interface ProgressiveWindow {
  enabled: boolean;
  visibleCount: number;
  hasMore: boolean;
  remaining: number;
  loadMore: () => void;
  sentinelRef: (node: HTMLElement | null) => void;
  reset: () => void;
}

export function useProgressiveWindow(
  totalCount: number,
  options?: ProgressiveWindowOptions
): ProgressiveWindow {
  const threshold = options?.threshold ?? 100;
  const initial = options?.initial ?? 60;
  const step = options?.step ?? 60;
  const rootId = options?.rootId ?? 'main-content-scroll';

  const [visibleCount, setVisibleCount] = useState<number>(() => {
    return totalCount <= threshold ? totalCount : Math.min(initial, totalCount);
  });

  const prevTotalCountRef = useRef(totalCount);

  // Clamps visibleCount whenever totalCount shrinks, and expands back to totalCount when list drops to <= threshold
  useEffect(() => {
    const prevTotal = prevTotalCountRef.current;
    prevTotalCountRef.current = totalCount;

    if (totalCount <= threshold) {
      setVisibleCount(totalCount);
    } else {
      setVisibleCount((prev) => {
        if (prevTotal <= threshold) {
          return Math.min(initial, totalCount);
        }
        if (prev > totalCount) {
          return totalCount;
        }
        return prev;
      });
    }
  }, [totalCount, threshold, initial]);

  const enabled = totalCount > threshold;
  const effectiveVisibleCount = enabled ? Math.min(visibleCount, totalCount) : totalCount;
  const hasMore = enabled && effectiveVisibleCount < totalCount;
  const remaining = enabled ? Math.max(0, totalCount - effectiveVisibleCount) : 0;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(totalCount, prev + step));
  }, [totalCount, step]);

  const reset = useCallback(() => {
    setVisibleCount(totalCount <= threshold ? totalCount : Math.min(initial, totalCount));
  }, [totalCount, threshold, initial]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  const attachObserver = useCallback(
    (node: HTMLElement | null) => {
      disconnect();
      sentinelNodeRef.current = node;

      if (!node || !hasMoreRef.current || !enabled) {
        return;
      }

      if (typeof IntersectionObserver === 'undefined') {
        return;
      }

      const rootElement =
        typeof document !== 'undefined' ? document.getElementById(rootId) || null : null;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && hasMoreRef.current) {
              loadMoreRef.current();
            }
          }
        },
        {
          root: rootElement,
          rootMargin: '400px 0px',
          threshold: 0,
        }
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [disconnect, enabled, rootId]
  );

  useEffect(() => {
    if (!hasMore || !enabled) {
      disconnect();
    } else if (sentinelNodeRef.current && !observerRef.current) {
      attachObserver(sentinelNodeRef.current);
    }
  }, [hasMore, enabled, disconnect, attachObserver]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      attachObserver(node);
    },
    [attachObserver]
  );

  return {
    enabled,
    visibleCount: effectiveVisibleCount,
    hasMore,
    remaining,
    loadMore,
    sentinelRef,
    reset,
  };
}
