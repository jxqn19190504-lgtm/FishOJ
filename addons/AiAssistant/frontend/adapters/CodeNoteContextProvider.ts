import type { AssistantClientContext } from '../../shared/assistant-types';
import { detectNoteCodeLanguages, resolvePreferredCodeLanguage } from '../core/AssistantCodeLanguage';
import { isAssistantDeepThinkEnabled } from '../core/AssistantDeepThink';
import type { CodeNotePageContext } from './hot100/codenote-page-context';

export type { CodeNotePageContext } from './hot100/codenote-page-context';
export { readInitialCodeNoteContext } from './hot100/codenote-page-context';

export class CodeNoteContextProvider {
  private ctx: CodeNotePageContext;

  constructor(ctx: CodeNotePageContext) {
    this.ctx = ctx;
  }

  update(patch: Partial<CodeNotePageContext>) {
    this.ctx = { ...this.ctx, ...patch };
  }

  getPageContext(): CodeNotePageContext {
    return { ...this.ctx };
  }

  getClientContext(): AssistantClientContext {
    const available = detectNoteCodeLanguages();
    return {
      abbreviation: this.ctx.abbreviation,
      pid: this.ctx.pid,
      mode: this.ctx.mode,
      codeLanguage: resolvePreferredCodeLanguage(available),
      ...(isAssistantDeepThinkEnabled() ? { deepThink: true } : {}),
    };
  }

  isEnabled(): boolean {
    return Boolean(this.ctx.abbreviation);
  }
}
