import { petPersona } from '../../../shared/bubble-settings';
import { AA_MINIMUM, DEFAULT_THEME, THEME_PRESETS, THEME_ZONES, deriveTheme, isThemeColor, normalizeTheme, themeAccent } from '../../../shared/theme';
import type { AppState, ThemePresetId, ThemeSettings } from '../../../shared/types';
import { samplePetColors } from '../../pet-colors';
import { THEME_PATTERNS, applyThemeVariables } from '../../theme';
import './palette.css';

const labels: Record<ThemePresetId, string> = {
  sage: '松绿', mint: '薄荷', sea: '海盐蓝', starlight: '星光紫', sakura: '樱粉', apricot: '暖杏', ink: '墨灰', persona: '跟随角色',
};
const zones = { sidebar: '侧栏', stage: '角色舞台', bubble: '桌宠气泡' };
const textureNames = { none: '无纹理', dots: '点阵', grid: '细格', stars: '星光' };
const presetIds = Object.keys(labels) as ThemePresetId[];

export function mountPalette(section: HTMLElement, initial: AppState, changed: () => void) {
  const panel = section.querySelector<HTMLElement>('.panel')!;
  panel.classList.add('palette-panel');
  panel.innerHTML = `
    <fieldset class="palette-presets"><legend>预设配色</legend><div class="palette-options">
      ${presetIds.map(id => `<button type="button" data-theme-preset="${id}" aria-pressed="false"><span aria-hidden="true"></span>${labels[id]}</button>`).join('')}
    </div></fieldset>
    <div class="palette-workspace">
      <div class="palette-controls">
        <fieldset><legend>随心调</legend>
          <div class="palette-accent-row">
            <input id="theme-color" type="color" aria-label="选择主色">
            <label for="theme-accent">主色 HEX<input id="theme-accent" type="text" spellcheck="false" maxlength="7" autocomplete="off" aria-describedby="theme-accent-error"></label>
            <button id="theme-sample" type="button" class="secondary-button">从角色取色</button>
          </div>
          <p id="theme-accent-error" class="palette-error" role="status" hidden>请输入六位 HEX，例如 #28624f。</p>
          <div id="theme-samples" class="palette-samples" role="group" aria-label="角色取色结果"></div>
          <p id="theme-sample-status" class="hint" role="status"></p>
        </fieldset>
        <fieldset class="palette-zones"><legend>分区覆盖</legend>
          ${THEME_ZONES.map(zone => `<div><label class="toggle-label" for="theme-zone-${zone}"><span>${zones[zone]}</span><input id="theme-zone-${zone}" type="checkbox"></label><input id="theme-zone-${zone}-color" type="color" aria-label="${zones[zone]}颜色"></div>`).join('')}
        </fieldset>
        <fieldset class="palette-finish"><legend>纹理与强度</legend>
          <label for="theme-texture">轻纹理</label><select id="theme-texture">${Object.entries(textureNames).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select>
          <label for="theme-intensity">强度 <output id="theme-intensity-value" for="theme-intensity"></output></label><input id="theme-intensity" type="range" min="0.6" max="1.4" step="0.05">
        </fieldset>
      </div>
      <aside class="palette-preview" aria-labelledby="theme-preview-title">
        <h3 id="theme-preview-title">实时预览</h3>
        <div class="palette-mini-window" aria-hidden="true"><div class="palette-mini-nav"><b></b><i></i><i></i><i></i></div><div class="palette-mini-content"><strong>桌面的栖息地</strong><span>我的伙伴</span><b>保存设置</b></div></div>
        <div class="palette-mini-pet" aria-hidden="true"><span class="palette-mini-bubble">今天也要照顾好自己呀。</span><img alt=""></div>
        <p id="theme-contrast" role="status"></p>
        <p id="theme-adjustment" class="hint" hidden></p>
      </aside>
    </div>
    <fieldset class="palette-scope"><legend>应用范围</legend>
      <label class="toggle-label"><span>设置窗口</span><input id="theme-apply-settings" type="checkbox"></label>
      <label class="toggle-label"><span>桌宠气泡<small>已有独立配色的气泡按原设置显示</small></span><input id="theme-apply-pet" type="checkbox"></label>
      <button id="theme-reset" type="button" class="text-button">恢复默认</button>
    </fieldset>
    <details class="palette-code"><summary>主题码</summary>
      <label class="field-label" for="theme-code-text">主题码</label><textarea id="theme-code-text" rows="2" maxlength="1024" spellcheck="false"></textarea>
      <div class="button-row"><button id="theme-copy" type="button" class="secondary-button">复制当前主题码</button><button id="theme-import" type="button" class="text-button">导入主题码</button></div>
      <p id="theme-code-status" class="hint" role="status"></p>
    </details>`;

  const find = <E extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<E>(`#${id}`)!;
  const input = (id: string) => find<HTMLInputElement>(id);
  const presets = panel.querySelectorAll<HTMLButtonElement>('[data-theme-preset]');
  const hex = input('theme-accent'), color = input('theme-color');
  const texture = find<HTMLSelectElement>('theme-texture');
  const intensity = input('theme-intensity');
  const samples = find('theme-samples'), sampleButton = find<HTMLButtonElement>('theme-sample');
  const sampleStatus = find('theme-sample-status');
  const preview = panel.querySelector<HTMLElement>('.palette-preview')!;
  const previewImage = preview.querySelector('img')!;
  const documentRoot = document.documentElement;
  const code = find<HTMLTextAreaElement>('theme-code-text'), codeStatus = find('theme-code-status');
  let state = initial;
  let draft = structuredClone(initial.settings.theme);
  let invalidAccent: string | null = null;
  let sampleTicket = 0;
  let lastTheme = '';
  let applied = deriveTheme(draft, petPersona(state));
  const read = () => ({ ...draft, accent: invalidAccent ?? draft.accent });
  const paint = () => {
    const persona = petPersona(state);
    const signature = JSON.stringify([draft, persona]);
    if (signature === lastTheme) return;
    lastTheme = signature;
    applied = deriveTheme(draft, persona);
    const pattern = THEME_PATTERNS[draft.texture];
    const variables = { ...applied.settings, '--texture': pattern.image, '--texture-size': pattern.size };
    applyThemeVariables(documentRoot, variables, draft.applyToSettings);
    applyThemeVariables(preview, { ...variables, ...applied.pet });
    const ratios = [applied.buttonRatio, applied.bodyRatio, applied.bubbleRatio];
    const aa = find('theme-contrast');
    const passes = ratios.every(ratio => ratio >= AA_MINIMUM);
    aa.dataset.passes = String(passes);
    const readings = [`AA ${passes ? '✓' : '✗'}`, ...['按钮', '正文', '气泡'].map((label, index) => `${label} ${ratios[index].toFixed(2)}:1`)];
    aa.replaceChildren(...readings.map(text => {
      const reading = document.createElement('span');
      reading.textContent = text;
      return reading;
    }));
    const adjustment = find('theme-adjustment');
    adjustment.hidden = !applied.accentAdjusted;
    adjustment.textContent = applied.accentAdjusted ? `颜色过浅，已自动加深至 ${applied.settings['--accent']}` : '';
  };
  const renderControls = () => {
    const persona = petPersona(state);
    const current = themeAccent(draft, persona);
    for (const preset of presets) {
      const id = preset.dataset.themePreset as ThemePresetId;
      const swatch = id === 'persona' ? themeAccent({ ...draft, preset: id }, persona) : THEME_PRESETS[id];
      preset.querySelector<HTMLElement>('span')!.style.backgroundColor = swatch;
      preset.setAttribute('aria-pressed', String(id === draft.preset));
    }
    hex.value = invalidAccent ?? current;
    color.value = current;
    hex.setAttribute('aria-invalid', String(invalidAccent !== null));
    find('theme-accent-error').hidden = invalidAccent === null;
    for (const zone of THEME_ZONES) {
      const override = draft.overrides[zone];
      input(`theme-zone-${zone}`).checked = Boolean(override);
      const swatch = input(`theme-zone-${zone}-color`);
      swatch.disabled = !override;
      swatch.value = override ?? current;
    }
    texture.value = draft.texture;
    intensity.value = String(draft.intensity);
    find('theme-intensity-value').textContent = `${Math.round(draft.intensity * 100)}%`;
    input('theme-apply-settings').checked = draft.applyToSettings;
    input('theme-apply-pet').checked = draft.applyToPet;
    paint();
  };
  const fill = (theme: ThemeSettings) => {
    draft = structuredClone(theme);
    invalidAccent = null;
    renderControls();
  };
  const edit = () => { renderControls(); changed(); };
  const editAccent = (value: string) => {
    const previous = themeAccent(draft, petPersona(state));
    draft.preset = 'custom';
    invalidAccent = isThemeColor(value) ? null : value;
    draft.accent = invalidAccent === null ? value.toLowerCase() : previous;
    edit();
  };
  for (const preset of presets) preset.addEventListener('click', () => {
    const id = preset.dataset.themePreset as ThemePresetId;
    draft.preset = id;
    draft.accent = id === 'persona' ? DEFAULT_THEME.accent : THEME_PRESETS[id];
    invalidAccent = null;
    edit();
  });
  color.addEventListener('input', () => editAccent(color.value));
  hex.addEventListener('input', () => editAccent(hex.value));
  for (const zone of THEME_ZONES) {
    const enabled = input(`theme-zone-${zone}`), swatch = input(`theme-zone-${zone}-color`);
    enabled.addEventListener('change', () => {
      if (enabled.checked) draft.overrides[zone] = swatch.value;
      else delete draft.overrides[zone];
      edit();
    });
    swatch.addEventListener('input', () => { draft.overrides[zone] = swatch.value; edit(); });
  }
  texture.addEventListener('change', () => { draft.texture = texture.value as ThemeSettings['texture']; edit(); });
  intensity.addEventListener('input', () => { draft.intensity = Number(intensity.value); edit(); });
  for (const [id, key] of [['theme-apply-settings', 'applyToSettings'], ['theme-apply-pet', 'applyToPet']] as const) {
    const toggle = input(id);
    toggle.addEventListener('change', () => { draft[key] = toggle.checked; edit(); });
  }
  find('theme-reset').addEventListener('click', () => { fill(DEFAULT_THEME); changed(); });
  sampleButton.addEventListener('click', async () => {
    const ticket = ++sampleTicket;
    sampleButton.disabled = true;
    sampleStatus.textContent = '';
    samples.replaceChildren();
    try {
      const colors = await samplePetColors(state.pet.url);
      if (ticket !== sampleTicket) return;
      if (!colors.length) sampleStatus.textContent = '角色图片里没有可取色的不透明像素。';
      for (const hex of colors) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.themeSample = hex;
        button.setAttribute('aria-label', `使用颜色 ${hex}`);
        button.title = hex;
        button.style.backgroundColor = hex;
        button.addEventListener('click', () => editAccent(hex));
        samples.append(button);
      }
    } catch {
      if (ticket === sampleTicket) sampleStatus.textContent = '无法读取当前角色的颜色。';
    } finally {
      if (ticket === sampleTicket) sampleButton.disabled = false;
    }
  });
  find('theme-copy').addEventListener('click', async () => {
    let token: string;
    try { token = 'DP1.' + btoa(JSON.stringify(normalizeTheme(read()))); }
    catch { codeStatus.textContent = '修正主色后再生成主题码。'; return; }
    code.value = token;
    try {
      await navigator.clipboard.writeText(token);
      codeStatus.textContent = '主题码已复制。';
    } catch {
      code.focus(); code.select();
      codeStatus.textContent = '主题码已选中，可手动复制。';
    }
  });
  find('theme-import').addEventListener('click', () => {
    try {
      const token = code.value.trim();
      if (token.length > 1024 || !/^DP1\.[a-z\d+/]+={0,2}$/i.test(token)) throw new Error();
      fill(normalizeTheme(JSON.parse(atob(token.slice(4)))));
      changed();
      codeStatus.textContent = '已载入主题草稿。';
    } catch { codeStatus.textContent = '主题码无效。'; }
  });
  previewImage.src = state.pet.url;
  renderControls();
  return {
    fill,
    read,
    validate: () => {
      const value = normalizeTheme(read());
      if ([applied.buttonRatio, applied.bodyRatio, applied.bubbleRatio].some(ratio => ratio < AA_MINIMUM)) throw new Error('主题对比度未达到 AA。');
      return value;
    },
    update(next: AppState) {
      if (state.pet.url !== next.pet.url) {
        previewImage.src = next.pet.url;
        sampleTicket++;
        sampleButton.disabled = false;
        samples.replaceChildren();
        sampleStatus.textContent = '';
      }
      const roleChanged = petPersona(state) !== petPersona(next);
      state = next;
      if (roleChanged) renderControls();
    },
    dispose() {
      sampleTicket++;
      applyThemeVariables(documentRoot, { ...applied.settings, '--texture': '', '--texture-size': '' }, false);
    },
  };
}
