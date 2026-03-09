import React, { useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

const THRESHOLD = 70; // px to pull before triggering

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (el && el.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (startYRef.current === null || refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop > 0) {
      startYRef.current = null;
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      // Resistance factor: slow down the pull
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
      }
    } else {
      setPullDistance(0);
      startYRef.current = null;
    }
  }, [pullDistance, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 5 || refreshing;

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center transition-all duration-200 overflow-hidden"
        style={{ height: showIndicator ? `${Math.max(pullDistance, refreshing ? THRESHOLD : 0)}px` : '0px' }}
      >
        <div
          className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center"
          style={{ transform: refreshing ? 'none' : `rotate(${progress * 360}deg)` }}
        >
          <Loader2
            className={`h-5 w-5 text-blue-600 ${refreshing ? 'ptr-spinner' : ''}`}
            style={!refreshing ? { animationPlayState: 'paused' } : {}}
          />
        </div>
      </div>

      {children}
    </div>
  );
}