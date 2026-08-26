export function classifyError(opts: {
    status?: string;
    stderr?: string;
    stdout?: string;
    expected?: string;
    progress: Record<string, string>;
}): string {
    const st = (opts.status || '').toUpperCase();
    const err = `${opts.stderr || ''}\n${opts.stdout || ''}`;
    if (st.includes('COMPILE') || /SyntaxError|error:/i.test(err)) return 'SYNTAX';
    if (st.includes('RUNTIME') || /IndexError|ZeroDivision|segfault|RE/i.test(err)) return 'RUNTIME';
    if (st.includes('TIME') || st.includes('TLE')) return 'PERFORMANCE';
    if (st.includes('ACCEPT')) return 'NONE';
    if (opts.progress.compare_c === 'missing' && opts.progress.compare_b === 'completed') {
        return 'LOGIC_INCOMPLETE';
    }
    if (opts.progress.read_input === 'missing') return 'INPUT';
    if (opts.progress.print === 'missing') return 'OUTPUT';
    if (st.includes('WRONG') || (opts.expected && opts.stdout != null && opts.expected.trim() !== String(opts.stdout).trim())) {
        return 'LOGIC';
    }
    return 'UNKNOWN';
}
