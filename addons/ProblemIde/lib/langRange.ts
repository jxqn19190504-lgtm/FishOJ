import { SettingModel } from 'hydrooj';

export function buildLangRange(pdoc: { config?: unknown }): Record<string, string> {
    const cfg = pdoc?.config;
    const langs = (typeof cfg === 'object' && cfg && Array.isArray((cfg as { langs?: string[] }).langs))
        ? (cfg as { langs: string[] }).langs
        : [];
    const range = SettingModel.SETTINGS_BY_KEY.codeLang.range as Record<string, string>;
    if (!langs.length) return { ...range };
    return Object.fromEntries(
        langs
            .filter((i) => SettingModel.langs[i] && !(SettingModel.langs[i] as { disabled?: boolean }).disabled)
            .map((i) => [i, (SettingModel.langs[i] as { display?: string })?.display || i]),
    );
}
