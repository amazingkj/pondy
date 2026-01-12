import { useState, useEffect, useRef, useCallback } from 'react';

interface UseLazyLoadOptions {
  enabled?: boolean;
  threshold?: number;
  rootMargin?: string;
  delay?: number;
}

/**
 * Hook for lazy loading content when it becomes visible in the viewport.
 * Uses IntersectionObserver with optional staggered delay.
 */
export function useLazyLoad({
  enabled = true,
  threshold = 0.1,
  rootMargin = '50px',
  delay = 0,
}: UseLazyLoadOptions = {}) {
  const [isVisible, setIsVisible] = useState(!enabled);
  const [shouldLoad, setShouldLoad] = useState(!enabled);
  const elementRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true);
      setShouldLoad(true);
      return;
    }

    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Stagger load with delay if specified
          if (delay > 0) {
            timeoutRef.current = setTimeout(() => {
              setShouldLoad(true);
            }, delay);
          } else {
            setShouldLoad(true);
          }
          // Once visible, stop observing
          observer.unobserve(element);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, threshold, rootMargin, delay]);

  return { elementRef, isVisible, shouldLoad };
}

/**
 * Hook to get a staggered delay based on index.
 * Useful for staggering multiple component loads.
 */
export function useStaggeredDelay(index: number, baseDelay: number = 50, maxDelay: number = 500) {
  return Math.min(index * baseDelay, maxDelay);
}

/**
 * Hook to debounce a value change.
 * Useful for preventing rapid state updates.
 */
export function useDebouncedValue<T>(value: T, delay: number = 100): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook to batch-delay multiple items loading.
 * Returns a function to check if an item at index should render.
 */
export function useBatchedRender(
  isActive: boolean,
  itemCount: number,
  batchSize: number = 3,
  batchDelay: number = 50
) {
  const [renderedCount, setRenderedCount] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setRenderedCount(0);
      return;
    }

    let count = 0;
    const renderNextBatch = () => {
      count = Math.min(count + batchSize, itemCount);
      setRenderedCount(count);
      if (count < itemCount) {
        setTimeout(renderNextBatch, batchDelay);
      }
    };

    // Start with first batch immediately
    renderNextBatch();
  }, [isActive, itemCount, batchSize, batchDelay]);

  const shouldRender = useCallback(
    (index: number) => index < renderedCount,
    [renderedCount]
  );

  return { shouldRender, renderedCount };
}
