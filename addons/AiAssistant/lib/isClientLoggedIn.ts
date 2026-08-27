/** FishOJ：判断浏览器是否已登录（无 codefun src 依赖） */
export function isClientLoggedIn(): boolean {
    try {
        const u = (window as any).UserContext;
        if (u && Number(u._id) > 0) return true;
    } catch { /* ignore */ }
    try {
        const bodyUid = document.body?.getAttribute('data-uid');
        if (bodyUid && Number(bodyUid) > 0) return true;
    } catch { /* ignore */ }
    return false;
}
