export function isObjectiveChoiceProblem(pdoc: { config?: unknown } | null | undefined): boolean {
    const config = pdoc?.config;
    if (!config || typeof config !== 'object') return false;
    return (config as { type?: unknown }).type === 'objective';
}
