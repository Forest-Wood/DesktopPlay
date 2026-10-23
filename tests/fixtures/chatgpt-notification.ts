/** Synthetic native log, no real account identifiers or conversation text. */
export const chatgptTurnEnd = (turn: string, time = Date.now(), thread = 'work-thread', host = 'durable') =>
  `${new Date(time).toISOString()} info [DesktopNotifications] [desktop-notifications] forward show kind=turn-complete notificationId=turn-${JSON.stringify(['fake-account', 'fake-user', host, thread, turn])}\n`;

export const chatgptAttention = (kind: 'question' | 'approval' | 'async', request: string, host: 'local' | 'durable' = 'durable', time = Date.now()) => {
  const id = kind === 'async' ? `async-question-${JSON.stringify(['fake-account', 'fake-user', host, 'fake-thread', 'fake-turn', request])}` : `${kind}-${host}-${request}`;
  return `${new Date(time).toISOString()} info [DesktopNotifications] [desktop-notifications] forward show kind=${kind === 'approval' ? 'permission' : 'question'} notificationId=${id}\n`;
};
