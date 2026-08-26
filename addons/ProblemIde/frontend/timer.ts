export function initTimer() {
    const display = document.getElementById('problemIdeTimerDisplay') as HTMLButtonElement | null;
    const panel = document.getElementById('problemIdeTimerPanel');
    const startBtn = document.getElementById('problemIdeTimerStartPauseBtn') as HTMLButtonElement | null;
    const resetBtn = document.getElementById('problemIdeTimerResetBtn') as HTMLButtonElement | null;
    if (!display || !panel || !startBtn || !resetBtn) return;
    let running = false;
    let acc = 0;
    let startedAt = 0;
    let tick: number | null = null;
    const fmt = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
    };
    const nowVal = () => acc + (running ? Date.now() - startedAt : 0);
    const render = () => { display.textContent = fmt(nowVal()); };
    startBtn.addEventListener('click', () => {
        if (running) {
            acc = nowVal();
            running = false;
            if (tick) window.clearInterval(tick);
            tick = null;
            startBtn.textContent = '开始';
        } else {
            startedAt = Date.now();
            running = true;
            startBtn.textContent = '暂停';
            tick = window.setInterval(render, 250);
        }
        render();
    });
    resetBtn.addEventListener('click', () => {
        running = false;
        acc = 0;
        if (tick) window.clearInterval(tick);
        tick = null;
        startBtn.textContent = '开始';
        render();
    });
    display.addEventListener('click', () => {
        panel.classList.toggle('problem-ide-settings--hidden');
        display.setAttribute('aria-expanded', panel.classList.contains('problem-ide-settings--hidden') ? 'false' : 'true');
    });
}
