export function initExpMode(rootEl: HTMLElement) {
    const practice = document.getElementById('problemIdeModePractice');
    const exam = document.getElementById('problemIdeModeExam');
    const apply = (mode: string) => {
        practice?.classList.toggle('problem-ide-exp-mode__btn--active', mode === 'practice');
        exam?.classList.toggle('problem-ide-exp-mode__btn--active', mode === 'exam');
        rootEl.classList.toggle('problem-ide-root--exam', mode === 'exam');
        localStorage.setItem('problem_ide_exp_mode_v1', mode);
    };
    practice?.addEventListener('click', () => apply('practice'));
    exam?.addEventListener('click', () => apply('exam'));
    const saved = localStorage.getItem('problem_ide_exp_mode_v1');
    if (saved === 'exam') apply('exam');
}
