type StatusTone = 'ok' | 'info' | 'warn' | 'err' | 'off';

export function card(...content: (Node | string)[]) {
  const element = document.createElement('article');
  element.className = 'ui-card';
  element.append(...content);
  return element;
}

export function statusChip(label: string, tone: StatusTone) {
  const element = document.createElement('span');
  element.className = 'status-chip ui-status-chip';
  element.dataset.tone = tone;
  element.textContent = label;
  return element;
}

export function ring(label: string, percent: number) {
  const element = document.createElement('div');
  element.className = 'ui-ring';
  element.setAttribute('role', 'meter');
  element.setAttribute('aria-label', label);
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');
  element.setAttribute('aria-valuenow', String(percent));
  element.style.setProperty('--meter-value', `${percent}%`);
  const value = document.createElement('span');
  value.setAttribute('aria-hidden', 'true');
  value.textContent = `${percent}%`;
  element.append(value);
  return element;
}

export function bar(label: string, percent: number) {
  const element = document.createElement('progress');
  element.className = 'ui-bar';
  element.max = 100;
  element.value = percent;
  element.setAttribute('aria-label', label);
  return element;
}

export function sparkBars(label: string, values: readonly { label: string; value: number }[]) {
  const element = document.createElement('div');
  element.className = 'ui-spark-bars';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', [label, ...values.map(item => item.label)].join('，'));
  const max = Math.max(0, ...values.map(item => item.value)) || 1;
  for (const item of values) {
    const column = document.createElement('span');
    column.setAttribute('aria-hidden', 'true');
    column.title = item.label;
    column.style.setProperty('--bar-height', `${item.value / max * 100}%`);
    element.append(column);
  }
  return element;
}

export function switchRow(label: string, control: HTMLInputElement, description?: string) {
  const element = document.createElement('label');
  element.className = 'toggle-label ui-switch-row';
  const copy = document.createElement('span');
  copy.textContent = label;
  if (description) {
    const detail = document.createElement('small');
    detail.textContent = description;
    copy.append(detail);
  }
  element.append(copy, control);
  return element;
}

export function stepList(steps: readonly { label: string; complete?: boolean }[]) {
  const element = document.createElement('ol');
  element.className = 'ui-step-list';
  for (const step of steps) {
    const item = document.createElement('li');
    item.append(step.label);
    if (step.complete !== undefined) {
      item.append(statusChip(step.complete ? '已完成' : '待完成', step.complete ? 'ok' : 'warn'));
    }
    element.append(item);
  }
  return element;
}

type Segment = { id: string; label: string; image?: string };

export function segmented(label: string, options: readonly Segment[], selected: string) {
  const element = document.createElement('div');
  element.className = 'ui-segmented';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', label);
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = option.id;
    button.setAttribute('aria-pressed', String(option.id === selected));
    if (option.image) {
      const image = document.createElement('img');
      image.src = option.image;
      image.alt = '';
      button.append(image);
    }
    button.append(option.label);
    element.append(button);
  }
  return element;
}

export function personaPicker(options: readonly (Segment & { image: string })[], selected: string) {
  const element = segmented('选择人设', options, selected);
  element.classList.add('ui-persona-picker');
  return element;
}
