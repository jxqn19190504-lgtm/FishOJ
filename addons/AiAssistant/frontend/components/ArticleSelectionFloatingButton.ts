import type { ArticleSelectionService } from '../core/ArticleSelectionService';
import { addSelectedTextToAssistant, type AddToAssistantDeps } from '../core/addSelectedTextToAssistant';

const FLOAT_GAP = 10;
const BTN_HEIGHT = 34;

export type ArticleSelectionFloatingButtonOptions = {
  buttonText?: string;
};

export class ArticleSelectionFloatingButton {
  private button: HTMLElement | null = null;
  private selectionService: ArticleSelectionService;
  private addDeps: AddToAssistantDeps;
  private buttonText: string;
  private visible = false;

  private onMouseUp = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement | null;
    if (target?.closest('#cf-assistant-root')) return;
    window.requestAnimationFrame(() => this.syncFromSelection());
  };

  private onScroll = () => {
    if (this.visible) this.hide();
  };

  private onResize = () => {
    if (this.visible) this.reposition();
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && this.visible) this.hide();
  };

  constructor(
    selectionService: ArticleSelectionService,
    addDeps: AddToAssistantDeps,
    options: ArticleSelectionFloatingButtonOptions = {},
  ) {
    this.selectionService = selectionService;
    this.addDeps = addDeps;
    this.buttonText = options.buttonText?.trim() || '问 AI';
    document.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKeyDown);
    this.selectionService.subscribe(() => {
      if (this.selectionService.hasValidSelection()) {
        this.show();
      } else {
        this.hide();
      }
    });
  }

  dispose() {
    document.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('keydown', this.onKeyDown);
    this.hide();
  }

  hide() {
    this.visible = false;
    this.button?.remove();
    this.button = null;
  }

  private syncFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      this.hide();
      return;
    }

    if (this.selectionService.updateFromBrowserSelection()) {
      this.show();
    } else {
      this.hide();
    }
  }

  private ensureButton() {
    if (this.button) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cf-assistant-add-selection cf-assistant-add-selection--ready cf-assistant-add-selection-float';
    btn.setAttribute('aria-label', this.buttonText);
    btn.setAttribute('title', this.buttonText);
    btn.innerHTML = [
      '<span class="cf-assistant-add-selection-icon" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i></span>',
      `<span class="cf-assistant-add-selection-label">${escapeHtml(this.buttonText)}</span>`,
    ].join('');
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
    });
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      addSelectedTextToAssistant(this.addDeps);
    });
    document.body.appendChild(btn);
    this.button = btn;
  }

  private show() {
    this.ensureButton();
    this.visible = true;
    this.button?.classList.add('cf-assistant-add-selection-float--visible');
    this.reposition();
  }

  private reposition() {
    if (!this.button) return;
    const rect = this.selectionService.getCached()?.rangeRect;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      this.hide();
      return;
    }

    const btnWidth = this.button.offsetWidth || 88;
    const btnHeight = this.button.offsetHeight || BTN_HEIGHT;
    let top = rect.top - btnHeight - FLOAT_GAP;
    if (top < 8) {
      top = rect.bottom + FLOAT_GAP;
    }

    let left = rect.left + rect.width / 2 - btnWidth / 2;
    left = Math.max(8, Math.min(window.innerWidth - btnWidth - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - btnHeight - 8, top));

    this.button.style.left = `${left}px`;
    this.button.style.top = `${top}px`;
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
