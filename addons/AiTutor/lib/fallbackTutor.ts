import type { TutorContext, TutorResponse } from '../types';
import { classifyError } from './errorClassifier';
import { analyzeProgress, summarizeProgress } from './progressAnalyzer';

function h1LogicIncomplete(ctx: TutorContext): string {
    const input = ctx.run?.input?.trim() || '样例输入';
    return `你已经比较了前两个数。现在看一下输入里的第三个数：它有没有机会和当前的最大值比较呢？\n（这组输入是：${input}）`;
}

export function fallbackTutor(ctx: TutorContext, hintLevel: number): TutorResponse {
    const progress = analyzeProgress(ctx.editor.code, ctx.learning.stages);
    const errorCategory = classifyError({
        status: ctx.run?.status,
        stderr: ctx.run?.stderr,
        stdout: ctx.run?.stdout,
        expected: ctx.run?.expected,
        progress,
    });
    const progressSummary = summarizeProgress(progress, ctx.learning.stages);
    const st = (ctx.run?.status || '').toUpperCase();
    let message = '先对照题目样例，看看程序读入了什么、输出了什么。';
    let focus = 'unknown';
    let shouldShowCode = false;

    if (st.includes('COMPILE') || errorCategory === 'SYNTAX') {
        focus = 'syntax';
        if (hintLevel <= 1) message = '程序好像没能读懂某一行。你可以看看报错箭头指向了哪里。';
        else if (hintLevel === 2) message = '看一下报错那一行末尾，是不是少了这种语言需要的符号？';
        else if (hintLevel === 3) message = 'Python 的 if / for 这一行末尾通常需要冒号 : 。其它语言请对照报错信息。';
        else {
            message = '把报错指向的那一行补全语法后再运行。不要一次改很多处，先修好这一处。';
            shouldShowCode = true;
        }
    } else if (errorCategory === 'RUNTIME') {
        focus = 'runtime';
        if (hintLevel <= 1) message = '程序运行到某一步停下来了。想一想：你访问的位置，在当前数据里真的存在吗？';
        else if (hintLevel === 2) message = '运行时错误常常来自「下标越界」或「除以 0」。先数一数列表/数组有几个元素。';
        else message = '把可能越界的访问改成「先判断长度，再取值」。';
    } else if (errorCategory === 'PERFORMANCE') {
        focus = 'tle';
        if (hintLevel <= 1) message = '先不改代码。想一想：如果数据规模变得很大，你现在的循环大概要做多少次操作？';
        else message = '两层都按 n 循环时，n 很大就会很慢。看看有没有办法每个数只处理一次。';
    } else if (st.includes('ACCEPT')) {
        focus = 'understanding';
        message = '做对了！如果输入全是负数，你的程序还能得到正确答案吗？为什么初始值用「其中一个输入」往往比固定成 0 更安全？';
    } else if (errorCategory === 'LOGIC_INCOMPLETE' || errorCategory === 'LOGIC') {
        focus = 'compare_c';
        if (hintLevel <= 1) message = h1LogicIncomplete(ctx);
        else if (hintLevel === 2) {
            message = '找最大值时，每个还没有检查过的数字，都需要和「当前最大值」比较一次。你已经比较过一部分了，再看看有没有漏掉的那个数。';
        } else if (hintLevel === 3) {
            message = '你可能还需要这样的步骤：\n如果 当前数字 > 当前最大值：\n    更新当前最大值\n想一想，这两处「当前最大值」在你的代码里叫什么？';
        } else {
            shouldShowCode = true;
            message = '如果第三个数比当前最大值还大，就把它变成新的最大值。例如：\n```python\nif c > max_value:\n    max_value = c\n```';
        }
        if (ctx.run?.expected != null && ctx.run?.stdout != null && hintLevel >= 1) {
            message += `\n（程序输出 ${String(ctx.run.stdout).trim() || '空'}，样例期望 ${String(ctx.run.expected).trim()}）`;
        }
    } else if (errorCategory === 'INPUT') {
        focus = 'input';
        message = hintLevel <= 1
            ? '先确认题目要读入几个数、分几行。你现在的读入方式和题目描述一样吗？'
            : '这一题通常要先把题目给的数字读进变量，再开始比较。';
    } else if (errorCategory === 'OUTPUT') {
        focus = 'output';
        message = hintLevel <= 1
            ? '看看题目要求程序最后输出的内容，和你的输出是否完全一样？不要多打印说明文字。'
            : 'OJ 通常只要答案本身，例如一个数字，不要输出 “answer =”。';
    }

    return {
        progressSummary,
        errorCategory,
        focus,
        hintLevel,
        message,
        shouldShowCode,
    };
}
