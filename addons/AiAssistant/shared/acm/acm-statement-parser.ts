/** 从 ACM 结构化题面 Markdown 解析章节（与 IDE 样例提取约定对齐） */

import type { ACMProblemExample, ACMProblemImage } from './acm-assistant.types';

export type ParsedAcmStatement = {
  description?: string;
  inputDescription?: string;
  outputDescription?: string;
  dataRangeText?: string;
  examples: ACMProblemExample[];
  images: ACMProblemImage[];
  rawMarkdown: string;
};

const SECTION_ALIASES: Record<string, keyof Omit<ParsedAcmStatement, 'examples' | 'images' | 'rawMarkdown'>> = {
  题目描述: 'description',
  输入描述: 'inputDescription',
  输出描述: 'outputDescription',
  数据范围: 'dataRangeText',
};

function stripHtmlToText(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractImagesFromSection(text: string, section: ACMProblemImage['sourceSection']): ACMProblemImage[] {
  const images: ACMProblemImage[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(text)) !== null) {
    images.push({
      url: m[2].trim(),
      alt: m[1]?.trim() || undefined,
      order: order++,
      sourceSection: section,
    });
  }
  return images;
}

function parseExamplesFromMarkdown(md: string): ACMProblemExample[] {
  const marker = '输出描述';
  const markerIdx = md.indexOf(marker);
  const searchMd = markerIdx >= 0 ? md.slice(markerIdx) : md;
  const fences: string[] = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(searchMd)) !== null) {
    fences.push(m[1].replace(/\r\n/g, '\n').replace(/\s+$/, ''));
  }
  const pairs: ACMProblemExample[] = [];
  for (let i = fences.length - 1; i > 0; i -= 2) {
    pairs.push({
      index: pairs.length + 1,
      input: fences[i - 1],
      output: fences[i],
    });
  }
  pairs.reverse();
  pairs.forEach((ex, i) => { ex.index = i + 1; });
  return pairs.filter((p) => (p.input || '').trim() || (p.output || '').trim());
}

/** 解析 Markdown 或已渲染 HTML 题面 */
export function parseAcmStatementContent(raw: string): ParsedAcmStatement {
  const isHtml = /<\/(p|h2|div|ul|pre)>/i.test(raw);
  const md = isHtml ? stripHtmlToText(raw) : String(raw || '').trim();
  const result: ParsedAcmStatement = {
    examples: [],
    images: [],
    rawMarkdown: md,
  };

  const lines = md.split('\n');
  let currentKey: keyof typeof SECTION_ALIASES extends string ? string : never = '';
  let currentSection = '';
  const sections: Record<string, string> = {};

  const flush = () => {
    if (currentKey && currentSection.trim()) {
      sections[currentKey] = currentSection.trim();
    }
    currentSection = '';
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      currentKey = h2[1].trim();
      continue;
    }
    if (currentKey) {
      currentSection += `${line}\n`;
    } else if (!sections['__lead']) {
      sections['__lead'] = (sections['__lead'] || '') + `${line}\n`;
    }
  }
  flush();

  if (sections['__lead']?.trim() && !sections['题目描述']) {
    sections['题目描述'] = sections['__lead'].trim();
  }

  for (const [title, key] of Object.entries(SECTION_ALIASES)) {
    const text = sections[title];
    if (text) {
      (result as any)[key] = text.trim();
      result.images.push(...extractImagesFromSection(text, key === 'description' ? 'description' : key === 'inputDescription' ? 'input' : key === 'outputDescription' ? 'output' : 'data-range'));
    }
  }

  result.examples = parseExamplesFromMarkdown(md);
  return result;
}

export function extractZhContentFromProblemContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        return String((parsed as any).ZhContent || (parsed as any).zh || '').trim();
      }
    } catch {
      return content.trim();
    }
    return content.trim();
  }
  if (typeof content === 'object' && content !== null) {
    const o = content as Record<string, unknown>;
    return String(o.ZhContent || o.zh || '').trim();
  }
  return '';
}
