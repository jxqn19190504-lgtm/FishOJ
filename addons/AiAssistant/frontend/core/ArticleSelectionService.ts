import {
  ARTICLE_SELECTION_MAX_LEN,
  ARTICLE_SELECTION_MIN_LEN,
  type SelectedArticleContext,
  detectSelectionType,
  extractSelectableText,
  isIgnoredSelectionTarget,
  isSelectionFullyInsideContainer,
  isValidArticleSelectionText,
  resolveSectionTitle,
  setArticleSelectionIgnoredSelectors,
} from './articleSelectionUtils';

type Listener = () => void;

export type SelectionAdjustNotice = 'filtered' | 'truncated' | 'both';

export type ArticleSelectionServiceOptions = {
  maxLength?: number;
  minLength?: number;
  ignoredSelectors?: string[];
};

export class ArticleSelectionService {
  private container: HTMLElement;
  private articleTitle = '';
  private cached: SelectedArticleContext | null = null;
  private listeners = new Set<Listener>();
  private selectionAdjustNotice: SelectionAdjustNotice | null = null;
  private maxLength: number;
  private minLength: number;

  constructor(container: HTMLElement, options?: ArticleSelectionServiceOptions) {
    this.container = container;
    this.maxLength = options?.maxLength ?? ARTICLE_SELECTION_MAX_LEN;
    this.minLength = options?.minLength ?? ARTICLE_SELECTION_MIN_LEN;
    if (options?.ignoredSelectors) {
      setArticleSelectionIgnoredSelectors(options.ignoredSelectors);
    }
    if (!this.container.hasAttribute('data-ai-selectable')) {
      this.container.setAttribute('data-ai-selectable', 'true');
    }
  }

  setArticleTitle(title: string) {
    this.articleTitle = String(title || '').trim();
  }

  getCached(): SelectedArticleContext | null {
    return this.cached ? { ...this.cached } : null;
  }

  hasValidSelection(): boolean {
    return Boolean(this.cached?.text);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  clearPending() {
    this.cached = null;
    this.selectionAdjustNotice = null;
    this.notify();
  }

  consumeSelectionAdjustNotice(): SelectionAdjustNotice | null {
    const notice = this.selectionAdjustNotice;
    this.selectionAdjustNotice = null;
    return notice;
  }

  /** 无效选区时丢弃缓存，避免沿用上一次可添加的内容 */
  private discardPending() {
    if (!this.cached) return;
    this.cached = null;
    this.selectionAdjustNotice = null;
    this.notify();
  }

  private cacheFromExtracted(
    text: string,
    anchorNode: Node,
    sel: Selection,
    meta?: { filtered?: boolean; truncated?: boolean },
  ): boolean {
    if (!isValidArticleSelectionText(text, this.maxLength, this.minLength)) {
      this.discardPending();
      return false;
    }

    const { type, language } = detectSelectionType(anchorNode);
    let rangeRect: DOMRect | null = null;
    try {
      rangeRect = sel.getRangeAt(0).getBoundingClientRect();
    } catch {
      rangeRect = null;
    }

    const wasFiltered = !!meta?.filtered;
    const wasTruncated = !!meta?.truncated;

    this.cached = {
      text,
      articleTitle: this.articleTitle,
      sectionTitle: resolveSectionTitle(this.container, anchorNode),
      sourceType: 'article-selection',
      rangeRect,
      type,
      language,
      wasFiltered,
      wasTruncated,
    };

    if (wasFiltered && wasTruncated) {
      this.selectionAdjustNotice = 'both';
    } else if (wasFiltered) {
      this.selectionAdjustNotice = 'filtered';
    } else if (wasTruncated) {
      this.selectionAdjustNotice = 'truncated';
    } else {
      this.selectionAdjustNotice = null;
    }

    this.notify();
    return true;
  }

  updateFromBrowserSelection(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      this.discardPending();
      return false;
    }

    const raw = sel.toString().trim();
    if (!raw) {
      this.discardPending();
      return false;
    }

    const fastPathValid = (
      raw.length <= this.maxLength
      && isValidArticleSelectionText(raw, this.maxLength, this.minLength)
      && isSelectionFullyInsideContainer(sel, this.container)
      && !isIgnoredSelectionTarget(sel.anchorNode)
      && !isIgnoredSelectionTarget(sel.focusNode)
    );

    if (fastPathValid && sel.anchorNode) {
      return this.cacheFromExtracted(raw, sel.anchorNode, sel);
    }

    const extracted = extractSelectableText(sel, this.container, this.maxLength);
    if (!extracted) {
      this.discardPending();
      return false;
    }

    return this.cacheFromExtracted(extracted.text, extracted.anchorNode, sel, {
      filtered: extracted.filtered,
      truncated: extracted.truncated,
    });
  }

  setContainer(container: HTMLElement) {
    this.container = container;
    if (!this.container.hasAttribute('data-ai-selectable')) {
      this.container.setAttribute('data-ai-selectable', 'true');
    }
    this.clearPending();
  }
}

export function getSelectionAdjustToast(notice: SelectionAdjustNotice | null): string | null {
  if (!notice) return null;
  if (notice === 'both') return '已过滤并截取笔记正文可添加部分';
  if (notice === 'filtered') return '已过滤不可添加区域，仅保留笔记正文';
  return '选取内容较多，已自动截取可添加部分';
}
