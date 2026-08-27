import type { AssistantHistoryMessage } from './assistant-types';

/** 滑动窗口：最多保留最近 N 轮完整对话（每轮 = user + assistant） */
export const ASSISTANT_MAX_HISTORY_TURNS = 5;

/** 单条历史纯文本上限（超出截断尾部） */
export const ASSISTANT_MAX_HISTORY_MESSAGE_LEN = 1500;

/** 历史总纯文本上限；超出时从窗口最旧侧滑出整轮 */
export const ASSISTANT_MAX_HISTORY_TOTAL_CHARS = 8000;

export type AssistantHistoryWindowOptions = {
  maxTurns?: number;
  maxMessageLen?: number;
  maxTotalChars?: number;
};

type HistoryTurn = {
  messages: AssistantHistoryMessage[];
};

function normalizeMessage(
  m: AssistantHistoryMessage,
  maxMessageLen: number,
): AssistantHistoryMessage | null {
  const role = m?.role === 'assistant' ? 'assistant' : 'user';
  const content = String(m?.content || '').trim().slice(0, maxMessageLen);
  if (!content) return null;
  return { role, content };
}

/**
 * 将消息序列切成「轮次」。
 * 优先组成 [user, assistant]；落单的 user / assistant 各自成一轮，便于按轮滑动。
 */
export function pairAssistantHistoryTurns(
  messages: AssistantHistoryMessage[],
): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  let i = 0;
  while (i < messages.length) {
    const cur = messages[i];
    const next = messages[i + 1];
    if (cur.role === 'user' && next?.role === 'assistant') {
      turns.push({ messages: [cur, next] });
      i += 2;
      continue;
    }
    turns.push({ messages: [cur] });
    i += 1;
  }
  return turns;
}

function turnCharCount(turn: HistoryTurn): number {
  return turn.messages.reduce((sum, m) => sum + m.content.length, 0);
}

function flattenTurns(turns: HistoryTurn[]): AssistantHistoryMessage[] {
  const out: AssistantHistoryMessage[] = [];
  for (const t of turns) out.push(...t.messages);
  return out;
}

/**
 * 滑动窗口裁剪历史对话，控制注入长度与额度消耗。
 *
 * 规则：
 * 1. 规范化角色与单条长度；
 * 2. 若窗口以 orphan assistant 开头则滑掉（保证从 user 对齐）；
 * 3. 只保留最近 maxTurns 轮；
 * 4. 总字符超预算时，从最旧轮次一侧整轮滑出，直到落入预算。
 */
export function slideAssistantHistoryWindow(
  messages: AssistantHistoryMessage[] | null | undefined,
  options?: AssistantHistoryWindowOptions,
): AssistantHistoryMessage[] {
  const maxTurns = Math.max(1, options?.maxTurns ?? ASSISTANT_MAX_HISTORY_TURNS);
  const maxMessageLen = Math.max(64, options?.maxMessageLen ?? ASSISTANT_MAX_HISTORY_MESSAGE_LEN);
  const maxTotalChars = Math.max(maxMessageLen, options?.maxTotalChars ?? ASSISTANT_MAX_HISTORY_TOTAL_CHARS);

  const normalized: AssistantHistoryMessage[] = [];
  for (const raw of messages || []) {
    const m = normalizeMessage(raw, maxMessageLen);
    if (m) normalized.push(m);
  }
  if (!normalized.length) return [];

  let turns = pairAssistantHistoryTurns(normalized);

  // 对齐：不以 assistant 独条开窗（缺少对应 user，对模型无意义且浪费额度）
  while (turns.length > 0) {
    const first = turns[0].messages;
    if (first.length === 1 && first[0].role === 'assistant') {
      turns = turns.slice(1);
      continue;
    }
    break;
  }

  // 轮次滑动：只保留最近 N 轮
  if (turns.length > maxTurns) {
    turns = turns.slice(-maxTurns);
  }

  // 字符预算滑动：从最旧侧整轮滑出
  let total = turns.reduce((sum, t) => sum + turnCharCount(t), 0);
  while (turns.length > 1 && total > maxTotalChars) {
    total -= turnCharCount(turns[0]);
    turns = turns.slice(1);
  }

  // 仍超预算（只剩 1 轮）：再截断该轮内消息内容
  if (turns.length === 1 && total > maxTotalChars) {
    const only = turns[0].messages.map((m) => ({ ...m }));
    let budget = maxTotalChars;
    for (let i = 0; i < only.length; i += 1) {
      if (budget <= 0) {
        only[i].content = '';
        continue;
      }
      if (only[i].content.length > budget) {
        only[i].content = `${only[i].content.slice(0, Math.max(0, budget - 1))}…`;
      }
      budget -= only[i].content.length;
    }
    return only.filter((m) => m.content);
  }

  return flattenTurns(turns);
}
