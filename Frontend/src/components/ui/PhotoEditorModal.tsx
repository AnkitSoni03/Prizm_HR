import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

// Square viewport the user drags/zooms within — output is rasterized at
// OUTPUT_SIZE regardless of viewport size, so this can shrink on small
// screens without touching crop math (only VIEWPORT itself, and the ratio
// stays 1:1 either way).
const VIEWPORT = 280;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface Offset {
  x: number;
  y: number;
}

interface PhotoEditorModalProps {
  // Object/data URL of the source image (from a file picker or a camera
  // capture) — never uploaded as-is, always re-rasterized through Save.
  imageSrc: string;
  onCancel: () => void;
  onSave: (file: File) => void;
}

// Dependency-free crop/zoom editor: drag to pan, slider to zoom, circular
// guide matching Avatar's rounded-full rendering. The live preview is pure
// CSS (transform on an <img>, no canvas redraw per frame) — canvas only
// gets involved once, at Save, to rasterize exactly what's inside the
// circle into a fixed-size square JPEG.
export function PhotoEditorModal({ imageSrc, onCancel, onSave }: PhotoEditorModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragStateRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Scale at which the image exactly covers the (square) viewport with no
  // gaps, at zoom === 1 — the slider's zoom multiplies on top of this.
  const coverScale = useMemo(() => {
    if (!naturalSize) return 1;
    return Math.max(VIEWPORT / naturalSize.width, VIEWPORT / naturalSize.height);
  }, [naturalSize]);

  function clamp(nextOffset: Offset, nextZoom: number): Offset {
    if (!naturalSize) return nextOffset;
    const displayedWidth = naturalSize.width * coverScale * nextZoom;
    const displayedHeight = naturalSize.height * coverScale * nextZoom;
    const maxX = Math.max(0, (displayedWidth - VIEWPORT) / 2);
    const maxY = Math.max(0, (displayedHeight - VIEWPORT) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    };
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { pointerX: event.clientX, pointerY: event.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStateRef.current;
    if (!start) return;
    const nextOffset = {
      x: start.offsetX + (event.clientX - start.pointerX),
      y: start.offsetY + (event.clientY - start.pointerY),
    };
    setOffset(clamp(nextOffset, zoom));
  }

  function handlePointerUp() {
    dragStateRef.current = null;
  }

  function handleZoomChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextZoom = Number(event.target.value);
    setZoom(nextZoom);
    setOffset((prev) => clamp(prev, nextZoom));
  }

  function handleReset() {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }

  function handleSave() {
    const img = imgRef.current;
    if (!img || !naturalSize) return;
    setIsSaving(true);

    const displayedWidth = naturalSize.width * coverScale * zoom;
    const displayedHeight = naturalSize.height * coverScale * zoom;
    // Top-left corner of the displayed image, in viewport-pixel coordinates
    // — mirrors the live preview's `left/top: 50%` + `translate(-50% + offset)`
    // transform exactly, so Save always crops what's actually visible.
    const imgLeft = (VIEWPORT - displayedWidth) / 2 + offset.x;
    const imgTop = (VIEWPORT - displayedHeight) / 2 + offset.y;
    const outputScale = OUTPUT_SIZE / VIEWPORT;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsSaving(false);
      return;
    }
    ctx.drawImage(
      img,
      imgLeft * outputScale,
      imgTop * outputScale,
      displayedWidth * outputScale,
      displayedHeight * outputScale
    );
    canvas.toBlob(
      (blob) => {
        setIsSaving(false);
        if (!blob) return;
        onSave(new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  }

  return (
    <Modal title="Adjust Photo" onClose={onCancel} widthClassName="max-w-sm">
      <div className="space-y-4">
        <div
          className="relative mx-auto touch-none overflow-hidden rounded-lg bg-black"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {naturalSize && (
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Selected for crop"
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute left-1/2 top-1/2 max-w-none cursor-grab select-none active:cursor-grabbing"
              style={{
                width: naturalSize.width * coverScale * zoom,
                height: naturalSize.height * coverScale * zoom,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          {!naturalSize && (
            <img src={imageSrc} alt="" className="hidden" onLoad={handleImageLoad} />
          )}
          {/* Circular crop guide — the huge box-shadow darkens everything
              outside the circle; the parent's overflow-hidden clips that
              shadow down to just the viewport. */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-1 ring-white/70" />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={handleZoomChange}
            disabled={!naturalSize}
            className="h-1.5 flex-1 cursor-pointer accent-primary"
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={handleReset}
            title="Reset"
            aria-label="Reset zoom and position"
            className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-xs text-ink-muted">Drag to reposition, use the slider to zoom.</p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} isLoading={isSaving} disabled={!naturalSize}>
            Save Photo
          </Button>
        </div>
      </div>
    </Modal>
  );
}
