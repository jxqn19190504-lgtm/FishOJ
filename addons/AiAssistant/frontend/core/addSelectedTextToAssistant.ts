import type { AssistantQuote } from '../../shared/assistant-types';
import type { ArticleSelectionService } from './ArticleSelectionService';
import { buildAssistantQuoteFromSelection, clearBrowserSelection } from './articleSelectionUtils';

export type AddToAssistantDeps = {
  selectionService: ArticleSelectionService;
  getActiveReference: () => AssistantQuote | null;
  setReference: (quote: AssistantQuote | null) => void;
  openPanel: () => void;
  focusInput: () => void;
  hideFloatingButton: () => void;
  showToast: (message: string) => void;
};

export function addSelectedTextToAssistant(deps: AddToAssistantDeps): boolean {
  deps.selectionService.updateFromBrowserSelection();

  const ctx = deps.selectionService.getCached();
  if (!ctx?.text) {
    return false;
  }

  const quote = buildAssistantQuoteFromSelection(ctx);
  const active = deps.getActiveReference();

  if (active?.content === quote.content) {
    deps.openPanel();
    deps.focusInput();
    deps.showToast('该内容已添加');
    deps.hideFloatingButton();
    clearBrowserSelection();
    return true;
  }

  deps.setReference(quote);
  deps.openPanel();
  deps.focusInput();
  deps.hideFloatingButton();
  clearBrowserSelection();
  deps.selectionService.clearPending();
  deps.showToast('已引用，可以直接问 AI');
  return true;
}
