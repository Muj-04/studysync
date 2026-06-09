import type { TextNote, Bookmark } from '@/types';

interface ExportData {
  docName: string;
  pageTextNotes: Record<string, TextNote[]>;
  bookmarks: Bookmark[];
  docId: string;
}

// Build a sorted list of pages that have content
function collectPages(data: ExportData) {
  const prefix = `${data.docId}:`;
  const pages: Array<{ pageKey: string; pageNum: number; notes: TextNote[] }> = [];
  for (const [key, notes] of Object.entries(data.pageTextNotes)) {
    if (!key.startsWith(prefix) || !notes.length) continue;
    const sub = key.slice(prefix.length);
    const num = parseInt(sub, 10) || 0;
    pages.push({ pageKey: sub, pageNum: num, notes });
  }
  pages.sort((a, b) => a.pageNum - b.pageNum);
  return pages;
}

// ── PDF Export ────────────────────────────────────────────────────────────────

export async function exportAsPDF(data: ExportData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const W = 595;
  const marginX = 48;
  const maxW = W - marginX * 2;
  let y = 48;

  function addText(text: string, fontSize: number, color: [number, number, number], bold = false) {
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, maxW) as string[];
    lines.forEach((line: string) => {
      if (y > 780) { doc.addPage(); y = 48; }
      doc.text(line, marginX, y);
      y += fontSize * 1.5;
    });
  }

  // Header
  addText('StudySync', 10, [100, 110, 210], true);
  y += 4;
  addText(data.docName, 18, [20, 20, 40], true);
  y += 8;
  doc.setDrawColor(220, 220, 230);
  doc.line(marginX, y, W - marginX, y);
  y += 16;

  const pages = collectPages(data);
  if (pages.length === 0 && data.bookmarks.length === 0) {
    addText('No notes or bookmarks found.', 12, [120, 120, 140]);
  }

  for (const { pageNum, notes } of pages) {
    addText(`Page ${pageNum}`, 12, [89, 101, 217], true);
    y += 2;
    for (const note of notes) {
      addText(`• ${note.content}`, 11, [50, 50, 70]);
    }
    y += 10;
  }

  if (data.bookmarks.length > 0) {
    if (y > 740) { doc.addPage(); y = 48; }
    doc.setDrawColor(220, 220, 230);
    doc.line(marginX, y, W - marginX, y);
    y += 14;
    addText('Bookmarks', 13, [89, 101, 217], true);
    y += 4;
    for (const bm of data.bookmarks) {
      addText(`• ${bm.label || `Page ${bm.virtualIndex + 1}`}`, 11, [50, 50, 70]);
    }
  }

  doc.save(`${data.docName} - Notes.pdf`);
}

// ── Word (.docx) Export ───────────────────────────────────────────────────────

export async function exportAsDocx(data: ExportData): Promise<void> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  type DocxParagraph = InstanceType<typeof Paragraph>;

  const children: DocxParagraph[] = [];

  // Header
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'StudySync', color: '5965D9', size: 18, bold: true })],
    }),
    new Paragraph({
      text: data.docName,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
  );

  const pages = collectPages(data);
  if (pages.length === 0 && data.bookmarks.length === 0) {
    children.push(new Paragraph({ text: 'No notes or bookmarks found.' }));
  }

  for (const { pageNum, notes } of pages) {
    children.push(
      new Paragraph({
        text: `Page ${pageNum}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
      }),
    );
    for (const note of notes) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: note.content, size: 22 })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
      );
    }
  }

  if (data.bookmarks.length > 0) {
    children.push(
      new Paragraph({
        text: 'Bookmarks',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 80 },
      }),
    );
    for (const bm of data.bookmarks) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: bm.label || `Page ${bm.virtualIndex + 1}`, size: 22 })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
      );
    }
  }

  // Footer
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 480 },
      children: [new TextRun({ text: `Exported from StudySync — ${new Date().toLocaleDateString()}`, color: '999999', size: 18 })],
    }),
  );

  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.docName} - Notes.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
