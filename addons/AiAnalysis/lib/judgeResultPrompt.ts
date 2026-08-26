/** 与题面 IDE AI 分析面板顶部提交信息一致的状态码映射 */
const RECORD_STATUS_NUMBER_TO_NAME: Record<number, string> = {
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

const RECORD_STATUS_NAME_TO_ZH: Record<string, string> = {
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

const COMPILER_TEXT_MAX_CHARS = 6000;

export type RecordJudgeResultPromptSource = {
    status?: unknown;
    score?: unknown;
    time?: unknown;
    memory?: unknown;
    lang?: unknown;
    judgeAt?: unknown;
    compilerText?: unknown;
    compilerTexts?: unknown;
};

export function formatRecordStatusLabelZh(status: unknown): string {
    const st = typeof status === 'number' ? status : parseInt(String(status), 10);
    if (!Number.isFinite(st)) return '-';
    const statusName = RECORD_STATUS_NUMBER_TO_NAME[st] || `STATUS_${st}`;
    return RECORD_STATUS_NAME_TO_ZH[statusName] || statusName;
}

/** 从提交记录提取编译日志（CE 诊断用） */
export function extractRecordCompilerText(rdoc: RecordJudgeResultPromptSource | null | undefined): string {
    if (!rdoc) return '';
    const raw = rdoc.compilerText ?? rdoc.compilerTexts;
    if (raw == null) return '';
    let text = '';
    if (typeof raw === 'string') text = raw;
    else if (Array.isArray(raw)) text = raw.map((x) => String(x ?? '')).filter(Boolean).join('\n');
    else text = String(raw);
    text = text.trim();
    if (!text) return '';
    if (text.length > COMPILER_TEXT_MAX_CHARS) {
        return `${text.slice(0, COMPILER_TEXT_MAX_CHARS)}\n…(编译日志已截断)`;
    }
    return text;
}

/** 生成评测结果多行文本（默认同附带编译日志） */
export function formatRecordJudgeResultPromptText(
    rdoc: RecordJudgeResultPromptSource,
    options?: { langLabel?: string; includeCompilerLog?: boolean },
): string {
    const statusLabel = formatRecordStatusLabelZh(rdoc?.status);
    const score = rdoc?.score ?? '-';
    const timeCost = rdoc?.time != null ? `${rdoc.time}ms` : '-';
    const mem =
        rdoc?.memory != null ? `${(Number(rdoc.memory) / 1024).toFixed(1)}MB` : '-';
    const lang = options?.langLabel || rdoc?.lang || '-';
    const judgeAt = rdoc?.judgeAt ? new Date(String(rdoc.judgeAt)).toLocaleString('zh-CN') : '-';
    const lines = [
        `状态: ${statusLabel}`,
        `分数: ${score}`,
        `耗时: ${timeCost}`,
        `内存: ${mem}`,
        `语言: ${lang}`,
        `提交时间: ${judgeAt}`,
    ];
    if (options?.includeCompilerLog !== false) {
        const compiler = extractRecordCompilerText(rdoc);
        if (compiler) {
            lines.push('编译日志:');
            lines.push(compiler);
        }
    }
    return lines.join('\n');
}
