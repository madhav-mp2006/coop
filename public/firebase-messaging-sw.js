importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// We need a lightweight way to get the config here.
// Since import.meta.env is not available in a standard service worker without Vite build processes,
// we will intercept fetch requests to a fake endpoint to inject config, OR
// rely on the standard approach: the user must manually paste their config here.

// Please paste your firebaseConfig object here from your .env variables:
// We can use URL params to inject config when registering the service worker!
const params = new URL(location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId')
};

// Check if config exists (if registered normally without params, it might fail, 
// so we also provide hardcoded fallback if needed, but url params is safest for dynamic env)
if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    const notificationTitle = payload.notification.title || 'New Update';
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/vite.svg', // Update to your app icon
      data: payload.data,
      click_action: payload.notification.click_action || payload.fcmOptions?.link
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.click_action || event.notification.data?.link || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
