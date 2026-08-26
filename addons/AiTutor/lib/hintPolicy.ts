export function nextHintLevel(opts: {
    current: number;
    maxLevel: number;
    trigger: string;
    codeChanged: boolean;
    errorChanged: boolean;
    status?: string;
}): number {
    const max = Math.min(4, Math.max(1, opts.maxLevel || 4));
    if ((opts.status || '').toUpperCase().includes('ACCEPT')) return opts.current || 1;
    if (opts.trigger === 'user_help') {
        if (!opts.current) return 1;
        if (!opts.codeChanged) return Math.min(max, opts.current + 1);
        return Math.min(max, Math.max(1, opts.current));
    }
    return Math.min(max, Math.max(1, opts.current || 1));
}

export function hashCode(code: string): string {
    let h = 0;
    const s = code.replace(/\s+/g, ' ').trim();
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(h);
}
