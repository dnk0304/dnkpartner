import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  X, 
  Check, 
  CheckCheck, 
  Trash2, 
  Flame, 
  TrendingUp, 
  FolderOpen,
  Info,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import { 
  useNotifications, 
  useMarkNotificationRead, 
  useMarkAllNotificationsRead,
  useClearAllNotifications,
  useDeleteNotification,
  Notification 
} from '../../../hooks/useTrendingData';

interface NotificationBellProps {
  className?: string;
  onNavigateToKeyword?: (keyword: string) => void;
}

export function NotificationBell({ className, onNavigateToKeyword }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Fetch notifications
  const { data, isLoading } = useNotifications({ limit: 20 });
  
  // Mutations
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const clearAll = useClearAllNotifications();
  const deleteNotification = useDeleteNotification();
  
  const notifications = data?.notifications || [];
  const unreadCount = data?.stats?.unread || 0;
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Get icon for notification type
  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'opportunity':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      case 'trend_alert':
        return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'category_update':
        return <FolderOpen className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };
  
  // Get background color for notification type
  const getNotificationBg = (type: Notification['type'], read: boolean) => {
    if (read) return 'bg-white';
    
    switch (type) {
      case 'opportunity':
        return 'bg-amber-50';
      case 'trend_alert':
        return 'bg-emerald-50';
      case 'category_update':
        return 'bg-blue-50';
      default:
        return 'bg-gray-50';
    }
  };
  
  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };
  
  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }
    
    if (notification.keyword && onNavigateToKeyword) {
      onNavigateToKeyword(notification.keyword);
      setIsOpen(false);
    }
  };
  
  // Handle mark all as read
  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };
  
  // Handle clear all
  const handleClearAll = () => {
    clearAll.mutate();
  };
  
  // Handle delete single notification
  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteNotification.mutate(id);
  };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      {/* Bell Button */}
      <Button 
        variant="ghost" 
        size="icon-sm" 
        onClick={() => setIsOpen(!isOpen)}
        className="text-gray-500 hover:text-gray-900 relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
      
      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-600" />
              <span className="font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="text-xs text-gray-500 hover:text-indigo-600 h-7 px-2"
                  disabled={markAllRead.isPending}
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Bell className="w-6 h-6 text-gray-400" />
                </div>
                <p className="font-medium text-gray-900">No notifications yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  We'll notify you when we find new opportunities
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 group",
                      getNotificationBg(notification.type, notification.read)
                    )}
                  >
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        notification.type === 'opportunity' && "bg-amber-100",
                        notification.type === 'trend_alert' && "bg-emerald-100",
                        notification.type === 'category_update' && "bg-blue-100",
                        notification.type === 'system' && "bg-gray-100"
                      )}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm",
                            !notification.read ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                          )}>
                            {notification.title}
                          </p>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        
                        {/* Tags */}
                        <div className="flex items-center gap-2 mt-2">
                          {notification.keyword && (
                            <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                              <Flame className="w-3 h-3" />
                              {notification.keyword}
                            </span>
                          )}
                          {notification.category && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {notification.category}
                            </span>
                          )}
                          {notification.opportunityScore && notification.opportunityScore > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                              Score: {notification.opportunityScore.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex-shrink-0 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              markRead.mutate(notification.id);
                            }}
                            className="text-gray-400 hover:text-emerald-600 h-6 w-6"
                            title="Mark as read"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => handleDelete(e, notification.id)}
                          className="text-gray-400 hover:text-red-600 h-6 w-6"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer */}
          {notifications.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-xs text-gray-500 hover:text-red-600 h-7"
                disabled={clearAll.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Clear all
              </Button>
              <span className="text-xs text-gray-400">
                {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

