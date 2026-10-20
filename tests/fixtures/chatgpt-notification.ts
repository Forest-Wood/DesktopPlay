/** Synthetic native log, no real account identifiers or conversation text. */
export const chatgptTurnEnd = (turn: string, time = Date.now(), thread = 'work-thread', host = 'durable') =>
  `${new Date(time).toISOString()} info [DesktopNotifications] [desktop-notifications] forward show kind=turn-complete notificationId=turn-${JSON.stringify(['fake-account', 'fake-user', host, thread, turn])}\n`;
