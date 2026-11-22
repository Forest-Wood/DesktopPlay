export function mountBubbleMore(bubble: HTMLElement) {
  const trigger = bubble.querySelector<HTMLButtonElement>('.bubble-more')!;
  const overlay = bubble.querySelector<HTMLElement>('.bubble-menu-overlay')!;
  const surfaces = [...bubble.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child !== overlay);
  const items = () => [...overlay.querySelectorAll<HTMLButtonElement>('button:not([hidden]):not(:disabled)')];

  function close(restoreFocus = true) {
    if (overlay.hidden) return;
    overlay.hidden = true;
    for (const surface of surfaces) surface.inert = false;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => {
    overlay.hidden = false;
    for (const surface of surfaces) surface.inert = true;
    trigger.setAttribute('aria-expanded', 'true');
    items()[0]?.focus({ preventScroll: true });
  });
  overlay.querySelector('.bubble-menu-close')!.addEventListener('click', () => close());
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const buttons = items();
      const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
      }
    }
  });
  return { close, focusTrigger: () => trigger.focus({ preventScroll: true }) };
}
