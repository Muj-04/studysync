'use client';
import { useCallback, useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';

interface Props {
  onFilesAdded: (files: File[]) => void;
  compact?: boolean;
}

export default function PDFUploader({ onFilesAdded, compact = false }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const pdfs = Array.from(files).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfs.length > 0) onFilesAdded(pdfs);
    },
    [onFilesAdded]
  );

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current += 1; setIsDragging(true); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDragging(false); };
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  if (compact) {
    return (
      <label
        className="flex items-center gap-1.5 text-xs font-semibold rounded-full cursor-pointer"
        style={{
          padding: '6px 14px',
          background: 'rgba(255,255,255,0.92)',
          color: '#0f172a',
          boxShadow: '0 1px 6px rgba(0,0,0,0.2)',
          transition: 'background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
        }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, {
          background: '#fff',
          boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
          transform: 'translateY(-1px)',
        })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, {
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 6px rgba(0,0,0,0.2)',
          transform: 'translateY(0)',
        })}
      >
        <Upload size={12} />
        Add PDF
        <input type="file" accept=".pdf,application/pdf" multiple className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      </label>
    );
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer select-none"
      style={{
        padding: '3rem 2.5rem',
        background: isDragging ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `2px dashed ${isDragging ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)'}`,
        transform: isDragging ? 'scale(1.015)' : 'scale(1)',
        boxShadow: isDragging ? '0 12px 40px rgba(0,0,0,0.25)' : 'none',
        transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <div
        className="p-4 rounded-2xl"
        style={{
          background: isDragging ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.22)',
          transition: 'background 0.2s ease',
        }}
      >
        <FileText size={30} className="text-white" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-semibold text-white leading-snug">
          Drop PDFs here or{' '}
          <span style={{ textDecoration: 'underline', opacity: 0.75, textUnderlineOffset: 3 }}>browse</span>
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Supports multiple files</p>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
