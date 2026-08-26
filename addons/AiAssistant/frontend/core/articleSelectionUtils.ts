import type { AssistantQuote } from '../../shared/assistant-types';

export const ARTICLE_SELECTION_MAX_LEN = 2000;
export const ARTICLE_SELECTION_MIN_LEN = 2;

export type SelectedArticleContext = {
  text: string;
  articleTitle: string;
  sectionTitle: string;
  sourceType: 'article-selection';
  rangeRect: DOMRect | null;
  type: 'text' | 'code';
  language?: string;
  /** 选区曾跨越不可添加区域，已过滤 */
  wasFiltered?: boolean;
  /** 选区过长，已截取至上限 */
  wasTruncated?: boolean;
};

export type ExtractedSelectableText = {
  text: string;
  anchorNode: Node;
  filtered: boolean;
  truncated: boolean;
};

const DEFAULT_IGNORED_CLOSEST = [
  '#cf-assistant-root',
  '.sidebar-fixed',
  '.right-toc-shell',
  '.comment-section',
  '.doc-header',
  '.inner-scratchpad',
  '.floating-code-editor',
  '.code-editor-container',
  '.cf-assistant-dock',
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable="true"]',
].join(',');

let activeIgnoredClosest = DEFAULT_IGNORED_CLOSEST;

export function setArticleSelectionIgnoredSelectors(selectors?: string[]): void {
  activeIgnoredClosest = selectors?.length ? selectors.join(',') : DEFAULT_IGNORED_CLOSEST;
}

export function isIgnoredSelectionTarget(node: Node | null): boolean {
  if (!node) return true;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el?.closest(activeIgnoredClosest);
}

export function resolveSectionTitle(container: HTMLElement, node: Node): string {
  const anchor = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!anchor || !container.contains(anchor)) return '';

  const headings = Array.from(container.querySelectorAll('h1, h2, h3'));
  let last = '';
  for (const h of headings) {
    if (
      h.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING
    ) {
      last = (h.textContent || '').trim();
    } else if (h.contains(anchor)) {
      return (h.textContent || '').trim();
    }
  }
  return last;
}

export function detectSelectionType(node: Node): { type: 'text' | 'code'; language?: string } {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const codeEl = el?.closest('pre code');
  if (!codeEl) return { type: 'text' };
  const cls = Array.from(codeEl.classList).find((c) => c.startsWith('language-'));
  return { type: 'code', language: cls?.replace('language-', '') };
}

export function isValidArticleSelectionText(
  text: string,
  maxLength: number = ARTICLE_SELECTION_MAX_LEN,
  minLength: number = ARTICLE_SELECTION_MIN_LEN,
): boolean {
  const trimmed = text.trim();
  if (trimmed.length < minLength) return false;
  if (!/\S/.test(trimmed)) return false;
  if (trimmed.length > maxLength) return false;
  return true;
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  if (typeof range.intersectsNode === 'function') {
    try {
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }
  const nodeRange = document.createRange();
  try {
    nodeRange.selectNodeContents(node);
  } catch {
    return false;
  }
  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0
    && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
  );
}

function extractTextSliceFromRange(range: Range, textNode: Text): string {
  if (!rangeIntersectsNode(range, textNode)) return '';

  if (range.startContainer === textNode && range.endContainer === textNode) {
    const start = Math.min(range.startOffset, range.endOffset);
    const end = Math.max(range.startOffset, range.endOffset);
    return textNode.data.slice(start, end);
  }
  if (range.startContainer === textNode) {
    return textNode.data.slice(range.startOffset);
  }
  if (range.endContainer === textNode) {
    return textNode.data.slice(0, range.endOffset);
  }

  const nodeRange = document.createRange();
  try {
    nodeRange.selectNodeContents(textNode);
    if (
      range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0
      && range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0
    ) {
      return textNode.data;
    }
  } catch {
    return '';
  }
  return '';
}

function getTextBlockParent(node: Node, container: HTMLElement): Element | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el || !container.contains(el)) return null;
  return el.closest('p, h1, h2, h3, h4, li, td, th, pre, blockquote, div') || el;
}

function truncateSelectableText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  let cut = text.slice(0, maxLength);
  const breakAt = Math.max(
    cut.lastIndexOf('\n'),
    cut.lastIndexOf('。'),
    cut.lastIndexOf('！'),
    cut.lastIndexOf('？'),
    cut.lastIndexOf('. '),
    cut.lastIndexOf(' '),
  );
  if (breakAt > Math.floor(maxLength * 0.55)) {
    cut = cut.slice(0, breakAt);
  }
  return `${cut.trimEnd()}…`;
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 从浏览器选区中提取容器内可添加正文（跳过忽略区，必要时截取） */
export function extractSelectableText(
  sel: Selection,
  container: HTMLElement,
  maxLength: number,
): ExtractedSelectableText | null {
  if (!sel || sel.isCollapsed) return null;

  let range: Range;
  try {
    range = sel.getRangeAt(0);
  } catch {
    return null;
  }

  const parts: string[] = [];
  let anchorNode: Node | null = null;
  let lastBlock: Element | null = null;

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node) {
        if (isIgnoredSelectionTarget(node)) return NodeFilter.FILTER_REJECT;
        if (!rangeIntersectsNode(range, node)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const slice = extractTextSliceFromRange(range, node as Text);
    if (!slice) continue;

    const block = getTextBlockParent(node, container);
    if (lastBlock && block && block !== lastBlock) {
      parts.push('\n');
    }

    if (!anchorNode) anchorNode = node;
    parts.push(slice);
    lastBlock = block;
  }

  let text = normalizeExtractedText(parts.join(''));
  if (!text) return null;

  const rawTrimmed = sel.toString().trim();
  const filtered = rawTrimmed !== text
    || !isSelectionFullyInsideContainer(sel, container)
    || isIgnoredSelectionTarget(sel.anchorNode)
    || isIgnoredSelectionTarget(sel.focusNode);

  let truncated = false;
  if (text.length > maxLength) {
    text = truncateSelectableText(text, maxLength);
    truncated = true;
  }

  if (!anchorNode) return null;

  return {
    text,
    anchorNode,
    filtered,
    truncated,
  };
}

export function isSelectionFullyInsideContainer(sel: Selection, container: HTMLElement): boolean {
  const { anchorNode, focusNode } = sel;
  if (!anchorNode || !focusNode) return false;
  if (!container.contains(anchorNode) || !container.contains(focusNode)) return false;
  if (isIgnoredSelectionTarget(anchorNode) || isIgnoredSelectionTarget(focusNode)) return false;
  return true;
}

export function buildAssistantQuoteFromSelection(ctx: SelectedArticleContext): AssistantQuote {
  return {
    type: ctx.type,
    content: ctx.text,
    language: ctx.language,
    sourceType: 'article-selection',
    articleTitle: ctx.articleTitle,
    sectionTitle: ctx.sectionTitle,
    headingPath: ctx.sectionTitle ? [ctx.sectionTitle] : undefined,
  };
}

export function clearBrowserSelection(): void {
  window.getSelection()?.removeAllRanges();
}
