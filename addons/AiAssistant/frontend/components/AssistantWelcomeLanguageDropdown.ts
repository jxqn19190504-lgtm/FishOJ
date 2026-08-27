import {
  dedupeAssistantLanguageOptions,
  getCodeLanguageDisplayName,
  normalizeCodeLanguage,
} from '../../shared/assistant-code-language';

export const WELCOME_LANGUAGE_OPTIONS = [
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
  { label: 'Java', value: 'java' },
  { label: 'Python', value: 'python' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'Go', value: 'go' },
] as const;

export type WelcomeLanguageValue = (typeof WELCOME_LANGUAGE_OPTIONS)[number]['value'];

export const WELCOME_LANGUAGE_VALUES: WelcomeLanguageValue[] = WELCOME_LANGUAGE_OPTIONS.map((o) => o.value);

export function isWelcomeLanguageValue(lang: string): lang is WelcomeLanguageValue {
  return (WELCOME_LANGUAGE_VALUES as string[]).includes(lang);
}

export type AssistantLanguageDropdownOption = {
  label: string;
  value: string;
};

export type AssistantWelcomeLanguageDropdownOptions = {
  value?: string;
  onChange: (value: string) => void;
  options?: AssistantLanguageDropdownOption[];
  /** 是否显示「代码语言」标题，footer 区域为 false */
  showLabel?: boolean;
  /** welcome = 中间区域；footer/header = 紧凑胶囊 */
  variant?: 'welcome' | 'footer' | 'header';
};

let langDropdownInstanceSeq = 0;

