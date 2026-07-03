import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// Keep in sync with the "push-worthy" set chosen in docs/PUSH_NOTIFICATIONS_DESIGN.md.
// STATUS_UPDATE is intentionally excluded (stays in-app-only).
const PUSH_TYPES = new Set(['ASSIGNMENT', 'REQUEST', 'RETURN', 'HANDOFF', 'MENTION', 'SYSTEM']);

const NOT_REGISTERED_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

interface AppNotification {
  userId?: string;
  role?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

async function tokensForUser(userId: string): Promise<string[]> {
  const snap = await db.collection('users').doc(userId).collection('pushTokens').get();
  return snap.docs.map((d) => d.id);
}

async function deleteToken(userId: string, token: string): Promise<void> {
  await db.collection('users').doc(userId).collection('pushTokens').doc(token).delete();
}

export const sendPushOnNotification = onDocumentCreated(
  'notifications/{notificationId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notification = snap.data() as AppNotification;
    if (!notification) return;
    if (!PUSH_TYPES.has(notification.type)) {
      logger.info(`Skipping push: type "${notification.type}" is not push-worthy`, { notificationId: event.params.notificationId });
      return;
    }

    // Resolve recipient user IDs. In practice today every notification is written
    // with a concrete userId (role fan-out happens client-side in store.ts), but
    // AppNotification.role is supported here too in case that changes later.
    let recipientIds: string[] = [];
    if (notification.userId) {
      recipientIds = [notification.userId];
    } else if (notification.role) {
      const usersSnap = await db.collection('users').where('role', '==', notification.role).get();
      recipientIds = usersSnap.docs.map((d) => d.id);
    }
    if (recipientIds.length === 0) {
      logger.warn('Skipping push: notification has no userId or role', { notificationId: event.params.notificationId });
      return;
    }

    // Map each token back to its owning user so we can clean up dead tokens per-user.
    const tokenOwners = new Map<string, string>();
    for (const userId of recipientIds) {
      const tokens = await tokensForUser(userId);
      for (const token of tokens) tokenOwners.set(token, userId);
    }
    const tokens = Array.from(tokenOwners.keys());
    if (tokens.length === 0) {
      logger.info(`Skipping push: no registered devices for recipient(s) [${recipientIds.join(', ')}]`, { notificationId: event.params.notificationId });
      return;
    }

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        link: notification.link || '/',
        notificationId: event.params.notificationId,
      },
    });

    logger.info(`Push sent: ${response.successCount} succeeded, ${response.failureCount} failed`, {
      notificationId: event.params.notificationId,
      recipientIds,
    });

    const cleanups: Promise<void>[] = [];
    response.responses.forEach((result, idx) => {
      if (!result.success && result.error) {
        const token = tokens[idx];
        logger.warn(`Push failed for one token: ${result.error.code}`, { token });
        if (NOT_REGISTERED_CODES.has(result.error.code)) {
          const ownerId = tokenOwners.get(token);
          if (ownerId) cleanups.push(deleteToken(ownerId, token));
        }
      }
    });
    await Promise.all(cleanups);
  }
);
