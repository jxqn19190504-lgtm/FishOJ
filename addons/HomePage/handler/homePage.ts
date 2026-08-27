import { Handler, PRIV, SystemModel, problem, record } from 'hydrooj';
import { defaultHomeNotice, HOME_NOTICE_KEY } from '../lib/notice';

function formatCount(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export class HomePageHandler extends Handler {
    noCheckPermView = true;

    async get() {
        const domainId = this.domain._id;

        let problemCount = 0;
        let submissionCount = 0;
        try {
            problemCount = await problem.getMulti(domainId).count();
        } catch {
            problemCount = 0;
        }
        try {
            submissionCount = await record.getMulti(domainId).count();
        } catch {
            submissionCount = 0;
        }

        let homeNotice = defaultHomeNotice;
        try {
            homeNotice = String(SystemModel.get(HOME_NOTICE_KEY) || defaultHomeNotice);
        } catch {
            homeNotice = defaultHomeNotice;
        }

        const loggedIn = this.user.hasPriv(PRIV.PRIV_USER_PROFILE);

        this.response.template = 'fishoj_home.html';
        this.response.body = {
            page_name: 'home',
            problemCountText: formatCount(problemCount),
            submissionCountText: formatCount(submissionCount),
            homeNotice,
            loggedIn,
        };
    }
}
