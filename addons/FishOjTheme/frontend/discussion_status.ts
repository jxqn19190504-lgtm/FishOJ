// ============================================================
// FishOJ · 深海鎏金 · 讨论页状态增强（discussion_status.ts）
// 落点：theme 插件全局注入，仅对讨论页（/discuss*）生效。
// 三大创新（与预览一致，不改内核、零额外请求）：
//   ① 空状态三步上手指引（页面越空越有用，当前主菜）
//   ② 右侧栏鎏金「创建讨论」卡（附加 CTA，安全插入，不依赖现有按钮）
//   ③ 节点磁贴加彩色图标 + 计数徽标（页面已有数据则显示）
//   ④ 有内容后：列表卡片化 + 排序 Tab（未来-proof，仅当存在列表时注入）
// 防御式实现：多重选择器 + 文本内容检测 + 已处理守卫 + MutationObserver 兜底 SPA。
// ============================================================

const FISH_DISCUSS_FLAG = 'data-fish-discuss';

/** 依据节点名称挑一个彩色图标 */
function pickNodeIcon(name: string): string {
    const n = name || '';
    if (/题解|题|解|代码|ac\b|acm/i.test(n)) return '📘';
    if (/求助|问|帮|wa|bug|错误|错/i.test(n)) return '🙋';
    if (/比赛|赛|contest|复盘/i.test(n)) return '🏆';
    if (/公告|通知|announce|站务/i.test(n)) return '📢';
    if (/灌水|闲聊|水|闲|摸鱼|日常/i.test(n)) return '☕';
    return '💬';
}

/** 找到空状态占位（Hydro 的 .nothing 组件或中文文案） */
function findEmptyState(): HTMLElement | null {
    const byClass = document.querySelector<HTMLElement>(
        'body.page--discussion_main .nothing, body.page--discussion_main .empty-line, .nothing, .empty-line',
    );
    if (byClass) return byClass;
    // 文本兜底：抓取包含「没有讨论」且短小的叶子节点
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('*'));
    for (const el of candidates) {
        const txt = (el.textContent || '').trim();
        if (/目前没有讨论|暂无讨论|还没有讨论|没有讨论|暂无内容/i.test(txt) && txt.length < 60 && el.children.length <= 1) {
            return el;
        }
    }
    return null;
}

/** ① 空状态三步引导 */
function enhanceEmptyState(): void {
    if (document.querySelector('.fish-discuss-guide')) return;
    const empty = findEmptyState();
    if (!empty) return;

    // 在节点页（/discuss/node/xxx）时，创建链接直接指向该节点，而不是通用的 /discuss/create
    const nodeMatch = /^\/discuss\/node\/([^/]+)/.exec(location.pathname);
    const createUrl = nodeMatch ? `/discuss/node/${nodeMatch[1]}/create` : '/discuss/create';

    const guide = document.createElement('div');
    guide.className = 'fish-discuss-guide';
    guide.innerHTML = `
        <div class="fish-guide-bubble">💬</div>
        <h3 class="fish-guide-title">讨论区还是一片深海静水</h3>
        <p class="fish-guide-sub">发第一条讨论，让这里热闹起来！按下面三步走就行：</p>
        <div class="fish-guide-steps">
            <div class="fish-step">
                <span class="fish-step-n">1</span>
                <div class="fish-step-ic">🏗</div>
                <b class="fish-step-title">管理员建节点</b>
                <span class="fish-step-desc">讨论节点需由管理员在后台创建，分类如：题解分享、求助、公告、灌水</span>
                <span class="fish-step-go fish-step-go--muted">节点标识建议用英文，如 solutions</span>
            </div>
            <div class="fish-step">
                <span class="fish-step-n">2</span>
                <div class="fish-step-ic">✍️</div>
                <b class="fish-step-title">点击「创建讨论」</b>
                <span class="fish-step-desc">选一个节点，写好标题和内容，支持 Markdown</span>
                <a class="fish-step-go" href="${createUrl}">前往创建 →</a>
            </div>
            <div class="fish-step">
                <span class="fish-step-n">3</span>
                <div class="fish-step-ic">🎉</div>
                <b class="fish-step-title">邀请同学来回复</b>
                <span class="fish-step-desc">分享链接到群里，第一条回复就会浮出水面</span>
                <span class="fish-step-go fish-step-go--muted">把链接甩进班级群即可 🚀</span>
            </div>
        </div>
        <a class="fish-guide-btn" href="${createUrl}">✍️ 立即创建第一条讨论</a>
        <p class="fish-guide-hint">不是管理员？先 @ 一下管理员建好节点，再来发帖～</p>
    `;
    empty.insertAdjacentElement('afterend', guide);
    // 原始空状态已被引导卡取代：标记隐藏，避免两个元素在 flex 父级里挤成一行
    empty.classList.add('fish-empty-replaced');
}

/** ② 左右两栏：主内容在左，「创建讨论 + 讨论节点」在右上，顶部水平对齐
 *  FishOJ 主题下 Hydro 的 .medium-9/.medium-3 网格不生效（右栏会被堆到主内容下方），
 *  所以这里不再依赖 Hydro 网格，直接自建两栏容器：
 *    · 左列：主内容 section（讨论列表 / 空状态引导卡）
 *    · 右列：把 Hydro 自带右栏的内容整块搬进来（创建讨论卡 + 讨论节点组件）；
 *            若页面没有右栏，则注入自带的鎏金「创建讨论」卡。 */
