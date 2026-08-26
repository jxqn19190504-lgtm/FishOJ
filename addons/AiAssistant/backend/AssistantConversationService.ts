import { db, ObjectId } from 'hydrooj';
import type {
  AssistantClientContext,
  AssistantFinishReason,
  AssistantHistoryMessage,
  AssistantMode,
  AssistantQuote,
} from '../shared/assistant-types';
import { slideAssistantHistoryWindow } from '../shared/assistant-history';
import { ASSISTANT_OUTPUT_FORMAT_VERSION } from '../shared/assistant-constants';

const conversationColl = db.collection('note_assistant_conversation' as any);

const MAX_CONVERSATIONS_PER_SCOPE = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const TITLE_MAX_LEN = 48;

export type StoredAssistantMessage = {
  role: 'user' | 'assistant';
  contentPlain: string;
  contentHtml: string;
  contentMarkdown?: string;
  formatVersion?: number;
  quote?: AssistantQuote | null;
  finishReason?: AssistantFinishReason | string;
  at: Date;
};

export type AssistantConversationListItem = {
  id: string;
  title: string;
  pid: string;
  mode: AssistantMode;
  messageCount: number;
  updatedAt: number;
};

export type AssistantConversationDetail = {
  id: string;
  abbreviation: string;
  pid: string;
  mode: AssistantMode;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    contentHtml: string;
    contentMarkdown?: string;
    contentPlain?: string;
    quote?: AssistantQuote | null;
    finishReason?: string;
  }>;
};

