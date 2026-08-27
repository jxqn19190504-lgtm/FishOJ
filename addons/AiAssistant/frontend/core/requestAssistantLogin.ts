/**
 * 与题目页一致的登录请求：优先站内登录弹窗，避免整页跳 /login 后被 SPA 回跳抢走。
 */
export function requestAssistantLogin(): void {
  const w = window as Window & {
    showSignInDialog?: () => void;
  };
  if (typeof w.showSignInDialog === 'function') {
    w.showSignInDialog();
    return;
  }
  const navLogin = document.getElementsByName('nav_login')[0] as HTMLElement | undefined;
  if (navLogin) {
    navLogin.click();
    return;
  }
  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?redirect=${redirect}`;
}
