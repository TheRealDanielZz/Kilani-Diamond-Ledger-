
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';

// Set in .env / .env.local — see docs/PUSH_NOTIFICATIONS_DESIGN.md for where to get this.
const VAPID_KEY = process.env.FCM_VAPID_KEY as string | undefined;

let messagingInstance: Messaging | null | undefined; // undefined = not checked yet, null = unsupported

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance !== undefined) return messagingInstance;
  const supported = typeof window !== 'undefined' && (await isSupported().catch(() => false));
  messagingInstance = supported ? getMessaging(app) : null;
  return messagingInstance;
}

export interface ForegroundPushPayload {
  title?: string;
  body?: string;
  link?: string;
}

/**
 * Requests notification permission, registers the FCM service worker, and saves
 * this device's push token under users/{userId}/pushTokens/{token}.
 * Safe to call multiple times — a no-op if permission is denied or unsupported.
 */
export async function requestPushPermission(userId: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return false;
    }
    if (!VAPID_KEY) {
      console.warn('[push] FCM_VAPID_KEY is not set — skipping push registration.');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const messaging = await getMessagingInstance();
    if (!messaging) return false;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    await setDoc(doc(db, 'users', userId, 'pushTokens', token), {
      token,
      platform: navigator.platform || 'web',
      userAgent: navigator.userAgent,
      createdAt: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.error('[push] Failed to register for push notifications', err);
    return false;
  }
}

/**
 * Subscribes to messages that arrive while the app is in the foreground.
 * Returns an unsubscribe function.
 */
export async function onForegroundPush(callback: (payload: ForegroundPushPayload) => void): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
      link: payload.data?.link,
    });
  });
}
