/**
 * 运行：npx ts-node --transpile-only codefun2000.CodeNote/AIAssistant/backend/AssistantContentAccess.test.ts
 */
import assert from 'assert';
import {
  assistantAccessDeniedMessage,
  resolveHot100ContentAccess,
  throwAssistantAccessDenied,
} from './AssistantContentAccess';

function runTests() {
  const vipLike = resolveHot100ContentAccess({
    viewerUid: 7,
    hasPsPerm: true,
    canViewByVisibility: true,
    guestFullAccess: false,
    isIntroPage: false,
    mode: 'learning',
  });
  assert.equal(vipLike.canAccessAssistant, true);
  assert.equal(vipLike.canReadStatement, true);
  assert.equal(vipLike.canSeeSolution, true);
  assert.equal(vipLike.isReadLimited, false);

  const freeUser = resolveHot100ContentAccess({
    viewerUid: 6,
    hasPsPerm: false,
    canViewByVisibility: true,
    guestFullAccess: false,
    isIntroPage: false,
    mode: 'learning',
  });
  assert.equal(freeUser.canAccessAssistant, false);
  assert.equal(freeUser.canReadStatement, false);
  assert.equal(freeUser.canSeeSolution, false);
  assert.equal(freeUser.isReadLimited, true);
  assert.equal(freeUser.deniedReason, 'BANK_LOCKED');

  const lockedVis = resolveHot100ContentAccess({
    viewerUid: 7,
    hasPsPerm: true,
    canViewByVisibility: false,
    guestFullAccess: false,
    isIntroPage: false,
    mode: 'learning',
  });
  assert.equal(lockedVis.canAccessAssistant, false);
  assert.equal(lockedVis.deniedReason, 'PROBLEM_LOCKED');

  const practice = resolveHot100ContentAccess({
    viewerUid: 7,
    hasPsPerm: true,
    canViewByVisibility: true,
    guestFullAccess: false,
    isIntroPage: false,
    mode: 'practice',
  });
  assert.equal(practice.canReadStatement, true);
  assert.equal(practice.canSeeSolution, false);

  // 介绍页：普通用户已登录可读全文，可用助教（与页面 isReadLimited:false 一致）
  const introFree = resolveHot100ContentAccess({
    viewerUid: 6,
    hasPsPerm: false,
    canViewByVisibility: true,
    guestFullAccess: false,
    isIntroPage: true,
    mode: 'learning',
  });
  assert.equal(introFree.isReadLimited, false);
  assert.equal(introFree.canAccessAssistant, true);
  assert.equal(introFree.canSeeSolution, false);

  assert.equal(assistantAccessDeniedMessage('BANK_LOCKED'), '解锁当前题库后可使用 AI 助教');

  let threw = false;
  try {
    throwAssistantAccessDenied('BANK_LOCKED');
  } catch (e: any) {
    threw = true;
    assert.equal(e.code, 'BANK_LOCKED');
    assert.ok(String(e.message).includes('解锁'));
  }
  assert.ok(threw);

  console.log('AssistantContentAccess.test.ts: all passed');
}

runTests();
