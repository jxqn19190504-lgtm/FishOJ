import { addPage, NamedPage } from '@hydrooj/ui-default';
import { ensureAssistantHostStarted, ensureAssistantHostStopped } from './bootstrapAssistantHost';

declare const UiContext: {
  learning?: {
    assistantEnabled?: boolean;
  };
};

addPage(new NamedPage(['problem_ide'], async () => {
  if (UiContext.learning?.assistantEnabled === false) return;

  const stop = ensureAssistantHostStarted();

  const onReady = () => {
    ensureAssistantHostStarted();
  };
  document.addEventListener('problem-ide-ready', onReady);

  window.addEventListener('beforeunload', () => ensureAssistantHostStopped(), { once: true });

  return () => {
    document.removeEventListener('problem-ide-ready', onReady);
    stop?.();
    ensureAssistantHostStopped();
  };
}));
