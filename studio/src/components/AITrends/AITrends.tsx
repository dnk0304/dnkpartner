import React, { useState, useEffect } from 'react';
import { AITrendsLayout } from './layout/AITrendsLayout';
import { KeywordExplorer } from './views/KeywordExplorer';
import { Dashboard } from './views/Dashboard';
import { RankTracker } from './views/RankTracker';
import { ReverseASIN } from './views/ReverseASIN';
import { TrendingKeywords } from './views/TrendingKeywords';
import { OpportunitiesView } from './views/OpportunitiesView';
import { ExplodingTrends } from './views/ExplodingTrends';
import { CategoryExplorer } from './views/CategoryExplorer';
import { DataSources } from './views/DataSources';
import { MonitoredCategories } from './views/MonitoredCategories';
import { StorageAnalytics } from './views/StorageAnalytics';
import { WelcomeModal } from './components/WelcomeModal';
import { AITrendsProvider } from '../../contexts/AITrendsContext';

export function AITrends() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [activeSubItem, setActiveSubItem] = useState('');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Check if user has seen welcome modal
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('ai-trends-welcome-seen');
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true);
    }
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcomeModal(false);
    localStorage.setItem('ai-trends-welcome-seen', 'true');
  };

  const handleNavigate = (sectionId: string, subItemId?: string) => {
    setActiveSection(sectionId);
    if (subItemId) {
      setActiveSubItem(subItemId);
    } else {
      setActiveSubItem('');
    }
  };

  const renderContent = () => {
    // Dashboard
    if (activeSection === 'dashboard') {
      return <Dashboard />;
    }

    // Storage Analytics
    if (activeSection === 'storage') {
      return <StorageAnalytics />;
    }

    // Keyword Research
    if (activeSection === 'keyword-research') {
      if (activeSubItem === 'explorer') return <KeywordExplorer />;
      if (activeSubItem === 'rank-tracker') return <RankTracker />;
      if (activeSubItem === 'gaps') return <PlaceholderView title="Keyword Gaps" description="Identify keywords your competitors rank for but you don't." />;
    }

    // ASIN Intelligence
    if (activeSection === 'asin-intelligence') {
      if (activeSubItem === 'reverse-asin') return <ReverseASIN />;
      if (activeSubItem === 'competitor-map') return <PlaceholderView title="Competitor Map" description="Visualize the competitive landscape." />;
    }

    // Trends & History - Now shows Trending Keywords
    if (activeSection === 'trends') {
      return <TrendingKeywords />;
    }

    // Trending Keywords section
    if (activeSection === 'trending') {
      if (activeSubItem === 'discover') return <TrendingKeywords />;
      if (activeSubItem === 'opportunities') return <OpportunitiesView />;
      if (activeSubItem === 'monitored') return <MonitoredCategories />;
      return <TrendingKeywords />;
    }

    // Exploding Trends section
    if (activeSection === 'exploding') {
      if (activeSubItem === 'discover') return <ExplodingTrends />;
      if (activeSubItem === 'by-category') return <CategoryExplorer />;
      if (activeSubItem === 'sources') return <DataSources />;
      return <ExplodingTrends />;
    }
    
    // Default fallback
    return <KeywordExplorer />;
  };

  return (
    <AITrendsProvider>
      <WelcomeModal isOpen={showWelcomeModal} onClose={handleCloseWelcome} />
      <AITrendsLayout
        activeSection={activeSection}
        activeSubItem={activeSubItem}
        onNavigate={handleNavigate}
      >
        {renderContent()}
      </AITrendsLayout>
    </AITrendsProvider>
  );
}

function PlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-gray-500">{description}</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <div className="text-gray-400 mb-2">Construction in progress</div>
        <p className="text-sm text-gray-500">This feature is coming in the next update.</p>
      </div>
    </div>
  );
}
