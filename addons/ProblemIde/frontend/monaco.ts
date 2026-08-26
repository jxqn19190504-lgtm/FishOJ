import { MONACO_VS_SOURCES } from './constants';

function loadMonacoFromBase(base: string): Promise<typeof import('monaco-editor')> {
    return new Promise((resolve, reject) => {
        const w = window as unknown as { monaco?: typeof import('monaco-editor'); require?: any };
        const script = document.createElement('script');
        let settled = false;
        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            script.remove();
            if (err) reject(err);
        };
        const timeoutId = window.setTimeout(() => finish(new Error(`加载超时: ${base}`)), 15000);
        script.onload = () => {
            if (!w.require) { finish(new Error('window.require 未定义')); return; }
            w.require.config({ paths: { vs: base } });
            w.require(['vs/editor/editor.main'], () => {
                if (settled) return;
                if (w.monaco) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve(w.monaco);
                } else finish(new Error('Monaco not defined'));
            }, (err: unknown) => finish(new Error(String(err))));
        };
        script.onerror = () => finish(new Error(`Script 加载失败: ${base}`));
        script.src = `${base}/loader.js`;
        document.head.appendChild(script);
    });
}

export async function loadMonacoEditor() {
    const w = window as unknown as { monaco?: typeof import('monaco-editor') };
    if (w.monaco) return w.monaco;
    let lastErr: Error | null = null;
    for (const base of MONACO_VS_SOURCES) {
        try { return await loadMonacoFromBase(base); } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
        }
    }
    throw lastErr || new Error('Monaco 加载失败');
}

export function mapMonacoLang(lang: string) {
    const l = lang.toLowerCase();
    if (l.includes('python') || l.startsWith('py')) return 'python';
    if (l.startsWith('java') && !l.includes('script')) return 'java';
    if (l.includes('node') || l.includes('javascript') || l.startsWith('js')) return 'javascript';
    if (l.startsWith('go')) return 'go';
    if (l.includes('rust')) return 'rust';
    return 'cpp';
}
