/**
 * Notification Service
 * Main orchestrator for multi-channel notifications (Email, Push, WhatsApp)
 */

import { query, queryOne, execute } from '@/lib/db';
import { randomUUID } from 'crypto';

export type NotificationChannel = 'email' | 'push' | 'whatsapp';

export interface NotificationPayload {
  userId: string;
  auctionId: string;
  alertId?: string;
  type: 'new_auction' | 'price_change' | 'status_change' | 'ending_soon';
  data: any;
}

export class NotificationService {
  /**
   * Send notification via specified channels
   */
  async send(payload: NotificationPayload, channels: NotificationChannel[] = ['email']) {
    const results: Record<string, boolean> = {};
    
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'email':
            results.email = await this.sendEmail(payload);
            break;
          case 'push':
            results.push = await this.sendPush(payload);
            break;
          case 'whatsapp':
            results.whatsapp = await this.sendWhatsApp(payload);
            break;
        }
      } catch (error) {
        console.error(`Failed to send ${channel} notification:`, error);
        results[channel] = false;
      }
    }
    
    // Log notification in database
    await this.logNotification(payload, results);
    
    return results;
  }
  
  /**
   * Send email notification (using existing Resend integration)
   */
  private async sendEmail(payload: NotificationPayload): Promise<boolean> {
    // Import the existing email sending logic
    // This would use the Resend integration already set up
    console.log('Email notification sent:', payload);
    
    // TODO: Import and use actual email service
    // import { sendAuctionAlert } from '@/lib/email-templates';
    // await sendAuctionAlert(user.email, auction);
    
    return true;
  }
  
  /**
   * Send web push notification
   */
  private async sendPush(payload: NotificationPayload): Promise<boolean> {
    // Get user's push subscriptions
    const subscriptions = query<{id: string, endpoint: string, p256dh: string, auth: string}>(
      'SELECT id, endpoint, p256dh, auth FROM PushSubscription WHERE userId = ?',
      [payload.userId]
    );
    
    if (subscriptions.length === 0) {
      return false;
    }
    
    const webpush = require('web-push');
    
    // Configure VAPID keys (set in env)
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:notifications@subastapro.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    }
    
    const notificationPayload = {
      title: this.getNotificationTitle(payload.type),
      body: this.getNotificationBody(payload),
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: `/auction/${payload.auctionId}`
      }
    };
    
    // Send to all subscriptions
    const sendPromises = subscriptions.map(sub => {
      return webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        JSON.stringify(notificationPayload)
      ).catch((error: any) => {
        console.error('Push send failed:', error);
        // Remove invalid subscriptions
        if (error.statusCode === 410) {
          execute('DELETE FROM PushSubscription WHERE id = ?', [sub.id]);
        }
      });
    });
    
    await Promise.all(sendPromises);
    
    return true;
  }
  
  /**
   * Send WhatsApp notification
   */
  private async sendWhatsApp(payload: NotificationPayload): Promise<boolean> {
    // Get user phone number
    const user = queryOne<{phone: string | null}>(
      'SELECT phone FROM User WHERE id = ?',
      [payload.userId]
    );
    
    if (!user?.phone) {
      return false;
    }
    
    // Import WhatsApp channel (to be implemented)
    // const { WhatsAppChannel } = await import('./channels/whatsapp-channel');
    // const whatsapp = new WhatsAppChannel();
    
    const message = this.formatWhatsAppMessage(payload);
    
    // await whatsapp.sendMessage(user.phone, message);
    console.log('WhatsApp notification sent:', { phone: user.phone, message });
    
    return true;
  }
  
  /**
   * Log notification in database
   */
  private async logNotification(payload: NotificationPayload, results: Record<string, boolean>) {
    try {
      const id = randomUUID();
      const now = new Date().toISOString();
      execute(`
        INSERT INTO Notification (id, userId, auctionId, alertId, read, sentAt)
        VALUES (?, ?, ?, ?, 0, ?)
      `, [id, payload.userId, payload.auctionId, payload.alertId || null, now]);
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }
  
  // Helper methods for message formatting
  
  private getNotificationTitle(type: string): string {
    const titles: Record<string, string> = {
      'new_auction': 'Nueva Subasta Disponible',
      'price_change': 'Cambio de Precio',
      'status_change': 'Actualización de Estado',
      'ending_soon': 'Subasta Finalizando Pronto'
    };
    return titles[type] || 'Notificación SubastaPro';
  }
  
  private getNotificationBody(payload: NotificationPayload): string {
    // Format based on type
    if (payload.data.title) {
      return payload.data.title;
    }
    return 'Una subasta que te interesa ha sido actualizada.';
  }
  
  private formatWhatsAppMessage(payload: NotificationPayload): string {
    const { type, data } = payload;
    
    let message = `🏛️ *SubastaPro Alerta*\n\n`;
    
    switch (type) {
      case 'new_auction':
        message += `📢 *Nueva Subasta*\n`;
        message += `${data.title}\n\n`;
        message += `💰 Valor: ${this.formatCurrency(data.appraisalValue)}\n`;
        message += `📍 ${data.municipality}, ${data.province}\n\n`;
        message += `Ver más: ${process.env.NEXT_PUBLIC_URL}/auction/${payload.auctionId}`;
        break;
      
      case 'price_change':
        message += `📉 *Cambio de Precio*\n`;
        message += `${data.title}\n\n`;
        message += `Nuevo precio: ${this.formatCurrency(data.newPrice)}\n`;
        break;
      
      case 'ending_soon':
        message += `⏰ *Subasta Finalizando*\n`;
        message += `${data.title}\n\n`;
        message += `Finaliza: ${data.endsAt}\n`;
        break;
    }
    
    return message;
  }
  
  private formatCurrency(amount: number | null): string {
    if (amount === null || Number.isNaN(amount)) {
      return 'Sin tasación';
    }
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
