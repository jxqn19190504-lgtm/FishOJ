import { isClientLoggedIn } from '../../lib/isClientLoggedIn';
import type { AIAssistantAdapter } from '../adapters/adapter.types';
import {
  CODENOTE_IDE_LANGUAGE_EVENT,
  LEGACY_HOT100_IDE_LANGUAGE_EVENT,
} from '../adapters/ide-language-events';
import { ArticleSelectionFloatingButton } from '../components/ArticleSelectionFloatingButton';
import { AssistantShell } from '../components/AssistantShell';
import { addSelectedTextToAssistant } from './addSelectedTextToAssistant';
import { ArticleSelectionService, getSelectionAdjustToast } from './ArticleSelectionService';
import { ConversationStore } from './ConversationStore';
import {
  deleteAssistantHistory,
  fetchAssistantHistoryDetail,
  fetchAssistantHistoryList,
} from './AssistantHistoryClient';
import { runAssistantStream } from './AssistantTransport';
import { requestAssistantLogin } from './requestAssistantLogin';
import type { AIAssistantConfig } from '../../shared/assistant-config.types';
import { getAssistantSessionKey } from '../../shared/assistant-storage';
import type { AssistantQuote } from '../../shared/assistant-types';

export type CreateAssistantControllerOptions = {
  config: AIAssistantConfig;
  adapter: AIAssistantAdapter;
};

/** 通用 AI 助教控制器：仅依赖 config + adapter，不含页面专属逻辑 */
export class AssistantController {
  private config: AIAssistantConfig;
  private adapter: AIAssistantAdapter;
  private store = new ConversationStore();
  private shell: AssistantShell | null = null;
  private selectionService: ArticleSelectionService | null = null;
  private floatingButton: ArticleSelectionFloatingButton | null = null;
  private abortController: AbortController | null = null;
  /** 当前流式 body 的 cancel；stop 时先于 abort 调用 */
  private streamCancel: (() => void) | null = null;
  /** 进行中的 submit Promise，abort 时挂上 catch 防止游离拒绝刷控制台 */
  private inflightSubmit: Promise<unknown> | null = null;
  private streamingMsgId: string | null = null;
  /** 每次 stop / 新请求递增，用于丢弃已中止的 submit 收尾逻辑 */
  private streamEpoch = 0;
  private unsubscribeContext: (() => void) | null = null;
  private externalCleanups: Array<() => void> = [];
  /** 新会话 / 载入历史后，下一条请求需注入完整静态题面/笔记 */
  private needFullStaticContext = true;

  constructor(options: CreateAssistantControllerOptions) {
    this.config = options.config;
    this.adapter = options.adapter;
  }

  private buildAddDeps() {
    return {
      selectionService: this.selectionService!,
      getActiveReference: () => this.shell?.getActiveReference() || null,
      setReference: (quote: AssistantQuote | null) => this.shell?.setReference(quote),
      openPanel: () => this.shell?.setOpen(true),
      focusInput: () => this.shell?.focusInput(),
      hideFloatingButton: () => this.floatingButton?.hide(),
      showToast: (message: string) => this.shell?.showToast(message),
    };
  }

  private syncLanguageOptionsFromAdapter() {
    const raw = this.adapter.getSupportedLanguages?.();
    const options = Array.isArray(raw)
      ? raw.map((item) => (
        typeof item === 'string'
          ? { label: item.toUpperCase(), value: item }
          : { label: item.label, value: item.value }
      ))
      : [];
    const current = this.adapter.getCurrentLanguage?.();
    this.shell?.setLanguageOptions(options, current);
  }

  init(): AssistantController | null {
    if (!this.config.enabled) return null;

    const ctx = this.adapter.getContext();
    this.store.reset(this.sessionKey());
    this.needFullStaticContext = true;

    this.shell = new AssistantShell(
      {
        onSubmit: (q, quote) => {
          void this.submit(q, quote).catch(() => { /* abort / 网络错误已在 submit 内处理 */ });
        },
        onStop: () => this.stop(),
        onClose: () => {},
        canOpen: () => {
          if (isClientLoggedIn()) return true;
          requestAssistantLogin();
          return false;
        },
        onOpen: () => {
          void this.refreshQuotaDisplay();
        },
        onNewChat: () => this.startNewChat(),
        onHistoryOpen: () => void this.openHistory().catch(() => {}),
        onHistorySelect: (id) => void this.loadHistoryConversation(id).catch(() => {}),
        onHistoryDelete: (id) => void this.deleteHistoryConversation(id).catch(() => {}),
        onAddSelectionClick: () => {
          if (this.selectionService && this.shell) {
            addSelectedTextToAssistant(this.buildAddDeps());
          }
        },
        onCodeLanguageChange: (lang) => {
          this.adapter.changeLanguage?.(lang);
        },
      },
      this.config,
    );
    this.shell.setPageTitle(ctx.title);
    this.syncLanguageOptionsFromAdapter();

    this.initSelection();
    this.wireContextSubscription();
    this.syncAccessNotice();
    void this.refreshQuotaDisplay();

    return this;
  }

