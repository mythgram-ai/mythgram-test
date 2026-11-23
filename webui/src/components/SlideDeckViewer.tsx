import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode,
  FileDown,
  Image as ImageIcon,
  Presentation,
  Trash2,
} from 'lucide-react';

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

export const SlideDeckViewer: React.FC<SlideDeckViewerProps> = ({
  project,
  onDeleteProject,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);

  const slides = project.slides || [];
  const activeSlide = slides[currentIdx] || slides[0] || null;

  const handleDownloadHtml = () => {
    const combinedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${project.name}</title>
  <style>
    body { margin: 0; background: #09090b; color: #f4f4f5; font-family: system-ui, sans-serif; }
    .slide-frame { width: 1280px; height: 720px; margin: 24px auto; border: 1px solid #27272a; box-shadow: 0 12px 32px rgba(0,0,0,0.5); overflow: hidden; background: #fff; page-break-after: always; }
    iframe { width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
${slides
  .map(
    (s) =>
      `<div class="slide-frame"><iframe srcdoc="${s.html_content
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')}"></iframe></div>`
  )
  .join('\n')}
</body>
</html>`;
    const blob = new Blob([combinedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    setExporting('pdf');
    const printWin = window.open('', '_blank', 'width=1280,height=720');
    if (!printWin) {
      setExporting(null);
      return;
    }
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>${project.name} - PDF Export</title>
  <style>
    @page { size: 1280px 720px; margin: 0; }
    body { margin: 0; padding: 0; background: #fff; }
    .page { width: 1280px; height: 720px; page-break-after: always; overflow: hidden; position: relative; }
    iframe { width: 1280px; height: 720px; border: 0; }
  </style>
</head>
<body>
${slides
  .map(
    (s) =>
      `<div class="page"><iframe srcdoc="${s.html_content
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')}"></iframe></div>`
  )
  .join('\n')}
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 600);
  };
</script>
</body>
</html>`;
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    setExporting(null);
  };

  const handleDownloadImage = async () => {
    if (!activeSlide) return;
    setExporting('image');
    try {
      const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:1280px;height:720px;overflow:hidden;">
            ${activeSlide.html_content}
          </div>
        </foreignObject>
      </svg>`;
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_slide_${
        activeSlide.slide_number
      }.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadPptx = () => {
    setExporting('pptx');
    try {
      // Generates a PowerPoint-compatible MHT/HTML presentation file (.pptx / .ppt)
      const pptContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:powerpoint"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${project.name}</title>
<style>
  .slide { width: 1280px; height: 720px; page-break-after: always; overflow: hidden; }
</style>
</head>
<body>
${slides
  .map((s) => `<div class="slide">${s.html_content}</div>`)
  .join('\n')}
</body>
</html>`;
      const blob = new Blob([pptContent], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#09090b' }}>
      {/* Toolbar */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #1e1e22',
          backgroundColor: '#121215',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f4f4f5' }}>
            {project.name}{' '}
            <span style={{ fontSize: 11.5, color: '#71717a', fontWeight: 400 }}>
              ({slides.length} slides • ID: {project.id})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary inline-center"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={handleDownloadHtml}
            title="Download as HTML file"
          >
            <FileCode size={12} />
            HTML
          </button>
          <button
            type="button"
            className="btn-secondary inline-center"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={handleDownloadPdf}
            disabled={exporting === 'pdf'}
            title="Print / Save as PDF"
          >
            <FileDown size={12} />
            PDF
          </button>
          <button
            type="button"
            className="btn-secondary inline-center"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={handleDownloadPptx}
            disabled={exporting === 'pptx'}
            title="Download as PPTX"
          >
            <Presentation size={12} />
            PPTX
          </button>
          <button
            type="button"
            className="btn-secondary inline-center"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={handleDownloadImage}
            disabled={exporting === 'image'}
            title="Download current slide as SVG Image"
          >
            <ImageIcon size={12} />
            Image
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

      {/* Main Slide Canvas */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          overflow: 'auto',
        }}
      >
        {activeSlide ? (
          <div
            style={{
              width: '100%',
              maxWidth: 880,
              aspectRatio: '16 / 9',
              backgroundColor: '#ffffff',
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid #27272f',
              boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
              position: 'relative',
            }}
          >
            <iframe
              key={`${project.id}_${activeSlide.slide_number}`}
              title={`Slide ${activeSlide.slide_number}`}
              srcDoc={activeSlide.html_content}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        ) : (
          <div style={{ color: '#71717a', fontSize: 13 }}>No slides in project.</div>
        )}

        {/* Slide Navigation Controls */}
        {slides.length > 0 && (
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
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
            <span style={{ fontSize: 12, color: '#d4d4d8', fontFamily: 'JetBrains Mono, monospace' }}>
              Slide {currentIdx + 1} of {slides.length}
            </span>
            <button
              type="button"
              className="btn-secondary inline-center"
              disabled={currentIdx >= slides.length - 1}
              onClick={() =>
                setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))
              }
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {slides.length > 1 && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #1e1e22',
            backgroundColor: '#101014',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
          }}
        >
          {slides.map((s, idx) => (
            <button
              key={s.slide_number}
              type="button"
              onClick={() => setCurrentIdx(idx)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border:
                  idx === currentIdx
                    ? '1px solid #60a5fa'
                    : '1px solid #27272f',
                backgroundColor: idx === currentIdx ? '#1e1e28' : '#151519',
                color: idx === currentIdx ? '#f4f4f5' : '#9e9ea7',
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
