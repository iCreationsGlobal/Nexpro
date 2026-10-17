import { useState, useRef, useCallback, useEffect } from 'react';
import { useDeviceMode } from './useDeviceMode';
import { APP_REFRESH_EVENT } from '../utils/appRefresh';

/**
 * Custom hook for pull-to-refresh functionality
 * @param {Function} onRefresh - Callback function to execute on refresh
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Minimum pull distance to trigger refresh (default: 80)
 * @param {number} options.resistance - Resistance factor for pull (default: 2.5)
 * @param {boolean} options.enabled - Whether pull-to-refresh is enabled (default: true)
 * @returns {Object} - { isRefreshing, pullDistance, containerProps }
 */
export const usePullToRefresh = (onRefresh, options = {}) => {
  const {
    threshold = 80,
    resistance = 2.5,
    enabled: enabledOption = true,
  } = options;
  // Phones and tablets: the app shell owns the gesture (one indicator, window scroll aware) and
  // asks pages to refresh through APP_REFRESH_EVENT, so the page-level gesture stays off there.
  const { isAppShell } = useDeviceMode();
  const enabled = enabledOption && !isAppShell;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!isAppShell) return undefined;
    const handleAppRefresh = (event) => {
      event.detail?.waitUntil?.(onRefreshRef.current?.());
    };
    window.addEventListener(APP_REFRESH_EVENT, handleAppRefresh);
    return () => window.removeEventListener(APP_REFRESH_EVENT, handleAppRefresh);
  }, [isAppShell]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (!enabled) return;
    
    const container = containerRef.current;
    if (!container) return;

    // Only start pull if at the top of the scrollable container
    const isAtTop = container.scrollTop === 0;
    if (!isAtTop) return;

    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
    isPulling.current = true;
  }, [enabled]);

  const handleTouchMove = useCallback((e) => {
    if (!enabled || !isPulling.current) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - startY.current;

    // Only allow downward pull
    if (deltaY > 0) {
      e.preventDefault();
      currentY.current = touch.clientY;
      
      // Apply resistance - pull becomes harder as you pull more
      const distance = deltaY / resistance;
      setPullDistance(Math.min(distance, threshold * 1.5)); // Cap at 1.5x threshold
    } else {
      // Reset if pulling up
      setPullDistance(0);
      isPulling.current = false;
    }
  }, [enabled, threshold, resistance]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isPulling.current) return;

    isPulling.current = false;

    // Trigger refresh if threshold is met
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Hold at threshold during refresh
      
      // Execute refresh callback
      Promise.resolve(onRefresh?.())
        .then(() => {
          // Reset after a short delay for visual feedback
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 300);
        })
        .catch((error) => {
          console.error('Pull-to-refresh error:', error);
          setIsRefreshing(false);
          setPullDistance(0);
        });
    } else {
      // Snap back if threshold not met
      setPullDistance(0);
    }
  }, [enabled, pullDistance, threshold, isRefreshing, onRefresh]);

  // Reset on unmount
  useEffect(() => {
    return () => {
      isPulling.current = false;
      setPullDistance(0);
      setIsRefreshing(false);
    };
  }, []);

  const containerProps = enabled ? {
    ref: containerRef,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    style: {
      position: 'relative',
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
    },
  } : {
    ref: containerRef,
  };

  return {
    isRefreshing,
    pullDistance,
    containerProps,
    containerRef,
  };
};
