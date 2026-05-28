import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Search, Database, TrendingUp, History, Box, ChevronDown, ChevronRight, BarChart2, Map, ArrowLeft, Flame, Sparkles, Eye, Rocket, Layers, Globe, ShoppingBag, Info, HardDrive } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Tooltip } from '../../Tooltip';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  subItems?: { id: string; label: string }[];
  badge?: 'amazon' | 'multi-platform';
}

interface NavSection {
  header?: {
    label: string;
    icon: React.ElementType;
    color: string;
    tooltip?: string;
  };
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'storage', label: 'Storage Analytics', icon: HardDrive }
    ]
  },
  {
    header: {
      label: 'Multi-Platform Insights',
      icon: Globe,
      color: 'emerald',
      tooltip: 'Discover what\'s trending across Reddit, TikTok, Pinterest, Etsy, eBay, Google, and more — find viral topics before they hit Amazon'
    },
    items: [
      {
        id: 'exploding',
        label: 'Exploding Trends',
        icon: Rocket,
        badge: 'multi-platform',
        subItems: [
          { id: 'discover', label: 'Discover' },
          { id: 'by-category', label: 'By Category' },
          { id: 'sources', label: 'Data Sources' },
        ]
      }
    ]
  },
  {
    header: {
      label: 'Amazon Marketplace',
      icon: ShoppingBag,
      color: 'orange',
      tooltip: 'Research keywords, track rankings, analyze competitors (ASINs), and find high-opportunity products specifically for Amazon'
    },
    items: [
      {
        id: 'keyword-research',
        label: 'Keyword Research',
        icon: Search,
        badge: 'amazon',
        subItems: [
          { id: 'explorer', label: 'Explorer' },
          { id: 'rank-tracker', label: 'Rank Tracker' },
          { id: 'gaps', label: 'Gaps' },
        ]
      },
      {
        id: 'trending',
        label: 'Trending Keywords',
        icon: Flame,
        badge: 'amazon',
        subItems: [
          { id: 'discover', label: 'Discover' },
          { id: 'opportunities', label: 'Opportunities' },
          { id: 'monitored', label: 'Monitored Categories' },
        ]
      },
      {
        id: 'asin-intelligence',
        label: 'ASIN Intelligence',
        icon: Box,
        badge: 'amazon',
        subItems: [
          { id: 'reverse-asin', label: 'Reverse ASIN' },
          { id: 'competitor-map', label: 'Competitor Map' },
        ]
      },
      { id: 'trends', label: 'Trends & History', icon: TrendingUp, badge: 'amazon' }
    ]
  }
];

export interface TrendsSidebarProps {
  className?: string;
  activeSection: string;
  activeSubItem: string;
  onNavigate: (sectionId: string, subItemId?: string) => void;
}

export function TrendsSidebar({ className, activeSection, activeSubItem, onNavigate }: TrendsSidebarProps) {
  const navigate = useNavigate();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'exploding': true,
    'keyword-research': true,
    'trending': true,
    'asin-intelligence': true,
  });

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Get badge color
  const getBadgeColor = (badge: 'amazon' | 'multi-platform') => {
    if (badge === 'amazon') {
      return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    }
    return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  };

  // Get section header color
  const getHeaderColor = (color: string) => {
    if (color === 'orange') {
      return 'text-orange-400 bg-orange-500/10';
    }
    return 'text-emerald-400 bg-emerald-500/10';
  };

  return (
    <aside className={cn("w-[260px] bg-[#1a1b1e] text-gray-300 flex flex-col h-full border-r border-gray-800", className)}>
      <div className="h-16 flex items-center px-6 border-b border-gray-800">
        <span className="text-xl font-bold text-white tracking-tight">AI Trends</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-4">
          {navSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {/* Section Header */}
              {section.header && (
                <div className={cn(
                  "mx-3 mb-2 px-3 py-2 rounded-lg flex items-center gap-2 justify-between group",
                  getHeaderColor(section.header.color)
                )}>
                  <div className="flex items-center gap-2">
                    <section.header.icon className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {section.header.label}
                    </span>
                  </div>
                  {section.header.tooltip && (
                    <Tooltip content={section.header.tooltip} position="right">
                      <Info className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity cursor-help" />
                    </Tooltip>
                  )}
                </div>
              )}

              {/* Section Items */}
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.id}>
                    {item.subItems ? (
                      <div>
                        <button
                          onClick={() => toggleSection(item.id)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors",
                            activeSection === item.id && "text-white"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.badge && (
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                getBadgeColor(item.badge)
                              )}>
                                {item.badge === 'amazon' ? '📦' : '🌍'}
                              </span>
                            )}
                            {expandedSections[item.id] ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                          </div>
                        </button>
                        
                        {expandedSections[item.id] && (
                          <ul className="mt-1 mb-2 space-y-0.5">
                            {item.subItems.map((sub) => (
                              <li key={sub.id}>
                                <button
                                  onClick={() => onNavigate(item.id, sub.id)}
                                  className={cn(
                                    "w-full flex items-center pl-11 pr-4 py-1.5 text-sm hover:text-white transition-colors relative",
                                    activeSection === item.id && activeSubItem === sub.id 
                                      ? item.badge === 'amazon'
                                        ? "text-orange-400 bg-orange-500/10 border-l-2 border-orange-500"
                                        : "text-emerald-400 bg-emerald-500/10 border-l-2 border-emerald-500"
                                      : "text-gray-400 border-l-2 border-transparent"
                                  )}
                                >
                                  {sub.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors border-l-2",
                          activeSection === item.id 
                            ? item.badge === 'amazon'
                              ? "text-orange-400 bg-orange-500/10 border-orange-500"
                              : "text-indigo-400 bg-indigo-500/10 border-indigo-500"
                            : "text-gray-300 border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold",
                            getBadgeColor(item.badge)
                          )}>
                            {item.badge === 'amazon' ? '📦' : '🌍'}
                          </span>
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-gray-800 space-y-3">
        <button
          onClick={() => navigate('/')}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to DNK Studio</span>
        </button>
        
        <div className="text-xs text-gray-500">
          v1.0.0 • Data updated 5m ago
        </div>
      </div>
    </aside>
  );
}
