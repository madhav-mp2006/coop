import { getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, messaging, isFirebaseConfigured } from './firebase';
import { doc, setDoc, deleteField } from 'firebase/firestore';

// Replace with your VAPID Key from Firebase Console -> Project Settings -> Cloud Messaging -> Web configuration
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let fcmToken: string | null = null;

export const requestPushPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return Notification.permission === 'granted';
};

export const getFCMToken = async (): Promise<string | null> => {
  if (!isFirebaseConfigured || !messaging) return null;
  if (!VAPID_KEY) {
    console.warn('VITE_FIREBASE_VAPID_KEY is not set. FCM will not work.');
    return null;
  }

  if (fcmToken) return fcmToken;

  try {
    let swRegistration;
    if ('serviceWorker' in navigator) {
      const configParams = new URLSearchParams({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID
      }).toString();
      
      swRegistration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${configParams}`,
        { scope: '/' }
      );
    }

    const token = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });
    
    if (token) {
      fcmToken = token;
      return token;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
  }
  return null;
};

export const listenForForegroundMessages = (onPayload: (payload: any) => void) => {
  if (!messaging) return () => {};
  return onMessage(messaging, onPayload);
};

export const registerTokenToTeam = async (teamId: string) => {
  const token = await getFCMToken();
  if (token && db) {
    await setDoc(doc(db, 'teams', teamId), {
      fcmTokens: {
        [token]: true
      }
    }, { merge: true });
  }
};

export const registerTokenToAdmin = async () => {
  const token = await getFCMToken();
  if (token && db) {
    await setDoc(doc(db, 'config', 'admin_fcm_tokens'), {
      tokens: {
        [token]: true
      }
    }, { merge: true });
  }
};

export const removeTokenFromTeam = async (teamId: string) => {
  if (!fcmToken || !db) return;
  await setDoc(doc(db, 'teams', teamId), {
    fcmTokens: {
      [fcmToken]: deleteField()
    }
  }, { merge: true });
};

export const removeTokenFromAdmin = async () => {
  if (!fcmToken || !db) return;
  await setDoc(doc(db, 'config', 'admin_fcm_tokens'), {
    tokens: {
      [fcmToken]: deleteField()
    }
  }, { merge: true });
};

// Callable function helper
export const sendFCMNotification = async (targetType: 'team' | 'admins', targetId: string | null, title: string, body: string, urlPath?: string) => {
  if (!isFirebaseConfigured) return;
  
  try {
    const functions = getFunctions();
    const sendNotif = httpsCallable(functions, 'sendNotification');
    await sendNotif({
      targetType,
      targetId,
      title,
      body,
      urlPath
    });
  } catch (error) {
    console.error('Error triggering cloud function for notification:', error);
  }
};
