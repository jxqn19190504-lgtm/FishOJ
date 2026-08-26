export type TestCase = { input: string; expected: string };

export const FS_KEY = 'problem_ide_fontsize_v1';
export const THEME_KEY = 'problem_ide_dark_v1';
export const SPLIT_KEY = 'problem_ide_split_v1';
export const EDITOR_HIDDEN_BY_SPLIT_KEY = 'problem_ide_editor_hidden_v1';
export const DRAWER_KEY = 'problem_ide_drawer_h_v1';
export const GUTTER_WIDTH = 5;
export const MIN_LEFT_RATIO = 0.1;
export const MIN_RIGHT_RATIO = 0.1;
export const MAX_LEFT_RATIO = 0.9;
export const HIDE_RIGHT_VISIBLE_WIDTH = 50;
export const SUBMIT_HTTP_TIMEOUT_MS = 20000;
export const MAX_CASES = 5;

export const SN: Record<number, string> = {
    0: 'WAITING', 1: 'ACCEPTED', 2: 'WRONG_ANSWER',
    3: 'TIME_LIMIT_EXCEEDED', 4: 'MEMORY_LIMIT_EXCEEDED', 5: 'OUTPUT_LIMIT_EXCEEDED',
    6: 'RUNTIME_ERROR', 7: 'COMPILE_ERROR', 8: 'SYSTEM_ERROR', 9: 'CANCELED',
    10: 'ETC', 11: 'HACKED', 20: 'JUDGING', 21: 'COMPILING', 22: 'FETCHED',
};
export const DONE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
export const PROGRESS = new Set([0, 20, 21, 22]);
export const LABEL: Record<string, string> = {
    ACCEPTED: '通过', WRONG_ANSWER: '答案错误',
    TIME_LIMIT_EXCEEDED: '时间超限', MEMORY_LIMIT_EXCEEDED: '内存超限',
    OUTPUT_LIMIT_EXCEEDED: '输出超限', RUNTIME_ERROR: '运行错误',
    COMPILE_ERROR: '编译错误', SYSTEM_ERROR: '系统错误',
    CANCELED: '已取消', JUDGING: '评测中…', COMPILING: '编译中…',
    WAITING: '等待中…', FETCHED: '数据获取中…', ETC: '未知错误', HACKED: '被 Hack',
};

export const MONACO_VS_SOURCES = [
    '/monaco/vs',
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs',
    'https://unpkg.com/monaco-editor@0.54.0/min/vs',
    'https://cdn.bootcdn.net/ajax/libs/monaco-editor/0.53.0/min/vs',
];
