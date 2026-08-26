import { ProblemModel } from 'hydrooj';
import type { TutorContext, TutorRun } from '../types';

function asText(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

export async function buildTutorContext(opts: {
    domainId: string;
    pid: string;
    language: string;
    code: string;
    run?: TutorRun;
    examples?: Array<{ input: string; output: string }>;
    learning?: {
        objectives?: string[];
        concepts?: string[];
        stages?: Array<{ id: string; title: string }>;
        commonMistakes?: string[];
        maxHintLevel?: number;
    };
    history: TutorContext['history'];
}): Promise<TutorContext> {
    const pdoc = await ProblemModel.get(opts.domainId, opts.pid);
    const title = pdoc?.title || opts.pid;
    const description = asText(pdoc?.content).slice(0, 8000);
    return {
        problem: {
            pid: String(pdoc?.pid || pdoc?.docId || opts.pid),
            title,
            description,
            examples: opts.examples || [],
            limits: asText((pdoc as any)?.config),
        },
        learning: {
            objectives: opts.learning?.objectives || [],
            concepts: opts.learning?.concepts || [],
            stages: opts.learning?.stages || [],
            commonMistakes: opts.learning?.commonMistakes || [],
            maxHintLevel: opts.learning?.maxHintLevel ?? 4,
        },
        editor: {
            language: opts.language,
            code: String(opts.code || '').slice(0, 20000),
        },
        run: opts.run,
        history: opts.history,
    };
}
