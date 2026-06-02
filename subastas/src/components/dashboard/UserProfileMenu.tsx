'use client';

import React, { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  User,
  Settings,
  Bell,
  LogOut,
  Crown,
  Calendar,
  Mail,
  ChevronDown,
  Shield,
  Sparkles,
  Database,
  LayoutTemplate,
  Newspaper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { UserTier } from '@/types';
import { ProfileEditModal } from './ProfileEditModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';

interface UserProfileMenuProps {
  onUpgradeClick?: () => void;
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({ onUpgradeClick }) => {
  const { data: session } = useSession();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);

  if (!session?.user) {
    return null;
  }

  const { user } = session;
  const userTier = (user.tier as UserTier) || 'free';
  // Trial data not available in session - would need separate API call
  const trialEndDate = null;
  const isTrialActive = false;
  const daysRemaining = 0;

  const getTierBadge = () => {
    switch (userTier) {
      case 'diamond':
        return (
          <Badge className="bg-[--color-action-soft] text-[--color-ink-primary] border border-[--color-action]">
            <Crown className="h-3 w-3 mr-1" />
            Diamond
          </Badge>
        );
      case 'gold':
        return (
          <Badge className="bg-[--color-warn-attention-soft] text-[--color-ink-primary] border border-[--color-warn-attention]">
            <Crown className="h-3 w-3 mr-1" />
            Gold
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-gray-200 text-gray-700">
            Free
          </Badge>
        );
    }
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // Get user initials for avatar
  const getInitials = () => {
    if (user.name) {
      return user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user.email?.[0]?.toUpperCase() || 'U';
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-3 h-14 px-4 hover:bg-gray-100 rounded-xl"
          >
            {/* Avatar */}
            {user.image ? (
              <img
                src={user.image}
                alt={user.name || 'User'}
                className="h-10 w-10 rounded-full object-cover border-2 border-gray-300"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[--color-brand] flex items-center justify-center text-[--color-ink-inverse] font-semibold text-sm border-2 border-[--color-hairline]">
                {getInitials()}
              </div>
            )}

            {/* User Info */}
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold text-gray-900 leading-tight">
                {user.name || 'Usuario'}
              </span>
              <div className="flex items-center gap-1">
                {getTierBadge()}
              </div>
            </div>

            <ChevronDown className="h-4 w-4 text-gray-500" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name || 'User'}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-[--color-brand] flex items-center justify-center text-[--color-ink-inverse] font-bold text-lg">
                  {getInitials()}
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{user.name || 'Usuario'}</p>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getTierBadge()}
              {isTrialActive && daysRemaining > 0 && (
                <Badge variant="outline" className="text-xs border-green-500 text-green-700">
                  <Calendar className="h-3 w-3 mr-1" />
                  {daysRemaining} días de prueba
                </Badge>
              )}
            </div>
          </div>

          <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">
            Mi Cuenta
          </DropdownMenuLabel>

          {/* Profile Settings */}
          <DropdownMenuItem
            onClick={() => setProfileModalOpen(true)}
            className="cursor-pointer py-3"
          >
            <User className="h-4 w-4 mr-3 text-gray-600" />
            <span>Editar Perfil</span>
          </DropdownMenuItem>

          {/* Notification Settings */}
          <DropdownMenuItem
            onClick={() => setNotificationsModalOpen(true)}
            className="cursor-pointer py-3"
          >
            <Bell className="h-4 w-4 mr-3 text-gray-600" />
            <span>Notificaciones</span>
          </DropdownMenuItem>

          {/* Account Settings */}
          <DropdownMenuItem className="cursor-pointer py-3">
            <Settings className="h-4 w-4 mr-3 text-gray-600" />
            <span>Settings</span>
          </DropdownMenuItem>

          {/* Admin - Only for dennis.kotlenko@gmail.com */}
          {user.email === 'dennis.kotlenko@gmail.com' && (
            <>
              <DropdownMenuItem
                onClick={() => window.location.href = '/admin/dashboard'}
                className="cursor-pointer py-3"
              >
                <Shield className="h-4 w-4 mr-3 text-blue-600" />
                <span className="text-blue-600 font-medium">Admin</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.location.href = '/admin/blog'}
                className="cursor-pointer py-3"
              >
                <Newspaper className="h-4 w-4 mr-3 text-blue-600" />
                <span className="text-blue-600 font-medium">Blog / Artículos</span>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {/* Upgrade to Premium (Free tier only) */}
          {userTier === 'free' && onUpgradeClick && (
            <>
              <DropdownMenuItem
                onClick={onUpgradeClick}
                className="cursor-pointer py-3 bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100 text-amber-900 font-semibold"
              >
                <Sparkles className="h-4 w-4 mr-3 text-amber-600" />
                <span>Actualizar a Premium</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Logout */}
          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer py-3 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 mr-3" />
            <span>Cerrar Sesión</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      <ProfileEditModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
      <NotificationSettingsModal
        open={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
      />
    </>
  );
};
