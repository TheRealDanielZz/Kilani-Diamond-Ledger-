// Background push handler for KILANI Diamond Reporter.
// This file must live at the site root (not bundled by Vite) so the browser
// can register it as a service worker scoped to "/".
// Firebase web config is not a secret — it's meant to be public; access is
// controlled by Firestore/Storage security rules, not by hiding this key.

importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA7p4Tdi5qOJtJ_lcyD2t_HS7GV5y1safM",
  authDomain: "kilani-diamond-ledger.firebaseapp.com",
  projectId: "kilani-diamond-ledger",
  storageBucket: "kilani-diamond-ledger.firebasestorage.app",
  messagingSenderId: "1002569437016",
  appId: "1:1002569437016:web:3634503157521d63bddf2d",
  measurementId: "G-FCB5KNY1H1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'KILANI Diamond Reporter';
  const options = {
    body: payload.notification?.body,
    icon: '/brand-logo.jpg',
    badge: '/brand-logo.jpg',
    data: { link: payload.data?.link || '/' },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  // The app uses react-router's HashRouter (paths live after "#"), so a raw
  // "/project/123" must become "/#/project/123" for the browser to route it correctly.
  const targetUrl = new URL('/#' + link, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
