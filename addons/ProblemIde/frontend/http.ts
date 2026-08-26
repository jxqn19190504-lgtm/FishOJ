export function getWsPrefix(): string {
    const UiContext = (window as any).UiContext || {};
    if (UiContext.ws_prefix) return UiContext.ws_prefix;
    const p = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${p}//${window.location.host}/`;
}

export async function promiseWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let to: ReturnType<typeof setTimeout> | undefined;
    const timeoutP = new Promise<never>((_, rej) => {
        to = setTimeout(() => rej(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)), ms);
    });
    try {
        return await Promise.race([p, timeoutP]);
    } finally {
        if (to) clearTimeout(to);
    }
}
