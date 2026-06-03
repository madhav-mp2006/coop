// Browser Notification Service for Scores Tournament App
// Handles permission requests, sending notifications, and preference persistence.

const LS_NOTIF_PREF = 'scores_notifications_enabled';

export type NotifPermission = 'default' | 'granted' | 'denied';

/** Returns current browser notification permission state */
export const getNotificationPermission = (): NotifPermission => {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission as NotifPermission;
};

/** Whether the user has explicitly opted in via our UI */
export const isNotificationsEnabled = (): boolean => {
  return (
    getNotificationPermission() === 'granted' &&
    localStorage.getItem(LS_NOTIF_PREF) === 'true'
  );
};

/** Request browser permission and persist opt-in preference */
export const requestNotificationPermission = async (): Promise<NotifPermission> => {
  if (!('Notification' in window)) return 'denied';

  if (Notification.permission === 'granted') {
    localStorage.setItem(LS_NOTIF_PREF, 'true');
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  const result = await Notification.requestPermission();
  if (result === 'granted') {
    localStorage.setItem(LS_NOTIF_PREF, 'true');
  }
  return result as NotifPermission;
};

/** Opt out (clears preference, does not revoke system permission) */
export const disableNotifications = () => {
  localStorage.setItem(LS_NOTIF_PREF, 'false');
};

/** Send a notification — silently skipped if app is focused or not enabled */
export const sendNotification = (
  title: string,
  options: NotificationOptions & { skipFocusCheck?: boolean } = {}
) => {
  if (!isNotificationsEnabled()) return;

  // Suppress when the browser tab is visible and focused (unless overridden)
  if (!options.skipFocusCheck && document.visibilityState === 'visible') return;

  const { skipFocusCheck: _skip, ...notifOptions } = options;

  const notification = new Notification(title, {
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    ...notifOptions,
  });

  // Auto-close after 8 seconds
  setTimeout(() => notification.close(), 8000);

  // Click → focus the tab
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
};

// ─── Typed notification helpers ────────────────────────────────────────────

export const notify = {
  scoreUpdated: (homeTeam: string, awayTeam: string, homeScore: number, awayScore: number) => {
    sendNotification('⚽ Score Updated', {
      body: `${homeTeam} ${homeScore} – ${awayScore} ${awayTeam}`,
      tag: 'score-update',
    });
  },

  scorePendingApproval: (homeTeam: string, awayTeam: string) => {
    sendNotification('📋 Score Awaiting Approval', {
      body: `${homeTeam} vs ${awayTeam} — submitted by captain, pending admin review.`,
      tag: 'score-pending',
    });
  },

  teamApproved: (teamName: string) => {
    sendNotification('✅ Team Approved!', {
      body: `"${teamName}" has been approved and is now in the tournament.`,
      tag: `team-approved-${teamName}`,
    });
  },

  teamRejected: (teamName: string) => {
    sendNotification('❌ Team Rejected', {
      body: `"${teamName}" was not approved for this tournament.`,
      tag: `team-rejected-${teamName}`,
    });
  },

  newTeamRegistered: (teamName: string) => {
    sendNotification('🆕 New Team Registered', {
      body: `"${teamName}" has applied to join the tournament. Review in Admin Panel.`,
      tag: `new-team-${teamName}`,
    });
  },

  roundStarted: (roundNum: number) => {
    sendNotification('🏁 New Round Started', {
      body: `Round ${roundNum} fixtures are now live! Check the Fixtures tab.`,
      tag: `round-${roundNum}`,
    });
  },

  knockoutStageStarted: () => {
    sendNotification('🏆 Knockout Stage Begins!', {
      body: 'The group stage is over. Semi-finals are now live!',
      tag: 'knockout-start',
    });
  },

  championCrowned: (teamName: string) => {
    sendNotification('🥇 Champion Crowned!', {
      body: `"${teamName}" is the tournament champion! Congratulations!`,
      tag: 'champion',
    });
  },

  tournamentStarted: (leagueName: string) => {
    sendNotification('🎉 Tournament Started!', {
      body: `"${leagueName}" has kicked off. May the best team win!`,
      tag: 'tournament-started',
    });
  },

  roomCodePosted: (homeTeam: string, awayTeam: string, code: string) => {
    sendNotification('🎮 Room Code Ready!', {
      body: `${homeTeam} has posted a room code for your match vs ${awayTeam}: ${code}`,
      tag: `room-code-${homeTeam}-${awayTeam}`,
      // Always show even if tab is visible — this is time-sensitive
      skipFocusCheck: true,
    });
  },
};
