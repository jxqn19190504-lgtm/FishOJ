/** 管理页 textarea name → 语言族与内部脚手架等级 */
export const SCAFFOLD_TEXTAREA_FIELDS: Array<[language: string, level: number, field: string]> = [
    ['python', 0, 'py0'],
    ['python', 1, 'py1'],
    ['python', 3, 'py3'],
    ['cpp', 0, 'cpp0'],
    ['cpp', 1, 'cpp1'],
    ['cpp', 3, 'cpp3'],
];

export function codesFromArgs(args: Record<string, unknown>, get: (k: string) => string) {
    return SCAFFOLD_TEXTAREA_FIELDS.map(([language, level, field]) => ({
        language,
        level,
        code: get(field),
    }));
}

export function codesByLang(scaffolds: Array<{ language: string; level: number; code: string }>) {
    const py: Record<number, string> = {};
    const cpp: Record<number, string> = {};
    for (const sc of scaffolds) {
        if (sc.language === 'python') py[sc.level] = sc.code;
        if (sc.language === 'cpp') cpp[sc.level] = sc.code;
    }
    return { py, cpp };
}
