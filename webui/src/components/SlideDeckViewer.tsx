import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  EXPORT_FORMATS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  buildDeckArchive,
  buildDeckPdf,
  buildDeckPptx,
  buildSlideSvg,
  downloadBlob,
  renderSlideToJpegBlob,
  renderSlideToPngBlob,
  safeFileName,
  type ExportableSlide,
  type SlideExportFormat,
} from '../lib/slideExport';

export interface SlideItemData {
  slide_number: number;
  html_file_path: string;
  html_content: string;
}

export interface SlideProjectData {
  id: string;
  name: string;
  session_id?: string;
  slides_count: number;
  slides: SlideItemData[];
  created_at: number;
  updated_at: number;
}

interface SlideDeckViewerProps {
  project: SlideProjectData;
  onDeleteProject?: (id: string) => void;
}

const MIN_SCALE = 0.1;

export const SlideDeckViewer: React.FC<SlideDeckViewerProps> = ({
  project,
  onDeleteProject,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [exportFormat, setExportFormat] = useState<SlideExportFormat>('png');
  const [busy, setBusy] = useState<'all' | 'current' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const slides = useMemo(
    () => [...(project.slides || [])].sort((a, b) => a.slide_number - b.slide_number),
    [project.slides]
  );
  const activeSlide = slides[currentIdx] || slides[0] || null;

  // Keep the active slide in range when the deck changes underneath us.
  useEffect(() => {
    setCurrentIdx(0);
  }, [project.id]);

  // Scale the fixed 1280x720 slide stage to fit the available space while
  // preserving its exact aspect ratio. The iframe itself always remains a true
  // 1280x720 viewport, so slide layouts never get cropped.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return;
      const fitted = Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT, 1);
      setScale(fitted > MIN_SCALE ? fitted : MIN_SCALE);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const formatMeta = useMemo(
    () => EXPORT_FORMATS.find((f) => f.value === exportFormat) || EXPORT_FORMATS[0],
    [exportFormat]
  );

  const runExport = async (scope: 'all' | 'current') => {
    if (slides.length === 0 || busy) return;
    setBusy(scope);
    setError(null);
    setProgress(null);
    try {
      if (scope === 'current') {
        await exportCurrentSlide();
      } else {
        const onProgress = (done: number, total: number) => setProgress({ done, total });
        const { blob, fileName } = await buildDeckArchive(
          exportFormat,
          { id: project.id, name: project.name },
          slides,
          onProgress
        );
        downloadBlob(blob, fileName);
      }
    } catch (err: any) {
      setError(err?.message || 'Export failed.');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const exportCurrentSlide = async () => {
    if (!activeSlide) return;
    const base = safeFileName(project.name);
    const name = `${base}_slide_${String(activeSlide.slide_number).padStart(2, '0')}`;
    const single: ExportableSlide[] = [
      { slide_number: activeSlide.slide_number, html_content: activeSlide.html_content },
    ];

    if (exportFormat === 'png') {
      downloadBlob(await renderSlideToPngBlob(activeSlide.html_content, 1), `${name}.png`);
    } else if (exportFormat === 'jpeg') {
      downloadBlob(await renderSlideToJpegBlob(activeSlide.html_content, 1), `${name}.jpg`);
    } else if (exportFormat === 'svg') {
      const svg = await buildSlideSvg(activeSlide.html_content);
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`);
    } else if (exportFormat === 'html') {
      downloadBlob(
        new Blob([activeSlide.html_content], { type: 'text/html;charset=utf-8' }),
        `${name}.html`
      );
    } else if (exportFormat === 'pdf') {
      const blob = await buildDeckPdf(single, (done, total) => setProgress({ done, total }));
      downloadBlob(blob, `${name}.pdf`);
    } else if (exportFormat === 'pptx') {
      const blob = await buildDeckPptx(project.name, single, (done, total) =>
        setProgress({ done, total })
      );
      downloadBlob(blob, `${name}.pptx`);
    }
  };

  const busyLabel =
    busy === 'all'
      ? `Exporting ${formatMeta.label}...`
      : busy === 'current'
      ? `Exporting this slide...`
      : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#000000' }}>
      {/* Toolbar */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #1f1f1f',
          backgroundColor: '#000000',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ededed' }}>
            {project.name}{' '}
            <span style={{ fontSize: 11.5, color: '#7d7d7d', fontWeight: 400 }}>
              ({slides.length} slides • ID: {project.id})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#a1a1a1' }}
            title="Choose the export format"
          >
            Format
            <select
              className="input-field"
              style={{ padding: '4px 8px', fontSize: 11.5, width: 'auto', minWidth: 118 }}
              value={exportFormat}
              disabled={!!busy}
              onChange={(e) => setExportFormat(e.target.value as SlideExportFormat)}
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary inline-center"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={() => runExport('current')}
            disabled={!!busy || !activeSlide}
            title={`Download the current slide as ${formatMeta.label}`}
          >
            <FileDown size={12} />
            This slide
          </button>
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '4px 10px', fontSize: 11.5, minHeight: 26 }}
            onClick={() => runExport('all')}
            disabled={!!busy || slides.length === 0}
            title={`Download all ${slides.length} slides as ${formatMeta.label} in one ZIP file`}
          >
            {busy ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
            Download all (.zip)
          </button>
          {onDeleteProject && (
            <button
              type="button"
              className="btn-secondary inline-center"
              style={{ padding: '4px 9px', fontSize: 11.5, color: '#f87171' }}
              onClick={() => onDeleteProject(project.id)}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {(busyLabel || error) && (
        <div
          style={{
            padding: '6px 14px',
            fontSize: 11.5,
            color: error ? '#f87171' : '#a1a1a1',
            backgroundColor: error ? '#191919' : '#000000',
            borderBottom: '1px solid #1f1f1f',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {busyLabel}
          {progress && (
            <span style={{ color: '#ededed' }}>
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
      )}

      {/* Main Slide Stage */}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          overflow: 'hidden',
        }}
      >
        {activeSlide ? (
          <div
            style={{
              width: SLIDE_WIDTH * scale,
              height: SLIDE_HEIGHT * scale,
              position: 'relative',
              backgroundColor: '#ededed',
              borderRadius: Math.max(2, 8 * scale),
              overflow: 'hidden',
              border: '1px solid #262626',
              boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
              flexShrink: 0,
            }}
          >
            <iframe
              key={`${project.id}_${activeSlide.slide_number}`}
              title={`Slide ${activeSlide.slide_number}`}
              srcDoc={activeSlide.html_content}
              width={SLIDE_WIDTH}
              height={SLIDE_HEIGHT}
              style={{
                width: SLIDE_WIDTH,
                height: SLIDE_HEIGHT,
                border: 'none',
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                backgroundColor: '#ededed',
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        ) : (
          <div style={{ color: '#7d7d7d', fontSize: 13 }}>No slides in project.</div>
        )}
      </div>

      {/* Slide Navigation Controls */}
      {slides.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '4px 16px 8px',
          }}
        >
          <button
            type="button"
            className="btn-secondary inline-center"
            disabled={currentIdx <= 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <span style={{ fontSize: 12, color: '#d4d4d4', fontFamily: 'JetBrains Mono, monospace' }}>
            Slide {currentIdx + 1} of {slides.length}
          </span>
          <button
            type="button"
            className="btn-secondary inline-center"
            disabled={currentIdx >= slides.length - 1}
            onClick={() => setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Bottom Thumbnail Strip */}
      {slides.length > 1 && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #1f1f1f',
            backgroundColor: '#000000',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
          }}
        >
          {slides.map((s, idx) => (
            <button
              key={`${s.slide_number}_${idx}`}
              type="button"
              onClick={() => setCurrentIdx(idx)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: idx === currentIdx ? '1px solid #ededed' : '1px solid #262626',
                backgroundColor: idx === currentIdx ? '#191919' : '#0a0a0a',
                color: idx === currentIdx ? '#ededed' : '#a1a1a1',
                fontSize: 11.5,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Slide #{s.slide_number}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