export class AssistantWelcomeLanguageDropdown {
  private root: HTMLElement;
  private trigger: HTMLButtonElement;
  private valueEl: HTMLElement;
  private menu: HTMLElement;
  private open = false;
  private value = 'cpp';
  private options: AssistantLanguageDropdownOption[] = [...WELCOME_LANGUAGE_OPTIONS];
  private onChange: (value: string) => void;
  private onDocClick = (ev: MouseEvent) => {
    if (!this.open) return;
    const target = ev.target as Node | null;
    if (target && this.root.contains(target)) return;
    this.closeMenu();
  };
  private onDocKeydown = (ev: KeyboardEvent) => {
    if (!this.open) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      this.closeMenu();
      this.trigger.focus();
    }
  };

  constructor(container: HTMLElement, options: AssistantWelcomeLanguageDropdownOptions) {
    this.onChange = options.onChange;
    const showLabel = options.showLabel !== false;
    const isCompact = options.variant === 'footer' || options.variant === 'header';
    const instanceId = ++langDropdownInstanceSeq;
    const labelId = `cf-assistant-lang-label-${instanceId}`;
    const valueId = `cf-assistant-lang-value-${instanceId}`;

    this.root = document.createElement('div');
    this.root.className = `cf-assistant-welcome-lang${isCompact ? ' cf-assistant-welcome-lang--compact' : ''}`;
    this.root.innerHTML = `
      ${showLabel ? `<span class="cf-assistant-welcome-lang-label" id="${labelId}">代码语言</span>` : ''}
      <div class="cf-assistant-welcome-lang-control">
        <button
          type="button"
          class="cf-assistant-welcome-lang-trigger"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-label="编程语言"
          ${showLabel ? `aria-labelledby="${labelId} ${valueId}"` : `aria-labelledby="${valueId}"`}
        >
          <span class="cf-assistant-welcome-lang-trigger-inner">
            ${isCompact ? '' : '<i class="fas fa-code cf-assistant-welcome-lang-icon" aria-hidden="true"></i>'}
            <span class="cf-assistant-welcome-lang-value" id="${valueId}"></span>
          </span>
          <i class="fas fa-chevron-down cf-assistant-welcome-lang-chevron" aria-hidden="true"></i>
        </button>
        <ul class="cf-assistant-welcome-lang-menu" role="listbox" tabindex="-1" hidden></ul>
      </div>`;

    container.appendChild(this.root);
    this.trigger = this.root.querySelector('.cf-assistant-welcome-lang-trigger') as HTMLButtonElement;
    this.valueEl = this.root.querySelector('.cf-assistant-welcome-lang-value') as HTMLElement;
    this.menu = this.root.querySelector('.cf-assistant-welcome-lang-menu') as HTMLElement;

    if (options.options?.length) {
      this.setOptions(options.options, false);
    } else {
      this.renderOptions();
    }

    this.trigger.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.toggleMenu();
    });

    const initial = normalizeCodeLanguage(options.value || 'cpp');
    this.selectValue(this.isAllowedValue(initial) ? initial : (this.options[0]?.value || 'cpp'), false);
  }

  setOptions(options: AssistantLanguageDropdownOption[], keepValue = true) {
    const normalized = dedupeAssistantLanguageOptions(options);
    this.options = normalized.length ? normalized : [...WELCOME_LANGUAGE_OPTIONS];
    this.renderOptions();
    if (keepValue && this.isAllowedValue(this.value)) {
      this.selectValue(this.value, false);
      return;
    }
    const preferred = this.isAllowedValue(this.value) ? this.value : (this.options[0]?.value || 'cpp');
    this.selectValue(preferred, false);
  }

  private renderOptions() {
    this.menu.innerHTML = this.options.map(
      (opt) => `
        <li
          class="cf-assistant-welcome-lang-option"
          role="option"
          data-value="${opt.value}"
          aria-selected="false"
        >
          <span class="cf-assistant-welcome-lang-option-label">${opt.label}</span>
          <i class="fas fa-check cf-assistant-welcome-lang-option-check" aria-hidden="true"></i>
        </li>`,
    ).join('');

    this.menu.querySelectorAll('.cf-assistant-welcome-lang-option').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const val = normalizeCodeLanguage((el as HTMLElement).dataset.value);
        if (!this.isAllowedValue(val)) return;
        this.selectValue(val, true);
        this.closeMenu();
        this.trigger.focus();
      });
    });
  }

  private isAllowedValue(lang: string) {
    const normalized = normalizeCodeLanguage(lang);
    return this.options.some((opt) => normalizeCodeLanguage(opt.value) === normalized);
  }

  getValue() {
    return this.value;
  }

  setValue(lang: string) {
    const normalized = normalizeCodeLanguage(lang);
    if (!this.isAllowedValue(normalized)) return;
    this.selectValue(normalized, false);
  }

  dispose() {
    this.closeMenu();
    this.root.remove();
  }

  private toggleMenu() {
    if (this.open) this.closeMenu();
    else this.openMenu();
  }

  private openMenu() {
    this.open = true;
    this.menu.hidden = false;
    this.root.classList.add('cf-assistant-welcome-lang--open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.positionMenu();
    document.addEventListener('click', this.onDocClick, true);
    document.addEventListener('keydown', this.onDocKeydown, true);
    window.addEventListener('resize', this.onReposition, { passive: true });
    window.addEventListener('scroll', this.onReposition, true);
    requestAnimationFrame(() => {
      this.menu.classList.add('cf-assistant-welcome-lang-menu--visible');
    });
  }

  private closeMenu() {
    if (!this.open) return;
    this.open = false;
    this.menu.classList.remove('cf-assistant-welcome-lang-menu--visible');
    this.root.classList.remove('cf-assistant-welcome-lang--open');
    this.trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this.onDocClick, true);
    document.removeEventListener('keydown', this.onDocKeydown, true);
    window.removeEventListener('resize', this.onReposition);
    window.removeEventListener('scroll', this.onReposition);
    window.setTimeout(() => {
      if (!this.open) this.menu.hidden = true;
    }, 150);
  }

  private onReposition = () => {
    if (this.open) this.positionMenu();
  };

  private positionMenu() {
    const rect = this.trigger.getBoundingClientRect();
    this.menu.style.width = `${rect.width}px`;
    this.menu.style.left = `${rect.left}px`;
    this.menu.style.top = `${rect.bottom + 6}px`;
  }

  private selectValue(value: string, notify: boolean) {
    const normalized = normalizeCodeLanguage(value);
    if (this.value === normalized && notify) return;
    this.value = normalized;
    const opt = this.options.find((o) => normalizeCodeLanguage(o.value) === normalized);
    this.valueEl.textContent = opt?.label || getCodeLanguageDisplayName(normalized);
    this.menu.querySelectorAll('.cf-assistant-welcome-lang-option').forEach((el) => {
      const item = el as HTMLElement;
      const selected = normalizeCodeLanguage(item.dataset.value) === normalized;
      item.classList.toggle('cf-assistant-welcome-lang-option--selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (notify) this.onChange(normalized);
  }
}
