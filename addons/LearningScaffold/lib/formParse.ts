export function parseLines(s: string): string[] {
    return String(s || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
}

export function parseStages(s: string): Array<{ id: string; title: string }> {
    return parseLines(s).map((line) => {
        const [id, ...rest] = line.split('|');
        return { id: (id || '').trim(), title: rest.join('|').trim() || (id || '').trim() };
    }).filter((row) => row.id);
}

export function formFlag(args: Record<string, unknown>, key: string): boolean {
    const v = args[key];
    return v === 'on' || v === true || v === '1';
}

export function formStr(args: Record<string, unknown>, key: string): string {
    return String(args[key] ?? '');
}
