/** FishOJ：无 CodeNote / ProblemSet 时的空实现 */
export const ProblemSetService = {
    async getById() { return null; },
    async getByAbbr() { return null; },
    async userOwnsAnyLinkedProblemSet() { return false; },
    async userHasPaidProblemSetPurchase() { return false; },
    async checkProblemPermission() { return true; },
    async getProblemSetsBypid() { return []; },
};

export const ProblemInfoModel = {
    async get() { return null; },
    async getByPid() { return null; },
};

export async function getTextSolution(_domainId: string, _docId: number): Promise<string> {
    return '';
}

export const CodeNoteValidator = {
    assertValid() { /* no-op */ },
};

export async function getCodenoteVisibilityForProblem() {
    return { visibility: 'public' as const };
}

export function canViewCodenoteByVisibility() {
    return true;
}
