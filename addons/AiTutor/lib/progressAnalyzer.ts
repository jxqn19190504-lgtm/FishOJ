export type ProgressMap = Record<string, 'completed' | 'missing' | 'unknown'>;

export function analyzeProgress(code: string, stages: Array<{ id: string }>): ProgressMap {
    const out: ProgressMap = {};
    const hasInput = /input\s*\(|cin\s*>>|scanf\s*\(/.test(code);
    const hasPrint = /print\s*\(|cout\s*<<|printf\s*\(/.test(code);
    const ifCount = (code.match(/\bif\b/g) || []).length;
    const hasMax = /max[_]?value|maxn|ans\b|最大/.test(code);
    const blankIf = /if\s*[_()]|if\s+_{2,}/.test(code);

    const guess: Record<string, 'completed' | 'missing'> = {
        read_input: hasInput ? 'completed' : 'missing',
        init_max: hasMax && !/max_value\s*=\s*_{2,}/.test(code) ? 'completed' : 'missing',
        compare_b: ifCount >= 1 && !blankIf ? 'completed' : 'missing',
        compare_c: ifCount >= 2 && !blankIf ? 'completed' : 'missing',
        print: hasPrint && !/print\s*\(\s*_{2,}/.test(code) ? 'completed' : 'missing',
    };

    for (const s of stages) {
        out[s.id] = guess[s.id] || 'unknown';
    }
    if (!stages.length) {
        Object.assign(out, guess);
    }
    return out;
}

export function summarizeProgress(map: ProgressMap, stages: Array<{ id: string; title: string }>): string {
    const done: string[] = [];
    const miss: string[] = [];
    for (const s of stages) {
        if (map[s.id] === 'completed') done.push(s.title);
        if (map[s.id] === 'missing') miss.push(s.title);
    }
    const a = done.length ? `已完成：${done.join('、')}` : '还没有明确完成的步骤';
    const b = miss.length ? `还缺：${miss.join('、')}` : '';
    return [a, b].filter(Boolean).join('。');
}
