'use client';
import { ExternalLink, FileWarning } from 'lucide-react';
import type { PDFDocument } from '@/types';

interface Props {
  document: PDFDocument;
}

export default function PPTXViewer({ document: _doc }: Props) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    }}>
      <div style={{
        maxWidth: 460,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        <div style={{
          width: 56, height: 56,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileWarning size={24} style={{ color: 'var(--text-2)' }} />
        </div>

        <div>
          <p style={{
            fontSize: 15, fontWeight: 600,
            color: 'var(--text-1)',
            marginBottom: 10,
          }}>
            PowerPoint preview not available
          </p>
          <p style={{
            fontSize: 13, color: 'var(--text-2)',
            lineHeight: 1.75,
          }}>
            For best results, please convert your PowerPoint to PDF first.
            You can use <strong style={{ color: 'var(--text-1)' }}>ilovepdf.com</strong> or{' '}
            <strong style={{ color: 'var(--text-1)' }}>File → Export → PDF</strong> in PowerPoint.
          </p>
        </div>

        <a
          href="https://www.ilovepdf.com/powerpoint-to-pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 18px',
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s',
            fontFamily: 'inherit',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--accent-hover)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--accent)' })}
        >
          <ExternalLink size={13} />
          Convert on ilovepdf.com
        </a>

        <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
          After converting, upload the PDF file here.
        </p>
      </div>
    </div>
  );
}
