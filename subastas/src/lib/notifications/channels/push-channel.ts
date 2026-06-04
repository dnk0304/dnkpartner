/**
 * Push Notification Channel
 * Web Push API implementation
 */

import webpush from 'web-push';
import { query, execute } from '@/lib/db';

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushChannel {
  constructor() {
    // Configure VAPID keys
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:notifications@subastasactivas.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    }
  }
  
  /**
   * Send push notification to user
   */
  async sendToUser(userId: string, payload: any): Promise<boolean> {
    try {
      // Get all push subscriptions for user
      const subscriptions = await query<PushSubscriptionRow>(
        'SELECT id, endpoint, p256dh, auth FROM PushSubscription WHERE userId = ?',
        [userId]
      );
      
      if (subscriptions.length === 0) {
        console.log(`No push subscriptions for user ${userId}`);
        return false;
      }
      
      const notificationPayload = JSON.stringify(payload);
      
      // Send to all subscriptions
      const sendPromises = subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            notificationPayload
          );
          return true;
        } catch (error: any) {
          console.error('Push send failed:', error);
          
          // Remove invalid subscriptions
          if (error.statusCode === 410 || error.statusCode === 404) {
            await execute('DELETE FROM PushSubscription WHERE id = ?', [sub.id]);
          }
          return false;
        }
      });
      
      const results = await Promise.all(sendPromises);
      return results.some(r => r); // Return true if at least one succeeded
      
    } catch (error) {
      console.error('Failed to send push notification:', error);
      return false;
    }
  }
}
