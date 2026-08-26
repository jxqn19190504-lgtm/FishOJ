/** 学生端三种学习方式 → 内部 S0/S1/S3（S2 留给教师精细模板，学生「框架」用 S1） */
export const MODE_TO_LEVEL: Record<0 | 1 | 2, number> = {
    0: 0,
    1: 1,
    2: 3,
};

export const MODE_LABELS = [
    {
        mode: 0 as const,
        emoji: '🚀',
        title: '自己挑战',
        desc: '从头开始，我想自己想办法',
    },
    {
        mode: 1 as const,
        emoji: '🧩',
        title: '给我一点框架',
        desc: '帮我搭好程序的大致结构',
    },
    {
        mode: 2 as const,
        emoji: '🤝',
        title: '陪我一步一步做',
        desc: '先帮我完成基础部分，我完成最重要的地方',
    },
];

export function levelForMode(mode: number): number {
    if (mode === 1) return 1;
    if (mode === 2) return 3;
    return 0;
}

export function normalizeLangKey(lang: string): string {
    const k = (lang || '').toLowerCase();
    if (k.startsWith('py')) return 'python';
    if (k.startsWith('cc') || k === 'c' || k.startsWith('cpp')) return 'cpp';
    if (k.startsWith('java')) return 'java';
    return k.split('.')[0] || 'python';
}
