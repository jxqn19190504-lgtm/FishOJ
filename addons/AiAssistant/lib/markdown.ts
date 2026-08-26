/** 简易 Markdown → HTML（服务端 SSE 用；不做完整 CommonMark） */

function escapeHtml(text: string): string {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function inlineMd(s: string): string {
    let t = escapeHtml(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
    return t;
}

/**
 * 将 Markdown 转为安全 HTML（先整段转义，再套标签；代码块内容已转义）。
 */
export function renderAiAnalysisMarkdown(raw: string): string {
    const src = String(raw || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return '';

    const parts: string[] = [];
    const lines = src.split('\n');
    let i = 0;
    let inList: 'ul' | 'ol' | null = null;

    const closeList = () => {
        if (inList) {
            parts.push(inList === 'ul' ? '</ul>' : '</ol>');
            inList = null;
        }
    };

    while (i < lines.length) {
        const line = lines[i];

        // fenced code
        const fence = line.match(/^```([\w+-]*)\s*$/);
        if (fence) {
            closeList();
            const lang = fence[1] || '';
            i += 1;
            const buf: string[] = [];
            while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                buf.push(lines[i]);
                i += 1;
            }
            i += 1; // closing fence
            const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
            parts.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
            continue;
        }

        if (/^\s*$/.test(line)) {
            closeList();
            i += 1;
            continue;
        }

        const h = line.match(/^(#{1,6})\s+(.+)$/);
        if (h) {
            closeList();
            const level = h[1].length;
            parts.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
            i += 1;
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            if (inList !== 'ul') {
                closeList();
                parts.push('<ul>');
                inList = 'ul';
            }
            parts.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
            i += 1;
            continue;
        }

        if (/^\d+\.\s+/.test(line)) {
            if (inList !== 'ol') {
                closeList();
                parts.push('<ol>');
                inList = 'ol';
            }
            parts.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`);
            i += 1;
            continue;
        }

        if (/^>\s?/.test(line)) {
            closeList();
            parts.push(`<blockquote><p>${inlineMd(line.replace(/^>\s?/, ''))}</p></blockquote>`);
            i += 1;
            continue;
        }

        if (/^---+$/.test(line.trim())) {
            closeList();
            parts.push('<hr>');
            i += 1;
            continue;
        }

        closeList();
        const para: string[] = [line];
        i += 1;
        while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])) {
            para.push(lines[i]);
            i += 1;
        }
        parts.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
    }
    closeList();
    return parts.join('\n');
}

export function renderMdSafe(raw: string): string {
    try {
        return renderAiAnalysisMarkdown(raw);
    } catch {
        return escapeHtml(String(raw || '')).replace(/\n/g, '<br>');
    }
}
