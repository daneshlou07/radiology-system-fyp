import React, { useState, useEffect, useRef } from 'react';
import { loadImages } from '../../services/imageStorage';
import { getDemoScanImage } from '../../utils/demoScanFallback';
import type { Case } from '../../types';
import type { VisionAiAnalysisResult } from '../../services/visionAiAnalyzer';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react';

interface Props {
  imageKeys?: string[];
  /** Raw base64/blob preview URLs to show before images are saved to IndexedDB */
  previewUrls?: string[];
  heightClass?: string;
  caseItem?: Case;
  onAiAnalyzed?: (result: VisionAiAnalysisResult) => void;
}

export type HounsfieldPreset = 'DEFAULT' | 'LUNG' | 'BONE' | 'SOFT_TISSUE' | 'BRAIN';
export type MriSequence = 'T1' | 'T2' | 'FLAIR' | 'DWI';

export default function PacsImageViewer({
  imageKeys,
  previewUrls,
  heightClass = 'h-[480px]',
  caseItem,
}: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setCurrentIndex(0);
    setImgError(false);

    const fallbackUrl = getDemoScanImage(caseItem);

    if (previewUrls && previewUrls.length > 0) {
      setUrls(previewUrls);
      return;
    }

    if (!imageKeys || imageKeys.length === 0) {
      setUrls(fallbackUrl ? [fallbackUrl] : []);
      return;
    }

    setLoading(true);
    loadImages(imageKeys)
      .then((loaded) => {
        if (!active) return;
        if (loaded.length > 0) {
          setUrls(loaded);
        } else {
          setUrls(fallbackUrl ? [fallbackUrl] : []);
        }
      })
      .catch(() => {
        if (active) setUrls(fallbackUrl ? [fallbackUrl] : []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [imageKeys, previewUrls, caseItem?.id]);

  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const currentUrl = urls[currentIndex] || '';

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-surface-200 bg-white overflow-hidden flex flex-col"
    >
      {/* Simple Toolbar */}
      <div className="px-3 py-2 bg-surface-50 border-b border-surface-200 flex flex-wrap items-center justify-between gap-2 text-xs text-surface-700">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            disabled={!currentUrl}
            className="p-1.5 rounded hover:bg-surface-200 disabled:opacity-40"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-11 text-center font-mono text-[11px]">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            disabled={!currentUrl}
            className="p-1.5 rounded hover:bg-surface-200 disabled:opacity-40"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            disabled={!currentUrl}
            className="p-1.5 rounded hover:bg-surface-200 disabled:opacity-40"
            title="Rotate 90 degrees"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            disabled={!currentUrl}
            className="p-1.5 rounded hover:bg-surface-200 disabled:opacity-40"
            title="Reset view"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-surface-600">
            <span>Brightness</span>
            <input
              type="range"
              min={50}
              max={150}
              value={brightness}
              disabled={!currentUrl}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-16 accent-[#0F4C42]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-surface-600">
            <span>Contrast</span>
            <input
              type="range"
              min={50}
              max={150}
              value={contrast}
              disabled={!currentUrl}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="w-16 accent-[#0F4C42]"
            />
          </label>
          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={!currentUrl}
            className="p-1.5 rounded hover:bg-surface-200 disabled:opacity-40"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Image Viewport */}
      <div
        className={`relative w-full ${isFullscreen ? 'flex-1' : heightClass} bg-[#111827] flex items-center justify-center overflow-hidden select-none`}
      >
        {loading ? (
          <p className="text-xs text-slate-400">Loading scan image...</p>
        ) : !currentUrl || imgError ? (
          <div className="flex flex-col items-center gap-2 text-slate-400 px-4 text-center">
            <ImageIcon className="w-7 h-7 opacity-60" />
            <p className="text-xs">No scan image available for this case.</p>
          </div>
        ) : (
          <img
            src={currentUrl}
            alt={`Scan ${currentIndex + 1}`}
            onError={() => setImgError(true)}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              filter: `brightness(${brightness}%) contrast(${contrast}%)`,
            }}
            className="max-w-full max-h-full object-contain transition-transform duration-150"
            draggable={false}
          />
        )}

        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => {
                setImgError(false);
                setCurrentIndex((i) => (i - 1 + urls.length) % urls.length);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setImgError(false);
                setCurrentIndex((i) => (i + 1) % urls.length);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-mono">
              {currentIndex + 1} / {urls.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail Strip */}
      {urls.length > 1 && (
        <div className="p-2 bg-surface-50 border-t border-surface-200 flex items-center gap-2 overflow-x-auto">
          {urls.map((src, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setImgError(false);
                setCurrentIndex(idx);
              }}
              className={`w-12 h-12 rounded overflow-hidden border shrink-0 ${
                idx === currentIndex ? 'border-emerald-400' : 'border-surface-200 opacity-70 hover:opacity-100'
              }`}
            >
              <img src={src} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
