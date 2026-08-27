import {
    Handler, param, PRIV, ProblemModel, Types,
} from 'hydrooj';
import { getTextSolution, saveTextSolution } from '../lib/ProblemSolutionUtils';
import { getPublisherUids, savePublisherUids } from '../lib/solutionSettings';

function parseUidLines(raw: string): number[] {
    return String(raw || '').split(/[\n,;]+/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
}

export class SolutionManageHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        this.response.template = 'manage_problem_solution.html';
        this.response.body = {
            page_name: 'manage_problem_solution',
            publisherUids: getPublisherUids(),
        };
    }

    @param('pid', Types.String)
    async post(domainId: string, pid: string) {
        this.response.redirect = this.url('manage_problem_solution_edit', { pid });
    }
}

export class SolutionEditHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    private resolvePid(): string {
        return String(this.request.params.pid || this.request.query.pid || '').trim();
    }

    async get(domainId: string) {
        const pid = this.resolvePid();
        if (!pid) {
            this.response.redirect = this.url('manage_problem_solution');
            return;
        }
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) {
            this.response.body = { message: `${pid} not found` };
            return;
        }
        const solContent = await getTextSolution(domainId, pdoc);
        const isMarkdownEdit = String(this.request.path || '').endsWith('/markdown_edit');
        this.response.template = isMarkdownEdit ? 'markdown_edit.html' : 'solution_edit.html';
        this.response.body = {
            page_name: isMarkdownEdit ? 'markdown_edit' : 'manage_problem_solution_edit',
            pid,
            pdoc,
            solContent,
            publisherUids: getPublisherUids(),
        };
    }

    @param('pid', Types.String, true)
    @param('solContent', Types.String, true)
    @param('publisher_uids', Types.String, true)
    async post(
        domainId: string,
        pid?: string,
        solContent?: string,
        publisher_uids?: string,
    ) {
        const resolvedPid = String(pid || this.resolvePid()).trim();
        if (!resolvedPid) {
            this.response.status = 400;
            return;
        }
        const pdoc = await ProblemModel.get(domainId, resolvedPid);
        if (!pdoc) {
            this.response.status = 404;
            return;
        }
        if (publisher_uids != null && this.request.path.startsWith('/manage/')) {
            await savePublisherUids(parseUidLines(publisher_uids));
        }
        if (solContent != null) {
            await saveTextSolution(domainId, pdoc, solContent);
        }
        if (this.request.path === '/markdown_edit') {
            this.response.status = 200;
            this.response.ok = true;
            return;
        }
        this.back();
    }
}
