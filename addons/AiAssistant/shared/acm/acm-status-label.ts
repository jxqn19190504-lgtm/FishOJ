/** ACM 评测状态码 → 中文标签（与 IDE / AI 分析面板一致） */

const STATUS_NUMBER_TO_NAME: Record<number, string> = {
  0: 'WAITING',
  1: 'ACCEPTED',
  2: 'WRONG_ANSWER',
  3: 'TIME_LIMIT_EXCEEDED',
  4: 'MEMORY_LIMIT_EXCEEDED',
  5: 'OUTPUT_LIMIT_EXCEEDED',
  6: 'RUNTIME_ERROR',
  7: 'COMPILE_ERROR',
  8: 'SYSTEM_ERROR',
  9: 'CANCELED',
  10: 'ETC',
  11: 'HACKED',
  20: 'JUDGING',
  21: 'COMPILING',
  22: 'FETCHED',
};

const STATUS_NAME_TO_ZH: Record<string, string> = {
  ACCEPTED: '通过',
  WRONG_ANSWER: '答案错误',
  TIME_LIMIT_EXCEEDED: '时间超限',
  MEMORY_LIMIT_EXCEEDED: '内存超限',
  OUTPUT_LIMIT_EXCEEDED: '输出超限',
  RUNTIME_ERROR: '运行错误',
  COMPILE_ERROR: '编译错误',
  SYSTEM_ERROR: '系统错误',
  CANCELED: '已取消',
  JUDGING: '评测中…',
  COMPILING: '编译中…',
  WAITING: '等待中…',
  FETCHED: '数据获取中…',
  ETC: '未知错误',
  HACKED: '被 Hack',
};

export function formatAcmStatusLabel(status: unknown): string {
  const st = typeof status === 'number' ? status : parseInt(String(status), 10);
  if (!Number.isFinite(st)) return String(status ?? '-');
  const name = STATUS_NUMBER_TO_NAME[st] || `STATUS_${st}`;
  return STATUS_NAME_TO_ZH[name] || name;
}
