import { PET_NICKNAME_DEFAULTS } from '../../../shared/pet-nicknames';
import type { AppSettings, AppState, PetPersona } from '../../../shared/types';

const PARTNERS: { id: AppState['activePet']; title: string; personas: PetPersona[]; description?: string }[] = [
  { id: 'deepseek', title: 'DeepSeek', personas: ['whale'] },
  { id: 'gpt', title: 'GPT', personas: ['gpt', 'dragon'] },
  { id: 'gemini', title: 'Gemini', personas: ['gemini'], description: '周额度与 5 小时额度' },
];

export function mountPartners(appearance: HTMLElement, behavior: HTMLElement) {
  const panel = appearance.querySelector<HTMLElement>('.panel')!;
  const cards = panel.querySelector<HTMLElement>('.pet-selector')!;
  cards.classList.add('partner-cards');
  const nicknames = new Map<PetPersona, HTMLInputElement>();
  for (const { id, title, personas, description } of PARTNERS) {
    const button = cards.querySelector<HTMLButtonElement>(`#select-${id}`)!;
    const card = document.createElement('article');
    card.className = 'partner-option';
    card.dataset.partner = id;
    const caption = button.querySelector('span')!;
    caption.replaceChildren(title);
    if (description) {
      const note = document.createElement('small');
      note.className = 'partner-description';
      note.textContent = description;
      caption.append(note);
    }
    const selected = document.createElement('small');
    selected.className = 'partner-selected';
    selected.textContent = '已选';
    caption.append(selected);
    const body = document.createElement('div');
    body.className = 'partner-nicknames';
    for (const persona of personas) {
      const label = document.createElement('label');
      label.textContent = personas.length > 1 ? `${PET_NICKNAME_DEFAULTS[persona]}昵称` : '昵称';
      const input = document.createElement('input');
      input.type = 'text';
      input.name = `pet-nickname-${persona}`;
      input.dataset.petNickname = persona;
      input.placeholder = PET_NICKNAME_DEFAULTS[persona];
      input.maxLength = 48;
      input.autocomplete = 'off';
      label.append(input);
      body.append(label);
      nicknames.set(persona, input);
    }
    button.replaceWith(card);
    card.append(button, body);
  }
  const mode = panel.querySelector<HTMLSelectElement>('#pet-mode')!;
  const modeRow = mode.closest('.setting-row')!;
  modeRow.className = 'partner-mode';
  modeRow.innerHTML = `<h3 id="mode-heading">桌宠模式</h3><div class="mode-cards" role="group" aria-labelledby="mode-heading">
    <button type="button" data-pet-mode="full"><span class="mode-sketch mode-full" aria-hidden="true"><i></i><i></i><i></i></span><strong>完整模式</strong><small>额度、用量报告、短句及对话提醒</small></button>
    <button type="button" data-pet-mode="simple"><span class="mode-sketch" aria-hidden="true"><i></i></span><strong>简洁模式</strong><small>剩余额度及对话提醒</small></button></div>`;
  mode.classList.add('sr-only');
  mode.tabIndex = -1;
  mode.setAttribute('aria-hidden', 'true');
  modeRow.append(mode);
  const modeButtons = modeRow.querySelectorAll<HTMLButtonElement>('[data-pet-mode]');
  const renderMode = () => {
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.petMode === mode.value));
  };
  mode.addEventListener('input', renderMode);
  for (const button of modeButtons) button.addEventListener('click', () => {
    mode.value = button.dataset.petMode!;
    mode.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const preview = panel.querySelector('.pet-preview-row')!;
  modeRow.before(preview);
  for (const id of ['gpt-appearance-options', 'gemini-appearance-options']) {
    panel.querySelector(`#${id} .pet-selector`)!.classList.add('partner-appearances');
  }
  const behaviorPanel = behavior.querySelector('.panel')!;
  behaviorPanel.querySelector('.page-description')?.remove();
  behaviorPanel.prepend(panel.querySelector('#scale')!.closest('.setting-row')!);
  return {
    fill: (settings: AppSettings) => {
      for (const [persona, input] of nicknames) input.value = settings.petNicknames[persona];
      mode.value = settings.petMode;
      renderMode();
    },
    readNicknames: () => Object.fromEntries(Array.from(nicknames, ([persona, input]) => [persona, input.value.trim()])) as AppSettings['petNicknames'],
    setMode: (value: AppSettings['petMode']) => { mode.value = value; renderMode(); },
  };
}
