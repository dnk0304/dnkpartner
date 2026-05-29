'use client';

import React from 'react';
import Link from 'next/link';
import { LogOut, User, CreditCard, Settings, Crown, Bell, Heart, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserTier, AuctionItem } from '@/types';
import { useSession, signOut } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TopBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  mapVisible: boolean;
  onMapToggle: () => void;
  mapItemCount: number;
  userTier: UserTier;
  onUpgradeClick: () => void;
  mapItems?: AuctionItem[];
  onMapMarkerClick?: (item: AuctionItem) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchTerm,
  setSearchTerm,
  mapVisible,
  onMapToggle,
  mapItemCount,
  userTier,
  onUpgradeClick,
  mapItems = [],
  onMapMarkerClick,
}) => {
  const { data: session } = useSession();

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* 1. Logo Section */}
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <span className="font-bold text-xl text-gray-800">SubastaPro</span>
          </div>
        </Link>

        {/* 2. Right Actions Section */}
        <div className="flex items-center gap-6">
          {/* Links */}
          <div className="hidden md:flex items-center gap-6 text-gray-600 text-sm font-medium">
            <button className="flex items-center gap-2 hover:text-blue-600 transition-colors">
              <Bell className="h-4 w-4" />
              <span>Tus alertas</span>
            </button>
            <button className="flex items-center gap-2 hover:text-blue-600 transition-colors" onClick={() => window.location.href = '/favorites'}>
              <Heart className="h-4 w-4" />
              <span>Tus favoritas</span>
            </button>
            <button className="flex items-center gap-2 hover:text-blue-600 transition-colors">
              <Mail className="h-4 w-4" />
              <span>Tus notificaciones</span>
            </button>
          </div>

          {/* User Menu */}
          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-1 h-10 rounded-full hover:bg-gray-50 border border-gray-200">
                  <div className="flex flex-col items-end mr-1 hidden sm:flex">
                    <span className="text-xs font-semibold text-gray-700 leading-none">{session.user.name}</span>
                    <span className="text-[10px] text-gray-500 leading-none mt-1 capitalize">{userTier}</span>
                  </div>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user.image || ''} />
                    <AvatarFallback>{session.user.name?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{session.user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session.user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onUpgradeClick} className="cursor-pointer">
                  <Crown className="mr-2 h-4 w-4 text-purple-500" />
                  <span>Subscription Plan</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span>Billing</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button 
              variant="default"
              onClick={() => window.location.href = '/login'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 rounded-full"
            >
              Entrar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
