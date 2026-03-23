import path from 'path';
import fs from 'fs';

export interface ExtractedDocument {
  text: string;
  wordCount: number;
  sourceFormat: 'txt' | 'pdf' | 'docx';
  title?: string;
}

const SUPPORTED_MIMETYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function isSupportedDocumentType(mimetype: string): boolean {
  return SUPPORTED_MIMETYPES.includes(mimetype);
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimetype: string,
  originalFilename?: string
): Promise<ExtractedDocument> {
  if (mimetype === 'text/plain') {
    const text = buffer.toString('utf-8').trim();
    return {
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      sourceFormat: 'txt',
      title: originalFilename ? path.parse(originalFilename).name : undefined,
    };
  }

  if (mimetype === 'application/pdf') {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const result = await pdfParse(buffer);
    const text = result.text.trim();
    return {
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      sourceFormat: 'pdf',
      title: result.info?.Title || (originalFilename ? path.parse(originalFilename).name : undefined),
    };
  }

  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    return {
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      sourceFormat: 'docx',
      title: originalFilename ? path.parse(originalFilename).name : undefined,
    };
  }

  throw new Error(`Unsupported document type: ${mimetype}`);
}

export async function extractTextFromFile(filePath: string): Promise<ExtractedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const mimetype = mimeMap[ext];
  if (!mimetype) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }
  const buffer = fs.readFileSync(filePath);
  return extractTextFromBuffer(buffer, mimetype, path.basename(filePath));
}
