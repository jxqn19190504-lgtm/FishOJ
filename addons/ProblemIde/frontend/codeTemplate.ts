export function resolveUserCodeTemplateString(lang: string, tpl: Record<string, string> | string): string | null {
    if (typeof tpl === 'string') return tpl;
    if (tpl[lang]) return tpl[lang];
    const prefix = lang.split('.')[0];
    for (const [k, v] of Object.entries(tpl)) {
        if (k === prefix || k.startsWith(`${prefix}.`)) return v;
    }
    return null;
}
