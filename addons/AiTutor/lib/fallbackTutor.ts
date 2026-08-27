import type { TutorContext, TutorResponse } from '../types';
import { classifyError } from './errorClassifier';
import { analyzeProgress, summarizeProgress } from './progressAnalyzer';
import { polishProgressSummary, polishTutorMessage } from './sanitizer';

function h1LogicIncomplete(ctx: TutorContext): string {
    if (ctx.run?.expected != null && ctx.run?.stdout != null) {
        return '你的输出和样例不一样。先想想：有没有数还没参与比较？';
    }
    return '程序还没处理完所有情况。先想想：有没有漏掉要比较的那个数？';
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
    let message = '对照样例，看看程序读入和输出各是什么。';
    let focus = 'unknown';
    let shouldShowCode = false;

    if (st.includes('COMPILE') || errorCategory === 'SYNTAX') {
        focus = 'syntax';
        if (hintLevel <= 1) message = '编译没过。报错指向哪一行？';
        else if (hintLevel === 2) message = '看看那一行末尾，是不是少了冒号或括号？';
        else if (hintLevel === 3) message = 'Python 的 if、for 行末通常要有冒号 : 。';
        else {
            message = '先按报错修这一行，改完再运行。';
            shouldShowCode = true;
        }
    } else if (errorCategory === 'RUNTIME') {
        focus = 'runtime';
        if (hintLevel <= 1) message = '程序跑到某一步停了。你访问的位置，数据里真的有吗？';
        else if (hintLevel === 2) message = '常见原因是下标越界或除以 0。先数一数有几个元素。';
        else message = '取值前先判断长度，避免越界。';
    } else if (errorCategory === 'PERFORMANCE') {
        focus = 'tle';
        message = hintLevel <= 1
            ? '数据变大时，你的循环大概要做多少次？'
            : '试试让每个数只处理一次，减少嵌套循环。';
    } else if (st.includes('ACCEPT')) {
        focus = 'understanding';
        message = '对了！如果输入全是负数，你的写法还成立吗？';
    } else if (errorCategory === 'LOGIC_INCOMPLETE' || errorCategory === 'LOGIC') {
        focus = 'compare_c';
        if (hintLevel <= 1) message = h1LogicIncomplete(ctx);
        else if (hintLevel === 2) {
            message = '每个还没检查过的数，都要和当前最大值比一次。有漏的吗？';
        } else if (hintLevel === 3) {
            message = '如果某个数更大，就把它变成新的最大值。你代码里这一步写了吗？';
        } else {
            shouldShowCode = true;
            message = '可以这样更新最大值：\n```python\nif c > max_value:\n    max_value = c\n```';
        }
        if (ctx.run?.expected != null && ctx.run?.stdout != null && hintLevel >= 3) {
            message += `（输出 ${String(ctx.run.stdout).trim() || '空'}，期望 ${String(ctx.run.expected).trim()}）`;
        }
    } else if (errorCategory === 'INPUT') {
        focus = 'input';
        message = hintLevel <= 1
            ? '题目要读几个数？你的读法和题面一致吗？'
            : '先把题目给的数读进变量，再开始计算。';
    } else if (errorCategory === 'OUTPUT') {
        focus = 'output';
        message = hintLevel <= 1
            ? '最后输出的内容和题目要求完全一样吗？'
            : 'OJ 通常只要答案本身，不要多打说明文字。';
    }

    message = polishTutorMessage(message, hintLevel);
    const summary = polishProgressSummary(progressSummary, message);

    return {
        progressSummary: summary,
        errorCategory,
        focus,
        hintLevel,
        message,
        shouldShowCode,
    };
}
