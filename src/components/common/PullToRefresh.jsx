import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const THRESHOLD = 70; // px to pull before triggering

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const pullingRef = useRef(false);

  const handleTouchStart = useCallback((e) => {
    // Only start pull when page is scrolled to the very top
    if (window.scrollY === 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (startYRef.current === null || refreshing) return;
    // If user scrolled down during the gesture, cancel
    if (window.scrollY > 0) {
      startYRef.current = null;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      pullingRef.current = true;
      setPullDistance(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
        startYRef.current = null;
        pullingRef.current = false;
      }
    } else {
      setPullDistance(0);
      startYRef.current = null;
      pullingRef.current = false;
    }
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 5 || refreshing;

  return (
    <div className="relative">
      {/* Pull indicator — sits above content, pushed down by pull */}
      {showIndicator && (
        <div
          className="flex items-center justify-center transition-all duration-200"
          style={{ height: `${Math.max(pullDistance, refreshing ? THRESHOLD : 0)}px` }}
        >
          <div
            className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center"
            style={{ transform: refreshing ? 'none' : `rotate(${progress * 360}deg)` }}
          >
            <Loader2
              className={`h-5 w-5 text-blue-600 ${refreshing ? 'animate-spin' : ''}`}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}