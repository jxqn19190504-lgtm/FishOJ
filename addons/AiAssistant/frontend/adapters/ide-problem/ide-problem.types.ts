/** IDE 题目页运行时辅助：从 UiContext 读取 problemId（供路由 runtime 使用） */

declare const UiContext: {
  problemId?: string;
};

export function readIdeProblemIdFromPage(): string | null {
  try {
    if (typeof UiContext !== 'undefined' && UiContext.problemId) {
      return String(UiContext.problemId);
    }
  } catch {
    /* ignore */
  }
  return null;
}