function stripHtmlTags(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTitle(question: string): string {
  const plain = String(question || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '新对话';
  return plain.length > TITLE_MAX_LEN ? `${plain.slice(0, TITLE_MAX_LEN)}…` : plain;
}

function isValidObjectId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(String(id || '').trim());
}

export class AssistantConversationService {
  static async ensureIndexes() {
    try {
      await conversationColl.createIndex(
        { domainId: 1, uid: 1, abbreviation: 1, updatedAt: -1 },
        { name: 'note_assistant_conv_uid_abbr_updated' },
      );
      await conversationColl.createIndex(
        { domainId: 1, uid: 1, abbreviation: 1, pid: 1, updatedAt: -1 },
        { name: 'note_assistant_conv_uid_abbr_pid_updated' },
      );
    } catch (e: any) {
      console.log('AssistantConversationService.ensureIndexes:', e?.message);
    }
  }

  static async appendTurn(input: {
    domainId: string;
    uid: number;
    conversationId?: string;
    clientContext: AssistantClientContext;
    userQuestion: string;
    userQuote?: AssistantQuote | null;
    assistantContentHtml: string;
    assistantContentMarkdown?: string;
    finishReason?: AssistantFinishReason | string;
  }): Promise<{ conversationId: string }> {
    const now = new Date();
    const userPlain = String(input.userQuestion || '').trim();
    const assistantHtml = String(input.assistantContentHtml || '').trim();
    const assistantPlain = stripHtmlTags(assistantHtml);
    if (!userPlain || !assistantHtml) {
      throw new Error('消息内容无效');
    }

    const userMsg: StoredAssistantMessage = {
      role: 'user',
      contentPlain: userPlain,
      contentHtml: `<p>${escapeHtml(userPlain)}</p>`,
      quote: input.userQuote || null,
      at: now,
    };
    const assistantMsg: StoredAssistantMessage = {
      role: 'assistant',
      contentPlain: assistantPlain || userPlain,
      contentHtml: assistantHtml,
      contentMarkdown: input.assistantContentMarkdown || undefined,
      formatVersion: ASSISTANT_OUTPUT_FORMAT_VERSION,
      finishReason: input.finishReason,
      at: new Date(now.getTime() + 1),
    };

    if (input.conversationId && isValidObjectId(input.conversationId)) {
      const oid = new ObjectId(input.conversationId);
      const existing = await conversationColl.findOne({
        _id: oid,
        domainId: input.domainId,
        uid: input.uid,
        abbreviation: input.clientContext.abbreviation,
      });
      if (existing) {
        const messages = Array.isArray(existing.messages) ? existing.messages.slice() : [];
        messages.push(userMsg, assistantMsg);
        const trimmed = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
        await conversationColl.updateOne(
          { _id: oid },
          {
            $set: {
              messages: trimmed,
              messageCount: trimmed.length,
              updatedAt: now,
              pid: input.clientContext.pid,
              mode: input.clientContext.mode,
            },
          },
        );
        return { conversationId: String(oid) };
      }
    }

    const insertResult = await conversationColl.insertOne({
      domainId: input.domainId,
      uid: input.uid,
      abbreviation: input.clientContext.abbreviation,
      pid: input.clientContext.pid,
      mode: input.clientContext.mode,
      title: buildTitle(userPlain),
      messages: [userMsg, assistantMsg],
      messageCount: 2,
      createdAt: now,
      updatedAt: now,
    });

    await this.trimOldConversations(
      input.domainId,
      input.uid,
      input.clientContext.abbreviation,
    );

    return { conversationId: String(insertResult.insertedId) };
  }

  static async list(input: {
    domainId: string;
    uid: number;
    abbreviation: string;
    pid?: string;
    limit?: number;
  }): Promise<AssistantConversationListItem[]> {
    const limit = Math.min(50, Math.max(1, input.limit || 30));
    const query: Record<string, unknown> = {
      domainId: input.domainId,
      uid: input.uid,
      abbreviation: input.abbreviation,
    };
    if (input.pid) query.pid = input.pid;

    const rows = await conversationColl
      .find(query, {
        projection: {
          title: 1,
          pid: 1,
          mode: 1,
          messageCount: 1,
          updatedAt: 1,
        },
      })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    return rows.map((row: any) => ({
      id: String(row._id),
      title: String(row.title || '新对话'),
      pid: String(row.pid || ''),
      mode: row.mode === 'practice' ? 'practice' : 'learning',
      messageCount: typeof row.messageCount === 'number' ? row.messageCount : 0,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : Date.now(),
    }));
  }

  static async getById(input: {
    domainId: string;
    uid: number;
    conversationId: string;
  }): Promise<AssistantConversationDetail | null> {
    if (!isValidObjectId(input.conversationId)) return null;
    const row = await conversationColl.findOne({
      _id: new ObjectId(input.conversationId),
      domainId: input.domainId,
      uid: input.uid,
    });
    if (!row) return null;

    const messages = Array.isArray(row.messages) ? row.messages : [];
    return {
      id: String(row._id),
      abbreviation: String(row.abbreviation || ''),
      pid: String(row.pid || ''),
      mode: row.mode === 'practice' ? 'practice' : 'learning',
      title: String(row.title || '新对话'),
      messages: messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        contentHtml: String(m.contentHtml || m.contentPlain || ''),
        contentMarkdown: m.contentMarkdown ? String(m.contentMarkdown) : undefined,
        contentPlain: m.contentPlain ? String(m.contentPlain) : undefined,
        quote: m.quote || null,
        finishReason: m.finishReason ? String(m.finishReason) : undefined,
      })),
    };
  }

  /**
   * 模型用历史：优先服务端已持久化会话（防客户端伪造/灌水），
   * 无 conversationId 或查不到时回退客户端 history（经滑动窗口）。
   */
  static async getHistoryForModel(input: {
    domainId: string;
    uid: number;
    conversationId?: string;
    abbreviation: string;
    pid?: string;
    clientHistory?: AssistantHistoryMessage[];
  }): Promise<AssistantHistoryMessage[]> {
    if (input.conversationId && isValidObjectId(input.conversationId)) {
      try {
        const row = await conversationColl.findOne({
          _id: new ObjectId(input.conversationId),
          domainId: input.domainId,
          uid: input.uid,
          abbreviation: input.abbreviation,
        });
        if (row && (!input.pid || String(row.pid || '') === String(input.pid))) {
          const messages = Array.isArray(row.messages) ? row.messages : [];
          const mapped: AssistantHistoryMessage[] = [];
          for (const m of messages) {
            const role = m?.role === 'assistant' ? 'assistant' : 'user';
            const content = String(
              m?.contentMarkdown
              || m?.contentPlain
              || stripHtmlTags(m?.contentHtml || '')
              || '',
            ).trim();
            if (!content) continue;
            mapped.push({ role, content });
          }
          return slideAssistantHistoryWindow(mapped);
        }
      } catch (e: any) {
        console.log('[AssistantConversation] getHistoryForModel failed:', e?.message);
      }
    }
    return slideAssistantHistoryWindow(Array.isArray(input.clientHistory) ? input.clientHistory : []);
  }

  static async delete(input: {
    domainId: string;
    uid: number;
    conversationId: string;
  }): Promise<boolean> {
    if (!isValidObjectId(input.conversationId)) return false;
    const result = await conversationColl.deleteOne({
      _id: new ObjectId(input.conversationId),
      domainId: input.domainId,
      uid: input.uid,
    });
    return result.deletedCount > 0;
  }

  private static async trimOldConversations(domainId: string, uid: number, abbreviation: string) {
    const rows = await conversationColl
      .find({ domainId, uid, abbreviation }, { projection: { _id: 1 } })
      .sort({ updatedAt: -1 })
      .skip(MAX_CONVERSATIONS_PER_SCOPE)
      .toArray();
    if (!rows.length) return;
    await conversationColl.deleteMany({
      _id: { $in: rows.map((r: any) => r._id) },
    });
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
