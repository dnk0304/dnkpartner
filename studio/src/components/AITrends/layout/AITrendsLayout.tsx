import React, { ReactNode } from 'react';
import { TrendsSidebar } from './TrendsSidebar';
import { TrendsHeader } from './TrendsHeader';
import { cn } from '../../../lib/utils';

interface AITrendsLayoutProps {
  children: ReactNode;
  className?: string;
  activeSection: string;
  activeSubItem: string;
  onNavigate: (sectionId: string, subItemId?: string) => void;
}

export function AITrendsLayout({ children, className, activeSection, activeSubItem, onNavigate }: AITrendsLayoutProps) {
  return (
    <div className={cn("ai-trends-layout flex h-screen bg-[#F8F9FB] font-sans text-slate-900 relative z-10", className)}>
      <TrendsSidebar 
        activeSection={activeSection} 
        activeSubItem={activeSubItem} 
        onNavigate={onNavigate} 
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TrendsHeader />
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
