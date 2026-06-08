'use client';

import React from 'react';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { OFFICIAL_CATEGORIES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, RotateCcw, Save, LayoutTemplate } from 'lucide-react';
import Link from 'next/link';
import { AuctionCategory } from '@/types';

export default function LayoutEditorPage() {
  const { settings, toggleCategoryVisibility, resetSettings } = useAdminSettings();

  const handleToggle = (category: string) => {
    toggleCategoryVisibility(category as AuctionCategory);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Layout Editor</h1>
              <p className="text-gray-500">Customize what your users see on the dashboard.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={resetSettings} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset Defaults
            </Button>
            <Button className="gap-2 bg-[var(--color-surface)] border-2 border-[var(--color-ink-primary)] text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-muted)]">
              <Save className="w-4 h-4" />
              Auto-Saved
            </Button>
          </div>
        </div>

        {/* Categories Config */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-blue-600" />
              Visible Categories
            </CardTitle>
            <CardDescription>
              Toggle which asset categories are displayed in the filters and feed. 
              Data collection continues in the background for all categories.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            
            {/* Real Estate Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Real Estate (Inmuebles)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {OFFICIAL_CATEGORIES.REAL_ESTATE.map((category) => (
                  <div key={category} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-all">
                    <Label htmlFor={`toggle-${category}`} className="flex flex-col gap-1 cursor-pointer">
                      <span className="font-medium text-gray-900">{category}</span>
                      <span className="text-xs text-gray-400">
                        {settings.visibleCategories.includes(category as AuctionCategory) ? 'Visible to users' : 'Hidden'}
                      </span>
                    </Label>
                    <Switch
                      id={`toggle-${category}`}
                      checked={settings.visibleCategories.includes(category as AuctionCategory)}
                      onCheckedChange={() => handleToggle(category)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Movable Assets Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Vehicles & Movable (Muebles)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {OFFICIAL_CATEGORIES.MOVABLE.map((category) => (
                  <div key={category} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-all">
                    <Label htmlFor={`toggle-${category}`} className="flex flex-col gap-1 cursor-pointer">
                      <span className="font-medium text-gray-900">{category}</span>
                      <span className="text-xs text-gray-400">
                        {settings.visibleCategories.includes(category as AuctionCategory) ? 'Visible to users' : 'Hidden'}
                      </span>
                    </Label>
                    <Switch
                      id={`toggle-${category}`}
                      checked={settings.visibleCategories.includes(category as AuctionCategory)}
                      onCheckedChange={() => handleToggle(category)}
                    />
                  </div>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Global UI Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Global UI Settings</CardTitle>
            <CardDescription>Control major interface elements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Show Map Interface</Label>
                <p className="text-sm text-gray-500">Enable the map view toggle for users</p>
              </div>
              <Switch checked={true} disabled />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
