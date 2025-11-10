import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { Readable } from 'stream';
import type { VisualizationData } from '../../shared/types/visualization';

/**
 * DocumentExporter - Exports content to various document formats
 * 
 * Converts markdown/text content into professional document formats
 * suitable for distribution and archival.
 */
export class DocumentExporter {
  /**
   * Convert visualization data to a markdown table
   */
  private static visualizationToMarkdown(viz: VisualizationData): string {
    if (!viz || !viz.data || viz.data.length === 0) {
      return '';
    }

    let markdown = '\n\n';
    if (viz.title) {
      markdown += `## ${viz.title}\n\n`;
    }

    // Get all unique keys from the data
    const allKeys = Array.from(
      new Set(viz.data.flatMap(obj => Object.keys(obj)))
    );

    // Create table header
    markdown += '| ' + allKeys.join(' | ') + ' |\n';
    markdown += '|' + allKeys.map(() => '---').join('|') + '|\n';

    // Create table rows
    for (const row of viz.data) {
      markdown += '| ' + allKeys.map(key => {
        const value = row[key];
        if (typeof value === 'number') {
          return value.toLocaleString();
        }
        return value || '';
      }).join(' | ') + ' |\n';
    }

    return markdown + '\n';
  }
  /**
   * Export content to DOCX format
   */
  static async exportToDocx(content: string, title: string = 'Luca Output'): Promise<Buffer> {
    const lines = content.split('\n');
    const paragraphs: Paragraph[] = [];

    // Add title
    paragraphs.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
      })
    );

    // Process content
    for (const line of lines) {
      if (line.trim().startsWith('# ')) {
        paragraphs.push(
          new Paragraph({
            text: line.replace(/^#\s+/, ''),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (line.trim().startsWith('## ')) {
        paragraphs.push(
          new Paragraph({
            text: line.replace(/^##\s+/, ''),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 150, after: 100 },
          })
        );
      } else if (line.trim().startsWith('### ')) {
        paragraphs.push(
          new Paragraph({
            text: line.replace(/^###\s+/, ''),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 100, after: 50 },
          })
        );
      } else if (line.trim()) {
        // Regular text with basic markdown formatting
        const runs: TextRun[] = [];
        let text = line;
        
        // Handle bold (**text** or __text__)
        text = text.replace(/\*\*(.*?)\*\*/g, (_, content) => {
          runs.push(new TextRun({ text: content, bold: true }));
          return '\u0000'; // placeholder
        });
        
        // Handle italic (*text* or _text_)
        text = text.replace(/\*(.*?)\*/g, (_, content) => {
          runs.push(new TextRun({ text: content, italics: true }));
          return '\u0000';
        });
        
        // Handle remaining text
        const parts = text.split('\u0000');
        const finalRuns: TextRun[] = [];
        let runIndex = 0;
        
        for (let i = 0; i < parts.length; i++) {
          if (parts[i]) {
            finalRuns.push(new TextRun({ text: parts[i] }));
          }
          if (i < parts.length - 1 && runIndex < runs.length) {
            finalRuns.push(runs[runIndex++]);
          }
        }
        
        paragraphs.push(
          new Paragraph({
            children: finalRuns.length > 0 ? finalRuns : [new TextRun({ text: line })],
            spacing: { after: 100 },
          })
        );
      } else {
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });

    const { Packer } = await import('docx');
    return await Packer.toBuffer(doc);
  }

  /**
   * Export content to PDF format
   */
  static async exportToPdf(content: string, title: string = 'Luca Output'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add title
      doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'left' });
      doc.moveDown();

      // Process content
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('# ')) {
          doc.moveDown(0.5);
          doc.fontSize(18).font('Helvetica-Bold').text(line.replace(/^#\s+/, ''));
          doc.moveDown(0.3);
        } else if (line.trim().startsWith('## ')) {
          doc.moveDown(0.4);
          doc.fontSize(16).font('Helvetica-Bold').text(line.replace(/^##\s+/, ''));
          doc.moveDown(0.2);
        } else if (line.trim().startsWith('### ')) {
          doc.moveDown(0.3);
          doc.fontSize(14).font('Helvetica-Bold').text(line.replace(/^###\s+/, ''));
          doc.moveDown(0.2);
        } else if (line.trim()) {
          doc.fontSize(11).font('Helvetica').text(line, { align: 'left' });
        } else {
          doc.moveDown(0.5);
        }
      }

      doc.end();
    });
  }

  /**
   * Export content to PowerPoint format
   */
  static async exportToPptx(content: string, title: string = 'Luca Output'): Promise<Buffer> {
    const pptx = new PptxGenJS();
    
    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.addText(title, {
      x: 0.5,
      y: 2,
      w: 9,
      h: 1.5,
      fontSize: 44,
      bold: true,
      color: '363636',
      align: 'center',
    });
    titleSlide.addText('Generated by Luca', {
      x: 0.5,
      y: 3.5,
      w: 9,
      h: 0.5,
      fontSize: 18,
      color: '666666',
      align: 'center',
    });

    // Process content into slides
    const sections: { heading: string; content: string[] }[] = [];
    let currentSection: { heading: string; content: string[] } | null = null;

    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('# ') || line.trim().startsWith('## ')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          heading: line.replace(/^#{1,2}\s+/, ''),
          content: [],
        };
      } else if (currentSection && line.trim()) {
        currentSection.content.push(line.trim());
      }
    }
    if (currentSection) {
      sections.push(currentSection);
    }

    // Create slides for each section
    for (const section of sections) {
      const slide = pptx.addSlide();
      
      // Add heading
      slide.addText(section.heading, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: '363636',
      });

      // Add content
      const contentText = section.content.join('\n');
      slide.addText(contentText, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 4.5,
        fontSize: 18,
        color: '444444',
        valign: 'top',
      });
    }

    return await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  }

  /**
   * Export content to Excel format
   */
  static async exportToExcel(content: string, title: string = 'Luca Output'): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Output');

    // Set column widths
    worksheet.columns = [
      { width: 80 },
    ];

    // Add title
    const titleRow = worksheet.addRow([title]);
    titleRow.font = { bold: true, size: 16 };
    titleRow.height = 25;
    worksheet.addRow([]);

    // Add content line by line
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('# ')) {
        const row = worksheet.addRow([line.replace(/^#\s+/, '')]);
        row.font = { bold: true, size: 14 };
        row.height = 20;
      } else if (line.trim().startsWith('## ')) {
        const row = worksheet.addRow([line.replace(/^##\s+/, '')]);
        row.font = { bold: true, size: 12 };
        row.height = 18;
      } else if (line.trim()) {
        worksheet.addRow([line]);
      } else {
        worksheet.addRow(['']);
      }
    }

    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  /**
   * Export content to specified format
   */
  static async export(options: {
    content: string;
    visualization?: VisualizationData;
    format: 'docx' | 'pdf' | 'pptx' | 'xlsx';
    title?: string;
  }): Promise<Buffer> {
    const { content, visualization, format, title } = options;
    
    // Combine content with visualization table if present
    let fullContent = content;
    if (visualization) {
      fullContent += this.visualizationToMarkdown(visualization);
    }
    
    switch (format) {
      case 'docx':
        return this.exportToDocx(fullContent, title);
      case 'pdf':
        return this.exportToPdf(fullContent, title);
      case 'pptx':
        return this.exportToPptx(fullContent, title);
      case 'xlsx':
        return this.exportToExcel(fullContent, title);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
