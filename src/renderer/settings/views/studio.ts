import { petPersona, SCENARIO_LABELS, SOUND_SLOTS } from '../../../shared/bubble-settings';
import { DEFAULT_PET, GEMINI_PETS, GPT_DRAGON_PET, GPT_PET } from '../../../shared/defaults';
import { personaNickname } from '../../../shared/pet-nicknames';
import type { AppState, CompletionSource, PetPersona } from '../../../shared/types';
import { personaPicker, segmented } from '../../ui/components';
import type { SettingsPage } from '../router';

export function mountStudio(main: HTMLElement, initial: AppState, change: (persona: PetPersona) => void) {
  const toolbar = document.createElement('div');
  toolbar.id = 'studio-personas';
  toolbar.hidden = true;
  const picker = personaPicker([
    { id: 'whale', label: 'DeepSeek', image: DEFAULT_PET.url },
    { id: 'gpt', label: 'GPT', image: GPT_PET.url },
    { id: 'gemini', label: 'Gemini', image: GEMINI_PETS[initial.geminiAppearance].url },
  ], 'whale');
  const gptPicker = segmented('GPT 人设档案', [
    { id: 'gpt', label: '原版 GPT' }, { id: 'dragon', label: '白龙' },
  ], 'gpt');
  gptPicker.classList.add('studio-gpt-variants');
  toolbar.append(picker, gptPicker);
  main.querySelector('.page-tabs')!.before(toolbar);
  const roles = Array.from(picker.querySelectorAll('button'));
  const variants = Array.from(gptPicker.querySelectorAll('button'));
  let persona = petPersona(initial);
  let gptPersona: 'gpt' | 'dragon' = initial.gptAppearance === 'dragon' ? 'dragon' : 'gpt';

  const render = () => {
    const role = persona === 'dragon' ? 'gpt' : persona;
    for (const button of roles) button.setAttribute('aria-pressed', String(button.dataset.value === role));
    for (const button of variants) button.setAttribute('aria-pressed', String(button.dataset.value === gptPersona));
    gptPicker.hidden = role !== 'gpt';
    picker.querySelector<HTMLImageElement>('[data-studio-role="gpt"] img')!.src = gptPersona === 'dragon' ? GPT_DRAGON_PET.url : GPT_PET.url;
  };
  const select = (next: PetPersona) => {
    if (next === persona) return;
    persona = next;
    if (next === 'gpt' || next === 'dragon') gptPersona = next;
    render();
    change(next);
  };
  for (const button of roles) {
    const role = button.dataset.value as 'whale' | 'gpt' | 'gemini';
    button.dataset.studioRole = role;
    button.addEventListener('click', () => select(role === 'gpt' ? gptPersona : role));
  }
  for (const button of variants) {
    const variant = button.dataset.value as 'gpt' | 'dragon';
    button.dataset.studioGpt = variant;
    button.addEventListener('click', () => select(variant));
  }
  render();
  return {
    select,
    showPage: (page: SettingsPage) => { toolbar.hidden = !['bubbles', 'companionship', 'sound'].includes(page); },
    update: (state: AppState) => {
      for (const button of variants) button.textContent = personaNickname(state.settings, button.dataset.studioGpt as PetPersona);
      picker.querySelector<HTMLImageElement>('[data-studio-role="gemini"] img')!.src = GEMINI_PETS[state.geminiAppearance].url;
    },
  };
}

export function soundCards() {
  return `<p class="hint">更换或恢复音频立即生效。点击音效开关和音量随设置保存。</p><div class="studio-sound-grid">
    ${SOUND_SLOTS.map(slot => {
      const source = slot.startsWith('completion-') ? slot.slice('completion-'.length) as CompletionSource : null;
      const title = slot === 'press' ? '按下音效' : slot === 'release' ? '松开音效' : SCENARIO_LABELS[slot];
      return `<article class="studio-sound-card"><div class="sound-file-heading"><h3>${title}</h3><span id="sound-kind-${slot}" class="sound-kind"></span></div>
        <p id="sound-name-${slot}" class="sound-filename"></p>
        <div class="button-row">
          <button type="button" class="secondary-button" id="sound-preview-${slot}">试听</button>
          <button type="button" class="text-button" id="sound-stop-${slot}">停止</button>
          <button type="button" class="text-button" id="sound-choose-${slot}">更换</button>
          <button type="button" class="text-button" id="sound-reset-${slot}">恢复默认</button>
        </div>
        ${source ? `<button type="button" class="text-button" data-edit-sound="${source}">在气泡中设置开关与音量 ↗</button>` : ''}
        <p id="sound-warning-${slot}" class="sound-warning" role="status"></p></article>`;
    }).join('')}</div>`;
}

export function arrangePhrases(section: HTMLElement) {
  const panel = section.querySelector('.panel')!;
  const list = document.createElement('div');
  const display = document.createElement('div');
  list.append(...panel.querySelectorAll('label[for="phrases"], #phrases, #phrase-candidates'));
  display.append(panel.querySelector('.phrase-display-controls')!, panel.querySelector('.phrase-preview')!);
  panel.classList.add('studio-phrase-grid');
  panel.replaceChildren(list, display);
}
