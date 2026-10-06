import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { RotateCcw } from 'lucide-react';

// The app disables browser pinch-zoom everywhere (index.html viewport +
// `touch-action` in index.css) so it behaves like a native app. Document
// scans (Aadhaar, certificates) still need zooming to be readable, so this
// gives an image its own pinch / drag / double-tap / wheel zoom instead.

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 8;

interface View {
  scale: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

const RESET: View = { scale: 1, x: 0, y: 0 };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(RESET);
  const [view, setView] = useState<View>(RESET);
  // Animate double-tap/reset, but follow fingers instantly mid-gesture.
  const [isGesturing, setIsGesturing] = useState(false);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<{ view: View; mid: Point; dist: number } | null>(null);
  const tapRef = useRef<{ start: Point; moved: boolean; lastTapAt: number }>({
    start: { x: 0, y: 0 },
    moved: false,
    lastTapAt: 0,
  });

  // Clamps scale and keeps the image from being dragged off-screen.
  function apply(next: View) {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const rect = containerRef.current?.getBoundingClientRect();
    const maxX = rect ? ((scale - 1) * rect.width) / 2 : 0;
    const maxY = rect ? ((scale - 1) * rect.height) / 2 : 0;
    const clamped: View =
      scale === MIN_SCALE
        ? RESET
        : {
            scale,
            x: Math.min(maxX, Math.max(-maxX, next.x)),
            y: Math.min(maxY, Math.max(-maxY, next.y)),
          };
    viewRef.current = clamped;
    setView(clamped);
  }

  // Re-baselines the gesture whenever a finger is added or lifted, so going
  // from pinch to one-finger drag (or back) never makes the image jump.
  function startGesture() {
    const points = [...pointersRef.current.values()];
    if (points.length === 0) {
      gestureRef.current = null;
      return;
    }
    gestureRef.current = {
      view: viewRef.current,
      mid: points.length >= 2 ? midpoint(points[0], points[1]) : points[0],
      dist: points.length >= 2 ? distance(points[0], points[1]) : 0,
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setIsGesturing(true);
    if (pointersRef.current.size === 1) {
      tapRef.current.start = { x: event.clientX, y: event.clientY };
      tapRef.current.moved = false;
    } else {
      tapRef.current.moved = true;
    }
    startGesture();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    const points = [...pointersRef.current.values()];
    if (points.length === 1 && distance(points[0], tapRef.current.start) > TAP_SLOP_PX) {
      tapRef.current.moved = true;
    }

    if (points.length >= 2) {
      const mid = midpoint(points[0], points[1]);
      const ratio = gesture.dist > 0 ? distance(points[0], points[1]) / gesture.dist : 1;
      apply({
        scale: gesture.view.scale * ratio,
        x: gesture.view.x + (mid.x - gesture.mid.x),
        y: gesture.view.y + (mid.y - gesture.mid.y),
      });
    } else if (gesture.view.scale > MIN_SCALE) {
      apply({
        scale: gesture.view.scale,
        x: gesture.view.x + (points[0].x - gesture.mid.x),
        y: gesture.view.y + (points[0].y - gesture.mid.y),
      });
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.delete(event.pointerId)) return;
    if (pointersRef.current.size === 0) setIsGesturing(false);
    if (pointersRef.current.size === 0 && !tapRef.current.moved) {
      const now = Date.now();
      if (now - tapRef.current.lastTapAt < DOUBLE_TAP_MS) {
        apply(viewRef.current.scale > MIN_SCALE ? RESET : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 });
        tapRef.current.lastTapAt = 0;
      } else {
        tapRef.current.lastTapAt = now;
      }
    }
    startGesture();
  }

  // Desktop: mouse wheel / trackpad zoom.
  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const current = viewRef.current;
    apply({ ...current, scale: current.scale * Math.exp(-event.deltaY * 0.002) });
  }

  const isZoomed = view.scale > MIN_SCALE;

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden ${
        isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: isGesturing ? 'none' : 'transform 150ms ease-out',
        }}
      />
      {isZoomed ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => apply(RESET)}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          Reset
        </button>
      ) : (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/50 px-3 py-1 text-[11px] text-white">
          Pinch or double-tap to zoom
        </p>
      )}
    </div>
  );
}
