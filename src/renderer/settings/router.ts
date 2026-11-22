export const settingsPages = {
  home: { label: '首页总览', pages: { home: '首页总览' }, icon: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>' },
  pet: { label: '伙伴', pages: { appearance: '角色与模式', behavior: '桌面行为' }, icon: '<path d="M5 10 4 3l6 4h4l6-4-1 7a8 8 0 1 1-14 0Z"/><path d="M9 13h.01M15 13h.01M10 17q2 2 4 0"/>' },
  account: { label: '账户', pages: { overview: 'DeepSeek', codex: 'Codex', gemini: 'Gemini', records: '消费记录' }, icon: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M7 15h3"/>' },
  reminders: { label: '提醒中心', pages: { completion: '对话提醒', reminders: '余额提醒' }, icon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9M9 21h6"/>' },
  studio: { label: '人设工作室', pages: { bubbles: '气泡', companionship: '短句', sound: '音效' }, icon: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 10h9M7 14h6"/>' },
  system: { label: '系统', pages: { version: '版本与更新', palette: '外观与调色盘', guide: '使用说明', licenses: '素材与许可证', uninstall: '卸载' }, icon: '<rect x="3" y="4" width="18" height="13" rx="3"/><path d="M8 21h8m-4-4v4"/>' },
};

export type SettingsCategory = keyof typeof settingsPages;
export type SettingsPage = { [Category in SettingsCategory]: keyof typeof settingsPages[Category]['pages'] }[SettingsCategory];

const categories = Object.keys(settingsPages) as SettingsCategory[];

export function settingsCategory(page: SettingsPage): SettingsCategory {
  return categories.find(category => Object.hasOwn(settingsPages[category].pages, page))!;
}

export function mountSettingsRouter(
  root: HTMLElement,
  content: HTMLElement,
  initialAccountPage: 'overview' | 'codex' | 'gemini',
  onPageChange: (page: SettingsPage) => void,
) {
  const sidebar = root.querySelector<HTMLElement>('.sidebar nav')!;
  const heading = root.querySelector<HTMLElement>('#category-label')!;
  const tabs = document.createElement('div');
  tabs.className = 'page-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '设置子页面');
  heading.closest('header')!.after(tabs);
  const remembered = new Map<SettingsCategory, SettingsPage>([['account', initialAccountPage]]);
  const panels = new Map([...content.querySelectorAll<HTMLElement>(':scope > section')].map(panel => [panel.id as SettingsPage, panel]));
  const categoryButtons = new Map<SettingsCategory, HTMLButtonElement>();
  const pageButtons = new Map<SettingsPage, HTMLButtonElement>();
  let activeCategory: SettingsCategory | undefined;
  let activePage: SettingsPage | undefined;

  for (const category of categories) {
    const group = settingsPages[category];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = category;
    button.id = `category-${category}`;
    button.innerHTML = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${group.icon}</svg><span>${group.label}</span>`;
    button.addEventListener('click', () => navigate(category));
    sidebar.append(button);
    categoryButtons.set(category, button);
    for (const [page, label] of Object.entries(group.pages) as [SettingsPage, string][]) {
      const panel = panels.get(page)!;
      if (category === 'home') {
        panel.setAttribute('aria-labelledby', 'home-heading');
        panel.tabIndex = -1;
        continue;
      }
      const tab = document.createElement('button');
      tab.id = `tab-${page}`;
      tab.type = 'button';
      tab.dataset.page = page;
      tab.textContent = label;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', page);
      tab.addEventListener('click', () => navigate(category, page));
      pageButtons.set(page, tab);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
    }
  }

  function navigate(
    category: SettingsCategory,
    page = remembered.get(category) ?? Object.keys(settingsPages[category].pages)[0] as SettingsPage,
    focusTarget?: HTMLElement | 'tab',
  ) {
    if (!Object.hasOwn(settingsPages[category].pages, page)) return;
    const focused = document.activeElement;
    const losesFocus = activePage !== page && (Boolean(activePage && panels.get(activePage)!.contains(focused))
      || (activeCategory !== category && tabs.contains(focused)));
    if (activeCategory !== category) {
      heading.textContent = settingsPages[category].label;
      for (const [id, button] of categoryButtons) button.setAttribute('aria-current', id === category ? 'page' : 'false');
      const categoryTabs = category === 'home' ? [] : Object.keys(settingsPages[category].pages).map(id => pageButtons.get(id as SettingsPage)!);
      tabs.replaceChildren(...categoryTabs);
      tabs.hidden = category === 'home';
      activeCategory = category;
    }
    if (activePage !== page) {
      for (const [id, panel] of panels) panel.hidden = id !== page;
      for (const [id, tab] of pageButtons) {
        tab.setAttribute('aria-selected', String(id === page));
        tab.tabIndex = id === page ? 0 : -1;
      }
      remembered.set(category, page);
      activePage = page;
      content.scrollTop = 0;
      onPageChange(page);
    }
    if (focusTarget === 'tab' || (!focusTarget && losesFocus)) {
      (pageButtons.get(page) ?? panels.get(page))?.focus({ preventScroll: true });
    } else focusTarget?.focus();
  }

  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...tabs.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    navigate(activeCategory!, buttons[next].dataset.page as SettingsPage, 'tab');
  });

  return {
    navigate,
    setDraftPages(draftPages: ReadonlySet<SettingsPage>) {
      const draftCategories = new Set([...draftPages].map(settingsCategory));
      for (const [category, button] of categoryButtons) {
        const dirty = draftCategories.has(category);
        button.toggleAttribute('data-dirty', dirty);
        if (dirty) button.setAttribute('aria-description', '有未保存的修改');
        else button.removeAttribute('aria-description');
      }
      for (const [page, tab] of pageButtons) {
        const dirty = draftPages.has(page);
        tab.toggleAttribute('data-dirty', dirty);
        if (dirty) tab.setAttribute('aria-description', '有未保存的修改');
        else tab.removeAttribute('aria-description');
      }
    },
  };
}
