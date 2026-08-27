import './styles/assistant.css';
import './styles/assistant-code.css';
import './styles/assistant-welcome-lang.css';
import './styles/assistant-mobile.css';
import './styles/assistant-ide.css';

import {
  scheduleAssistantHostSync,
  startAssistantHost,
  stopAssistantHost,
} from './host/assistantHost';
import { ensureFishOjProblemIdeBridge } from './adapters/acm-problem/problemIdeAssistantBridge';

const FONT_AWESOME_HREF = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
const FONT_AWESOME_MARKER = 'data-fishoj-assistant-fontawesome';

function ensureAssistantFontAwesome(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[${FONT_AWESOME_MARKER}]`)) return;
  const alreadyLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => (link as HTMLLinkElement).href.includes('font-awesome'));
  if (alreadyLoaded) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_AWESOME_HREF;
  link.setAttribute(FONT_AWESOME_MARKER, '1');
  document.head.appendChild(link);
}

let started = false;
let stopHost: (() => void) | null = null;

function runAssistantHostStart(): void {
  ensureAssistantFontAwesome();
  try {
    ensureFishOjProblemIdeBridge();
  } catch {
    /* IDE 尚未就绪时仍可挂 shell，bridge 会在后续事件补齐 */
  }
  if (started) {
    scheduleAssistantHostSync();
    return;
  }
  started = true;
  stopHost = startAssistantHost();
}

export function ensureAssistantHostStarted(): () => void {
  window.requestAnimationFrame(() => runAssistantHostStart());
  return () => ensureAssistantHostStopped();
}

export function ensureAssistantHostStopped(): void {
  stopHost?.();
  stopHost = null;
  stopAssistantHost();
  started = false;
}