  private async refreshQuotaDisplay() {
    if (!this.shell) return;
    if (this.config.features?.quotaDisplay === false) return;
    // 以接口为准：不依赖 UserContext 解析，避免登录后仍显示「加载中/—」
    try {
      const res = await fetch('/ai-quota/api/me', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (res.status === 401 || res.status === 403) {
        this.shell.setQuotaRemaining(Number.NaN, true);
        return;
      }
      if (!res.ok) {
        this.shell.setQuotaRemaining(Number.NaN, true);
        return;
      }
      const data = await res.json();
      if (!data?.ok && data?.ok !== undefined) {
        this.shell.setQuotaRemaining(Number.NaN, true);
        return;
      }
      if (data?.unlimited) {
        this.shell.setQuotaRemaining(null, false);
        return;
      }
      const n = Number(data?.balanceDisplay);
      this.shell.setQuotaRemaining(Number.isFinite(n) ? Math.floor(n) : Number.NaN, true);
    } catch {
      this.shell.setQuotaRemaining(Number.NaN, true);
    }
  }

  private syncAccessNotice() {
    this.shell?.setAccessNotice(this.adapter.getAccessNotice?.());
  }

  private initSelection() {
    const features = this.config.features || {};
    if (!features.textSelection) return;

    const root = this.adapter.getSelectableRoot?.();
    if (!root) return;

    this.selectionService = new ArticleSelectionService(root, {
      maxLength: this.config.selection?.maxLength,
      minLength: this.config.selection?.minLength,
      ignoredSelectors: this.config.selection?.ignoredSelectors,
    });
    this.selectionService.setArticleTitle(this.adapter.getContext().title);
    this.selectionService.subscribe(() => {
      const notice = this.selectionService!.consumeSelectionAdjustNotice();
      const toast = getSelectionAdjustToast(notice);
      if (toast) this.shell?.showToast(toast);
      this.shell?.setPendingSelectionAvailable(this.selectionService!.hasValidSelection());
    });

    if (features.addToContextButton !== false) {
      this.floatingButton = new ArticleSelectionFloatingButton(
        this.selectionService,
        this.buildAddDeps(),
        { buttonText: this.config.selection?.buttonText || '问 AI' },
      );
    }
  }

  private wireContextSubscription() {
    this.unsubscribeContext?.();
    this.unsubscribeContext = this.adapter.subscribeContextChange?.((nextCtx) => {
      this.onContextChanged(nextCtx);
    }) || null;

    const onIdeLang = (ev: Event) => {
      const lang = (ev as CustomEvent).detail?.lang;
      if (lang) this.shell?.syncExternalLanguage(String(lang));
    };
    window.addEventListener(CODENOTE_IDE_LANGUAGE_EVENT, onIdeLang);
    window.addEventListener(LEGACY_HOT100_IDE_LANGUAGE_EVENT, onIdeLang);
    this.externalCleanups.push(() => {
      window.removeEventListener(CODENOTE_IDE_LANGUAGE_EVENT, onIdeLang);
      window.removeEventListener(LEGACY_HOT100_IDE_LANGUAGE_EVENT, onIdeLang);
    });
  }

  private onContextChanged(nextCtx: { title: string; resourceId: string }) {
    this.stop({ restoreComposer: false });
    this.selectionService?.clearPending();
    this.floatingButton?.hide();
    this.shell?.setPendingSelectionAvailable(false);
    this.shell?.setReference(null);
    this.selectionService?.setArticleTitle(nextCtx.title);
    this.store.reset(this.sessionKey());
    this.needFullStaticContext = true;
    this.shell?.closeHistoryView();
    this.shell?.setPageTitle(nextCtx.title);
    this.syncLanguageOptionsFromAdapter();
    this.shell?.refreshSuggestedChips();
    this.shell?.renderMessages([]);
    // 切题后同步权限提示（如题库未解锁）
    this.syncAccessNotice();
  }

  /** 供宿主页面手动触发上下文变更（Bridge / 语言就绪后轻量刷新，不重置会话） */
  handleExternalContextChange() {
    this.syncAccessNotice();
    this.syncLanguageOptionsFromAdapter();
    this.shell?.setPageTitle(this.adapter.getContext().title);
    this.selectionService?.setArticleTitle(this.adapter.getContext().title);
    this.shell?.refreshSuggestedChips();
  }

  private startNewChat(clearComposer = true) {
    // 直接清除：中止进行中的生成，不排队
    this.stop({ restoreComposer: false });
    if (!this.shell) return;
    this.shell.closeHistoryView();
    this.store.reset(this.sessionKey());
    this.needFullStaticContext = true;
    this.shell.renderMessages([]);
    this.shell.setReference(null);
    if (clearComposer) this.shell.clearComposer();
  }

  private async openHistory() {
    if (!this.shell) return;
    if (this.config.features?.history === false) return;
    if (!isClientLoggedIn()) {
      requestAssistantLogin();
      return;
    }
    this.shell.openHistoryView();
    this.shell.renderHistoryLoading();
    const client = this.adapter.getClientContext();
    const result = await fetchAssistantHistoryList({
      abbreviation: client.abbreviation,
      pid: client.pid,
    });
    if (!result.ok) {
      this.shell.renderHistoryError(result.error);
      return;
    }
    this.shell.renderHistoryList(result.items);
  }

  private async loadHistoryConversation(id: string) {
    if (!this.shell) return;
    // 切历史前先清掉进行中的流，避免旧回答写回新会话
    this.stop({ restoreComposer: false });
    const result = await fetchAssistantHistoryDetail(id);
    if (!result.ok) {
      this.shell.renderHistoryError(result.error);
      return;
    }
    this.store.reset(this.sessionKey());
    this.store.loadConversation(result.detail.id, result.detail.messages);
    // 历史只含问答，不含首轮题面；续聊前需再注入完整静态上下文
    this.needFullStaticContext = true;
    this.shell.closeHistoryView();
    this.shell.renderMessages(this.store.getMessages(), { forcePin: true });
    this.shell.enhanceAllAssistantMessages();
    this.shell.setOpen(true);
  }

  private async deleteHistoryConversation(id: string) {
    if (!this.shell) return;
    const result = await deleteAssistantHistory(id);
    if (!result.ok) {
      this.shell.renderHistoryError(result.error || '删除失败');
      return;
    }
    if (this.store.getConversationId() === id) {
      this.stop({ restoreComposer: false });
      this.store.reset(this.sessionKey());
      this.needFullStaticContext = true;
      this.shell?.renderMessages([]);
    }
    void this.openHistory();
  }

  private sessionKey() {
    return getAssistantSessionKey({
      config: this.config,
      resourceId: this.adapter.getResourceId(),
      mode: this.adapter.getMode?.(),
    });
  }

  private async submit(question: string, quote: AssistantQuote | null) {
    if (!this.shell) return;
    if (!isClientLoggedIn()) {
      requestAssistantLogin();
      return;
    }

    // 直接清除上一轮（含未完成回答），再发新请求；不排队
    this.stop({ restoreComposer: false });
    const epoch = this.streamEpoch;
    const isCurrent = () => epoch === this.streamEpoch;

    this.store.addUserMessage(question, quote);
    const assistantMsg = this.store.startAssistantMessage();
    this.streamingMsgId = assistantMsg.id;
    this.shell.renderMessages(this.store.getMessages(), { forcePin: true });
    this.shell.setBusy(true);
    this.shell.setOpen(true);

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const history = this.store.getHistoryForRequest();
    const includeStaticProblemContext = this.needFullStaticContext || history.length === 0;
    let result: Awaited<ReturnType<typeof runAssistantStream>>;
    const streamPromise = runAssistantStream({
      question,
      quote,
      clientContext: {
        ...this.adapter.getClientContext(),
        includeStaticProblemContext,
      },
      history,
      conversationId: this.store.getConversationId() || undefined,
      signal,
      onHtml: (html) => {
        if (!isCurrent() || this.streamingMsgId !== assistantMsg.id) return;
        this.shell?.updateStreamingHtml(assistantMsg.id, html);
      },
      onStreamControl: (ctrl) => {
        this.streamCancel = ctrl ? () => ctrl.cancel() : null;
      },
    });
    this.inflightSubmit = streamPromise;
    try {
      result = await streamPromise;
    } catch (e: any) {
      // 用户点击停止 / 新对话：AbortError，轮次已在 stop() 中回退
      if (!isCurrent()) return;
      const msg = String(e?.message || '');
      const aborted = e?.name === 'AbortError'
        || signal.aborted
        || !this.streamingMsgId
        || /aborted|BodyStreamBuffer/i.test(msg);
      this.shell.setBusy(false);
      if (this.abortController?.signal === signal) this.abortController = null;
      if (aborted) return;
      result = { ok: false, error: e?.message || '请求失败' };
    } finally {
      if (this.inflightSubmit === streamPromise) this.inflightSubmit = null;
      if (this.streamCancel) this.streamCancel = null;
    }

    // 已被更新的 stop/新 submit 取代：勿动 busy / 气泡
    if (!isCurrent()) return;

    this.shell.setBusy(false);
    if (this.abortController?.signal === signal) this.abortController = null;

    // 已停止并回退：勿再写入气泡
    if (!this.streamingMsgId || this.streamingMsgId !== assistantMsg.id) return;

    const finishedMsgId = assistantMsg.id;
    if (result.code === 'ABORTED') {
      this.streamingMsgId = null;
      return;
    }
    if (result.ok && result.contentHtml) {
      // 首轮静态上下文已成功注入后，同会话后续只刷新动态段
      this.needFullStaticContext = false;
      this.store.updateAssistantMessage(finishedMsgId, {
        contentHtml: result.contentHtml,
        contentMarkdown: result.contentMarkdown,
        finishReason: result.finishReason,
        isStreaming: false,
      });
      if (result.aiQuota) {
        this.shell?.setQuotaRemaining(
          result.aiQuota.limited ? result.aiQuota.remaining : null,
          result.aiQuota.limited,
        );
      } else {
        void this.refreshQuotaDisplay();
      }
      if (result.conversationId) {
        this.store.setConversationId(result.conversationId);
      }
      this.shell?.finalizeStreamingMessage(finishedMsgId, result.contentHtml);
      // renderMessages 内部会 enhance 全部历史消息，避免只增强当前气泡导致上一块 IDE 消失
      this.shell?.renderMessages(this.store.getMessages());
    } else if (result.error) {
      const isQuota = result.code === 'QUOTA_EXCEEDED';
      const quotaPath = result.quotaCenterPath || result.aiQuota?.quotaCenterPath || '/ai-quota';
      const errorHtml = isQuota
        ? `<p style="color:#cf1322;">${escapeHtml(result.error)} <a href="${escapeHtml(quotaPath)}" target="_blank" rel="noopener noreferrer">前往额度中心</a></p>`
        : `<p style="color:#cf1322;">${escapeHtml(result.error)}</p>`;
      this.store.updateAssistantMessage(finishedMsgId, {
        contentHtml: errorHtml,
        isStreaming: false,
        finishReason: isQuota ? 'quota_exceeded' : 'failed',
      });
      this.shell?.finalizeStreamingMessage(finishedMsgId, errorHtml);
      this.shell?.renderMessages(this.store.getMessages());
      if (isQuota) void this.refreshQuotaDisplay();
    } else {
      const fallback = result.ok && !result.contentHtml
        ? 'AI 返回为空，请重试'
        : '请求未完成，请重试';
      const errorHtml = `<p style="color:#cf1322;">${escapeHtml(fallback)}</p>`;
      this.store.updateAssistantMessage(finishedMsgId, {
        contentHtml: errorHtml,
        isStreaming: false,
        finishReason: 'failed',
      });
      this.shell?.finalizeStreamingMessage(finishedMsgId, errorHtml);
      this.shell?.renderMessages(this.store.getMessages());
    }
    if (isCurrent() && this.streamingMsgId === finishedMsgId) {
      this.streamingMsgId = null;
    }
  }

  /**
   * 中止当前生成并回退未完成轮次（直接清除，不排队）。
   * @param restoreComposer 用户点停止时回填问题；新对话/再发送/切历史时传 false
   */
  private stop(opts?: { restoreComposer?: boolean }) {
    this.streamEpoch += 1;
    const hadStreaming = Boolean(this.streamingMsgId);

    // 1) 先 cancel body reader，再 abort signal，避免 BodyStreamBuffer 未捕获拒绝
    const cancelBody = this.streamCancel;
    this.streamCancel = null;
    try {
      cancelBody?.();
    } catch {
      /* ignore */
    }

    // 2) 给进行中的 submit 挂上 catch，吞掉 abort 产生的游离 rejection
    const inflight = this.inflightSubmit;
    if (inflight) {
      void inflight.catch(() => { /* ignore abort */ });
    }

    const ac = this.abortController;
    this.abortController = null;
    try {
      if (ac && !ac.signal.aborted) ac.abort();
    } catch {
      /* ignore */
    }

    if (!hadStreaming || !this.shell) return;

    // 回退未完成的 user + assistant（含思考动画）
    const rolled = this.store.rollbackIncompleteTurn();
    this.streamingMsgId = null;
    this.shell.setBusy(false);
    this.shell.renderMessages(this.store.getMessages(), { forcePin: true });
    if (opts?.restoreComposer !== false && rolled?.question) {
      this.shell.restoreComposer(rolled.question, rolled.quote);
    }
  }

  dispose() {
    this.stop();
    this.unsubscribeContext?.();
    this.unsubscribeContext = null;
    this.externalCleanups.forEach((fn) => fn());
    this.externalCleanups = [];
    this.floatingButton?.dispose();
    this.shell?.dispose();
    this.floatingButton = null;
    this.selectionService = null;
    this.shell = null;
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createAssistantController(options: CreateAssistantControllerOptions): AssistantController {
  return new AssistantController(options);
}
