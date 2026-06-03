// OneSignal Service for web push notifications

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
const restApiKey = import.meta.env.VITE_ONESIGNAL_REST_API_KEY;

// Helper to check if credentials are valid and not mock placeholders
const isConfigured = (): boolean => {
  return !!appId && !appId.includes('mock-') && !!restApiKey && !restApiKey.includes('mock-');
};

/** Load the OneSignal SDK script dynamically */
const loadOneSignalScript = (): Promise<void> => {
  return new Promise((resolve) => {
    if (document.getElementById('onesignal-sdk')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'onesignal-sdk';
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      console.error('Failed to load OneSignal SDK script.');
      resolve(); // resolve anyway to avoid hanging
    };
    document.head.appendChild(script);
  });
};

/** Initialize OneSignal */
export const initOneSignal = async () => {
  if (!appId || appId.includes('mock-')) {
    console.info('[OneSignal] SDK initialization skipped: Mock or empty APP_ID.');
    return;
  }

  await loadOneSignalScript();

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    await OneSignal.init({
      appId: appId,
      allowLocalhostAsSecureOrigin: true,
      notifyButton: {
        enable: false, // We will use our own custom UI button
      },
    });
    console.log('[OneSignal] SDK initialized successfully.');
  });
};

/**
 * Associate the user with their team ID, role, and league ID tags so we can target notifications to them.
 */
export const setOneSignalUser = (
  teamId: string | null,
  email: string | null,
  isAdmin: boolean,
  leagueId: string | null
) => {
  if (!appId || appId.includes('mock-')) return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    // Set external user ID to the teamId or user email if they exist, to uniquely identify the user
    const identifier = teamId ? `team-${teamId.toLowerCase()}` : (email ? `user-${email.replace(/[@.]/g, '_')}` : null);
    
    if (identifier) {
      await OneSignal.login(identifier);
    } else {
      await OneSignal.logout();
    }

    // Set targeting tags
    if (teamId) {
      await OneSignal.User.addTag('teamId', teamId.toLowerCase());
    } else {
      await OneSignal.User.removeTag('teamId');
    }

    if (leagueId) {
      await OneSignal.User.addTag('leagueId', leagueId.toLowerCase());
    } else {
      await OneSignal.User.removeTag('leagueId');
    }

    if (isAdmin) {
      await OneSignal.User.addTag('role', 'admin');
    } else {
      await OneSignal.User.removeTag('role');
    }

    if (email) {
      await OneSignal.User.addTag('email', email);
    } else {
      await OneSignal.User.removeTag('email');
    }
  });
};

/** Prompt the user for push notifications permission */
export const requestPushPermission = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!appId || appId.includes('mock-')) {
      alert('OneSignal notifications cannot be enabled with mock keys. Configure a real APP_ID in .env.');
      resolve();
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.Notifications.requestPermission();
        resolve();
      } catch (err) {
        console.error('Error prompting for push notifications:', err);
        resolve();
      }
    });
  });
};

/** Check if push notification permission is granted */
export const isPushPermissionGranted = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!appId || appId.includes('mock-')) {
      resolve(false);
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push((OneSignal: any) => {
      resolve(!!OneSignal.Notifications.permission);
    });
  });
};

/** Send a push notification using OneSignal REST API (Client-side trigger) */
const postNotification = async (payload: any): Promise<boolean> => {
  if (!isConfigured()) {
    console.info('[OneSignal] Notification send skipped: API keys are not configured or are mocks.');
    return false;
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        ...payload,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OneSignal] Failed to send notification:', errText);
      return false;
    }

    console.log('[OneSignal] Push notification sent successfully.');
    return true;
  } catch (error) {
    console.error('[OneSignal] Network error sending notification:', error);
    return false;
  }
};

/** Trigger a push notification to all players in a specific team */
export const notifyTeamOffline = async (teamId: string, title: string, body: string, urlPath?: string) => {
  const payload: any = {
    contents: { en: body },
    headings: { en: title },
    filters: [
      { field: 'tag', key: 'teamId', relation: '=', value: teamId.toLowerCase() }
    ],
  };

  if (urlPath) {
    // Direct link to open when notification is clicked
    payload.url = `${window.location.origin}${urlPath}`;
  }

  return postNotification(payload);
};

/** Trigger a push notification to all admins */
export const notifyAdminsOffline = async (title: string, body: string, urlPath?: string) => {
  const payload: any = {
    contents: { en: body },
    headings: { en: title },
    filters: [
      { field: 'tag', key: 'role', relation: '=', value: 'admin' }
    ],
  };

  if (urlPath) {
    payload.url = `${window.location.origin}${urlPath}`;
  }

  return postNotification(payload);
};

/** Trigger a push notification to all players in a specific league */
export const notifyLeagueOffline = async (leagueId: string, title: string, body: string, urlPath?: string) => {
  const payload: any = {
    contents: { en: body },
    headings: { en: title },
    filters: [
      { field: 'tag', key: 'leagueId', relation: '=', value: leagueId.toLowerCase() }
    ],
  };

  if (urlPath) {
    payload.url = `${window.location.origin}${urlPath}`;
  }

  return postNotification(payload);
};
