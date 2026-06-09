'use client';
import { useCallback, useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { validatePdfOrPptx } from '@/lib/fileValidation';

interface Props {
  onFilesAdded: (files: File[]) => void;
  compact?: boolean;
}

export default function PDFUploader({ onFilesAdded, compact = false }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      setUploadError(null);
      const results = await Promise.all(
        Array.from(files).map(async (f) => {
          const r = await validatePdfOrPptx(f);
          return { file: f, result: r };
        }),
      );
      const rejected = results.filter((r) => !r.result.valid);
      const accepted  = results.filter((r) => r.result.valid).map((r) => r.file);
      if (rejected.length > 0) {
        setUploadError(rejected[0].result.error ?? 'Invalid file.');
      }
      if (accepted.length > 0) onFilesAdded(accepted);
    },
    [onFilesAdded],
  );

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current += 1; setIsDragging(true); };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDragging(false); };
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  if (compact) {
    return (
      <label
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          borderRadius: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-2)',
          fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.15s',
          userSelect: 'none',
        }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, {
          background: 'var(--bg-active)',
          color: 'var(--text-1)',
          borderColor: 'var(--border-strong)',
          transform: 'scale(1.03)',
        })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, {
          background: 'var(--bg-elevated)',
          color: 'var(--text-2)',
          borderColor: 'var(--border)',
          transform: 'scale(1)',
        })}
      >
        <Upload size={12} />
        Add file
        <input
          type="file"
          accept=".pdf,.pptx"
          multiple style={{ display: 'none' }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />
      </label>
    );
  }

  return (
    <div
      className="animate-fade-in"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16,
        padding: '40px 32px',
        borderRadius: 4,
        border: `1.5px dashed ${isDragging ? 'var(--accent)' : 'var(--border-strong)'}`,
        background: isDragging ? 'var(--accent-muted)' : 'var(--bg-elevated)',
        cursor: 'pointer',
        userSelect: 'none',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: 'border-color 0.18s, background 0.18s, transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div style={{
        width: 44, height: 44,
        background: isDragging ? 'var(--accent-muted)' : 'var(--bg-active)',
        border: `1px solid ${isDragging ? 'rgba(89,101,217,.3)' : 'var(--border)'}`,
        borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: isDragging ? 'scale(1.12)' : 'scale(1)',
        transition: 'background 0.18s, border-color 0.18s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <FileText size={20} style={{ color: isDragging ? 'var(--accent-hover)' : 'var(--text-2)', transition: 'color 0.18s' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', marginBottom: 4 }}>
          Drop files here or{' '}
          <span style={{ color: 'var(--accent-hover)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            browse
          </span>
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>PDF and PPTX • max 50 MB</p>
      </div>

      {uploadError && (
        <p style={{ fontSize: 12, color: 'var(--red, #ef4444)', margin: 0, textAlign: 'center' }}>
          {uploadError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.pptx"
        multiple style={{ display: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