function enhanceCreateCard(): void {
    if (document.querySelector('.fish-discuss-layout')) return;

    const anchor = document.querySelector<HTMLElement>('.fish-discuss-guide, .section__list');
    const mainSection = (anchor?.closest('.section') as HTMLElement | null) || null;
    if (!mainSection || !mainSection.parentElement) return;

    // 找 Hydro 自带的右栏内容（同一 .row 下的另一列）
    const row = mainSection.closest('.row');
    const mainColumn = mainSection.closest('.columns');
    let sourceColumn: HTMLElement | null = null;
    if (row) {
        const cols = Array.from(row.querySelectorAll<HTMLElement>(':scope > .columns'));
        sourceColumn = cols.find((c) => c !== mainColumn) || null;
    }

    const wrap = document.createElement('div');
    wrap.className = 'fish-discuss-layout';
    const mainBox = document.createElement('div');
    mainBox.className = 'fish-discuss-layout__main';
    const sideBox = document.createElement('div');
    sideBox.className = 'fish-discuss-layout__side';

    // 插到 .row 这一层（绕开各列的宽度约束），并隐藏原来的两列
    const insertTarget: HTMLElement = row || mainSection.parentElement;
    insertTarget.insertBefore(wrap, row ? (mainColumn || mainSection) : mainSection);
    wrap.appendChild(mainBox);
    wrap.appendChild(sideBox);
    mainBox.appendChild(mainSection);
    if (row && mainColumn) mainColumn.style.display = 'none';

    if (sourceColumn && sourceColumn.children.length) {
        // 把页面的右栏内容搬进我们的右列（避免重复造卡），并隐藏原列
        for (const child of Array.from(sourceColumn.children)) sideBox.appendChild(child);
        sourceColumn.style.display = 'none';
        Array.from(sideBox.querySelectorAll<HTMLElement>('.section.side'))
            .forEach((s) => s.classList.add('fish-side-gold'));
        return;
    }

    // 页面没有右栏 → 注入自带鎏金创建卡
    const nodeMatch2 = /^\/discuss\/node\/([^/]+)/.exec(location.pathname);
    const createUrl2 = nodeMatch2 ? `/discuss/node/${nodeMatch2[1]}/create` : '/discuss/create';
    const card = document.createElement('div');
    card.className = 'fish-create-card';
    card.innerHTML = `
        <h4 class="fish-create-card__title">✍️ 创建讨论</h4>
        <p class="fish-create-card__desc">有问题？有题解想分享？选一个节点开始发言。</p>
        <a class="fish-create-card__btn" href="${createUrl2}">开始创建 →</a>
    `;
    sideBox.appendChild(card);
}

/** ③ 节点磁贴加彩色图标 + 计数徽标 */
function enhanceNodes(): void {
    const nodeItems = Array.from(
        document.querySelectorAll<HTMLElement>(
            'body.page--discussion_main .group-list > *, body.page--discussion_main .section__list__item',
        ),
    );
    for (const item of nodeItems) {
        if (item.querySelector('.fish-node-ic')) continue;
        const link = item.querySelector<HTMLElement>('a') || item;
        const name = (link.textContent || '').trim();
        const icon = pickNodeIcon(name);
        const ic = document.createElement('span');
        ic.className = 'fish-node-ic';
        ic.textContent = icon;
        link.insertAdjacentElement('afterbegin', ic);

        // 计数徽标：若名称里含有 (12) / 12 篇 之类的数字，提取并徽标化
        const m = name.match(/[（(]?\s*(\d+)\s*(篇|条|个|帖)?\s*[）)]?/);
        if (m) {
            const cnt = document.createElement('span');
            cnt.className = 'fish-node-cnt';
            cnt.textContent = m[1];
            link.insertAdjacentElement('beforeend', cnt);
        }
    }
}

/** ④ 有内容后：列表卡片化 + 排序 Tab（未来-proof） */
function enhanceListAndSort(): void {
    const listItems = document.querySelectorAll<HTMLElement>(
        'body.page--discussion_main .discussion__item, body.page--discussion_main [class*="discussion"] > [class*="item"]',
    );
    if (listItems.length === 0) return; // 当前为空，不注入
    if (document.querySelector('.fish-sort-tabs')) return;
    const listWrap = listItems[0].parentElement;
    if (!listWrap) return;
    const tabs = document.createElement('div');
    tabs.className = 'fish-sort-tabs';
    tabs.innerHTML = `
        <a class="fish-sort-tab fish-sort-tab--on" href="/discuss?sort=reply">🔥 最新回复</a>
        <a class="fish-sort-tab" href="/discuss?sort=time">✨ 最新发布</a>
        <a class="fish-sort-tab" href="/discuss?sort=hot">🏆 精华</a>
    `;
    listWrap.insertAdjacentElement('beforebegin', tabs);
}

function runDiscussionEnhance(): void {
    try {
        enhanceEmptyState();
        enhanceCreateCard();
        enhanceNodes();
        enhanceListAndSort();
    } catch {
        /* 单页异常不影响整站 */
    }
}

/** SPA 路由切换兜底 */
function observeDiscussion(): void {
    if (typeof MutationObserver === 'undefined') return;
    let timer: number | null = null;
    const debounced = () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(runDiscussionEnhance, 200);
    };
    const mo = new MutationObserver(debounced);
    mo.observe(document.body, { childList: true, subtree: true });
}

export function initDiscussionStatus(): void {
    if (typeof document === 'undefined') return;
    const isDiscuss =
        /^\/discuss(\/|$)/.test(location.pathname) ||
        !!document.querySelector('body.page--discussion_main, .group-list, [class*="discussion_main"]');
    if (!isDiscuss) return;
    if (document.documentElement.getAttribute(FISH_DISCUSS_FLAG)) {
        // 已初始化过，仅做一次增量增强（如 SPA 回到本页）
        runDiscussionEnhance();
        return;
    }
    document.documentElement.setAttribute(FISH_DISCUSS_FLAG, '1');
    const mount = () => {
        runDiscussionEnhance();
        observeDiscussion();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
}
