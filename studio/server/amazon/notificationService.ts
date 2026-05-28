/**
 * Notification Service
 * 
 * Manages in-app notifications for trending opportunities,
 * category alerts, and keyword updates
 */

import { Marketplace } from './types';
import { trendingService, TrendingKeyword } from './trendingService';

// ==================== TYPES ====================

export type NotificationType = 'opportunity' | 'trend_alert' | 'category_update' | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  keyword?: string;
  category?: string;
  marketplace?: Marketplace;
  opportunityScore?: number;
  createdAt: Date;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface NotificationPreferences {
  opportunityAlerts: boolean;
  trendAlerts: boolean;
  categoryUpdates: boolean;
  minOpportunityScore: number;
  emailNotifications: boolean;
}

// ==================== NOTIFICATION SERVICE ====================

class NotificationService {
  private notifications: Map<string, Notification> = new Map();
  private preferences: NotificationPreferences = {
    opportunityAlerts: true,
    trendAlerts: true,
    categoryUpdates: true,
    minOpportunityScore: 5,
    emailNotifications: false,
  };
  private checkInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor() {
    this.initializeWithMockNotifications();
  }

  /**
   * Initialize with some mock notifications for demo
   */
  private initializeWithMockNotifications(): void {
    if (this.initialized) return;

    // Create some sample notifications
    const sampleNotifications: Omit<Notification, 'id'>[] = [
      {
        type: 'opportunity',
        title: '🔥 Emerging Opportunity Detected',
        message: '"marvel coloring book" is trending with low competition! Opportunity score: 15.2',
        keyword: 'marvel coloring book',
        category: 'Books & Coloring Books',
        marketplace: 'US',
        opportunityScore: 15.2,
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
        read: false,
        actionUrl: '/ai-trends?keyword=marvel+coloring+book',
      },
      {
        type: 'trend_alert',
        title: '📈 Keyword Surge Alert',
        message: '"fidget toys pack" search volume increased 85% in the last 7 days',
        keyword: 'fidget toys pack',
        category: 'Toys & Games',
        marketplace: 'US',
        opportunityScore: 8.5,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        read: false,
      },
      {
        type: 'category_update',
        title: '📊 Category Report Ready',
        message: 'Weekly analysis for "Home & Kitchen" is now available with 12 new opportunities',
        category: 'Home & Kitchen',
        marketplace: 'US',
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
        read: true,
      },
      {
        type: 'opportunity',
        title: '💎 Hidden Gem Found',
        message: '"kawaii coloring book" has very low competition (score: 12) with rising demand',
        keyword: 'kawaii coloring book',
        category: 'Books & Coloring Books',
        marketplace: 'US',
        opportunityScore: 12.8,
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
        read: true,
      },
      {
        type: 'system',
        title: '✅ Monitoring Active',
        message: 'Your category monitors are running. Tracking 3 categories across US marketplace.',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        read: true,
      },
    ];

    sampleNotifications.forEach((notif, idx) => {
      const id = `notif-${Date.now()}-${idx}`;
      this.notifications.set(id, { ...notif, id });
    });

    this.initialized = true;
    console.log('[NotificationService] Initialized with mock notifications');
  }

  /**
   * Create a new notification
   */
  createNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>): Notification {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date(),
      read: false,
    };

    this.notifications.set(id, newNotification);
    console.log(`[NotificationService] Created notification: ${notification.title}`);
    
    return newNotification;
  }

  /**
   * Create opportunity notification from trending keyword
   */
  createOpportunityNotification(keyword: TrendingKeyword): Notification {
    const emoji = keyword.opportunityScore > 10 ? '🔥' : '💡';
    
    return this.createNotification({
      type: 'opportunity',
      title: `${emoji} ${keyword.isEmerging ? 'Emerging' : 'New'} Opportunity: "${keyword.keyword}"`,
      message: `${keyword.category} - Competition: ${keyword.competitionScore}/100, Growth: +${keyword.volumeChange7d.toFixed(1)}% (7d)`,
      keyword: keyword.keyword,
      category: keyword.category,
      marketplace: keyword.marketplace,
      opportunityScore: keyword.opportunityScore,
      actionUrl: `/ai-trends?keyword=${encodeURIComponent(keyword.keyword)}`,
    });
  }

  /**
   * Get all notifications
   */
  getNotifications(options: {
    unreadOnly?: boolean;
    type?: NotificationType;
    limit?: number;
  } = {}): Notification[] {
    const { unreadOnly = false, type, limit = 50 } = options;

    let results = Array.from(this.notifications.values());

    if (unreadOnly) {
      results = results.filter(n => !n.read);
    }
    if (type) {
      results = results.filter(n => n.type === type);
    }

    // Sort by createdAt descending (newest first)
    return results
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get notification by ID
   */
  getNotification(id: string): Notification | undefined {
    return this.notifications.get(id);
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): boolean {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.read = true;
      return true;
    }
    return false;
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): number {
    let count = 0;
    this.notifications.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        count++;
      }
    });
    return count;
  }

  /**
   * Delete a notification
   */
  deleteNotification(id: string): boolean {
    return this.notifications.delete(id);
  }

  /**
   * Clear all notifications
   */
  clearAll(): number {
    const count = this.notifications.size;
    this.notifications.clear();
    return count;
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return Array.from(this.notifications.values()).filter(n => !n.read).length;
  }

  /**
   * Get notification stats
   */
  getStats(): {
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
  } {
    const notifications = Array.from(this.notifications.values());
    const byType: Record<NotificationType, number> = {
      opportunity: 0,
      trend_alert: 0,
      category_update: 0,
      system: 0,
    };

    notifications.forEach(n => {
      byType[n.type]++;
    });

    return {
      total: notifications.length,
      unread: notifications.filter(n => !n.read).length,
      byType,
    };
  }

  /**
   * Update notification preferences
   */
  updatePreferences(prefs: Partial<NotificationPreferences>): NotificationPreferences {
    this.preferences = { ...this.preferences, ...prefs };
    return this.preferences;
  }

  /**
   * Get notification preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Check for new opportunities and create notifications
   * This would be called periodically in production
   */
  async checkForOpportunities(): Promise<Notification[]> {
    const newNotifications: Notification[] = [];
    
    // Get emerging opportunities
    const opportunities = trendingService.detectEmergingOpportunities();
    
    // Filter by minimum score preference
    const filtered = opportunities.filter(
      opp => opp.opportunityScore >= this.preferences.minOpportunityScore
    );

    // Create notifications for top opportunities (limit to avoid spam)
    const topOpportunities = filtered.slice(0, 3);
    
    for (const opportunity of topOpportunities) {
      // Check if we already have a recent notification for this keyword
      const existing = Array.from(this.notifications.values()).find(
        n => n.keyword === opportunity.keyword && 
             n.createdAt.getTime() > Date.now() - 24 * 60 * 60 * 1000 // Within 24 hours
      );

      if (!existing && this.preferences.opportunityAlerts) {
        const notification = this.createOpportunityNotification(opportunity);
        newNotifications.push(notification);
      }
    }

    return newNotifications;
  }

  /**
   * Start periodic opportunity checking
   */
  startOpportunityMonitoring(intervalMs: number = 60 * 60 * 1000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkForOpportunities().catch(err => {
        console.error('[NotificationService] Error checking opportunities:', err);
      });
    }, intervalMs);

    console.log(`[NotificationService] Started opportunity monitoring (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic opportunity checking
   */
  stopOpportunityMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[NotificationService] Stopped opportunity monitoring');
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

