import { Handler, param, Types } from 'hydrooj';
import { isAssistantFeatureEnabled } from './AssistantValidator';
import { AssistantConversationService } from './AssistantConversationService';

export class AssistantHistoryListHandler extends Handler {
  /** 业务层已校验登录；避免 VIP 域角色缺 PERM_VIEW 时被框架 403 */
  noCheckPermView = true;

  async get() {
    const uid = Number(this.user?._id || 0);
    if (!uid) {
      this.response.body = { error: '请先登录', code: 'UNAUTHORIZED' };
      return;
    }

    const abbreviation = String(this.request.query?.abbreviation || '').trim();
    if (!abbreviation || !isAssistantFeatureEnabled(abbreviation)) {
      this.response.body = { error: '当前页面暂未开放 AI 助教' };
      return;
    }

    const pidRaw = this.request.query?.pid;
    const pid = pidRaw ? String(pidRaw).trim() : undefined;

    const items = await AssistantConversationService.list({
      domainId: this.domain._id,
      uid,
      abbreviation,
      pid: pid || undefined,
    });
    this.response.body = { items };
  }
}

export class AssistantHistoryDetailHandler extends Handler {
  /** 业务层已校验登录；避免 VIP 域角色缺 PERM_VIEW 时被框架 403 */
  noCheckPermView = true;

  @param('id', Types.String)
  async get(_domainId: string, id: string) {
    const uid = Number(this.user?._id || 0);
    if (!uid) {
      this.response.body = { error: '请先登录', code: 'UNAUTHORIZED' };
      return;
    }

    const detail = await AssistantConversationService.getById({
      domainId: this.domain._id,
      uid,
      conversationId: id,
    });
    if (!detail) {
      this.response.body = { error: '对话不存在或无权访问', code: 'NOT_FOUND' };
      return;
    }
    this.response.body = detail;
  }

  @param('id', Types.String)
  async delete(_domainId: string, id: string) {
    const uid = Number(this.user?._id || 0);
    if (!uid) {
      this.response.body = { error: '请先登录', code: 'UNAUTHORIZED' };
      return;
    }

    const ok = await AssistantConversationService.delete({
      domainId: this.domain._id,
      uid,
      conversationId: id,
    });
    if (!ok) {
      this.response.body = { error: '对话不存在或无权访问', code: 'NOT_FOUND' };
      return;
    }
    this.response.body = { ok: true };
  }
}
