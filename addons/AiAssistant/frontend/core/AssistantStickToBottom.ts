/**
 * Cursor 式粘底滚动：贴底时跟随流式输出；用户上滑后锁定视口，不再跳动。
 */

export type AssistantStickToBottomOptions = {
  /** 距底部小于该像素视为「贴底」 */
  threshold?: number;
  onPinnedChange?: (pinned: boolean) => void;
};

export class AssistantStickToBottom {
  private root: HTMLElement;
  private threshold: number;
  private pinned = true;
  private programmatic = false;
  private userIntentUntil = 0;
  private onPinnedChange?: (pinned: boolean) => void;
  private cleanups: Array<() => void> = [];

  constructor(root: HTMLElement, options: AssistantStickToBottomOptions = {}) {
    this.root = root;
    this.threshold = options.threshold ?? 72;
    this.onPinnedChange = options.onPinnedChange;

    const onUserIntent = () => {
      this.userIntentUntil = Date.now() + 160;
    };
    const onScroll = () => this.handleScroll();

    root.addEventListener('wheel', onUserIntent, { passive: true });
    root.addEventListener('touchmove', onUserIntent, { passive: true });
    root.addEventListener('pointerdown', onUserIntent, { passive: true });
    root.addEventListener('scroll', onScroll, { passive: true });

    this.cleanups.push(
      () => root.removeEventListener('wheel', onUserIntent),
      () => root.removeEventListener('touchmove', onUserIntent),
      () => root.removeEventListener('pointerdown', onUserIntent),
      () => root.removeEventListener('scroll', onScroll),
    );
  }

  dispose() {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  isPinned(): boolean {
    return this.pinned;
  }

  distanceFromBottom(): number {
    const el = this.root;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  /** 强制贴底（发新消息、点「回到底部」） */
  pinAndScrollToBottom() {
    this.setPinned(true);
    this.scrollToBottomNow();
  }

  /**
   * 内容变更后调用：
   * - 贴底：滚到最新
   * - 已上滑：不改 scrollTop（底部增高不影响当前视口）
   */
  afterContentMutation() {
    if (!this.pinned) return;
    this.scrollToBottomNow();
  }

  private handleScroll() {
    if (this.programmatic) return;
    const nearBottom = this.distanceFromBottom() <= this.threshold;
    if (nearBottom) {
      this.setPinned(true);
      return;
    }
    // 仅在用户主动滚动意图下解除粘底，避免布局抖动误触发
    if (Date.now() <= this.userIntentUntil) {
      this.setPinned(false);
    }
  }

  private setPinned(next: boolean) {
    if (this.pinned === next) return;
    this.pinned = next;
    this.onPinnedChange?.(next);
  }

  private scrollToBottomNow() {
    const el = this.root;
    this.programmatic = true;
    el.scrollTop = el.scrollHeight;
    // 二次对齐：流式 HTML/图片布局可能在同一帧稍后增高
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        this.programmatic = false;
      });
    });
  }
}
