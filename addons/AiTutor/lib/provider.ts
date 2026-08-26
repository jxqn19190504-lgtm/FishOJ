import type { TutorContext, TutorResponse } from '../types';
import { fallbackTutor } from './fallbackTutor';
import { looksLikeCodeLeak, teachingSystemPrompt, wrapUntrusted } from './sanitizer';
import { getEffectiveTutorSettings } from './tutorSettings';

const TIMEOUT_MS = 15000;

function parseJson(text: string): TutorResponse | null {
    const raw = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    try {
        const obj = JSON.parse(raw.slice(start, end + 1));
        if (!obj || typeof obj.message !== 'string') return null;
        return {
            progressSummary: String(obj.progressSummary || ''),
            errorCategory: String(obj.errorCategory || 'UNKNOWN'),
            focus: String(obj.focus || ''),
            hintLevel: Number(obj.hintLevel) || 1,
            message: String(obj.message),
            shouldShowCode: !!obj.shouldShowCode,
        };
    } catch {
        return null;
    }
}

export async function generateTutorHint(ctx: TutorContext, hintLevel: number): Promise<TutorResponse> {
    const fallback = () => fallbackTutor(ctx, hintLevel);
    const { key, base, model, local } = getEffectiveTutorSettings();
    if (!key && !local) return fallback();

    const user = [
        wrapUntrusted('problem', JSON.stringify({
            title: ctx.problem.title,
            pid: ctx.problem.pid,
            description: ctx.problem.description.slice(0, 4000),
            examples: ctx.problem.examples.slice(0, 3),
        })),
        wrapUntrusted('learning', JSON.stringify(ctx.learning)),
        wrapUntrusted('editor', JSON.stringify(ctx.editor)),
        wrapUntrusted('last_run', JSON.stringify(ctx.run || {})),
        wrapUntrusted('history', JSON.stringify(ctx.history)),
        `请按 hintLevel=${hintLevel} 给出启发式提示。`,
    ].join('\n');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key || 'local'}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.3,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: teachingSystemPrompt(hintLevel) },
                    { role: 'user', content: user },
                ],
            }),
            signal: ctrl.signal,
        });
        if (!res.ok) return fallback();
        const data = await res.json() as any;
        const text = data?.choices?.[0]?.message?.content || '';
        const parsed = parseJson(text);
        if (!parsed) return fallback();
        parsed.hintLevel = hintLevel;
        if (hintLevel < 4) parsed.shouldShowCode = false;
        if (looksLikeCodeLeak(parsed.message, hintLevel)) return fallback();
        return parsed;
    } catch {
        return fallback();
    } finally {
        clearTimeout(timer);
    }
}
