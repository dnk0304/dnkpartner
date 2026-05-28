import React from 'react';
import { Button } from '../../Button';
import { Search, BarChart3 } from 'lucide-react';

export function RankTracker() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">Rank Tracker</h2>
              <span className="px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full border border-orange-300 flex items-center gap-1.5">
                <span>📦</span>
                Amazon
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Monitor your keyword rankings over time on Amazon</p>
          </div>
        </div>
        <Button>
          <Search className="w-4 h-4 mr-2" />
          Add Keywords
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500 mb-4">Rank tracking data visualization would go here.</p>
        <div className="h-48 bg-gray-50 rounded border border-dashed border-gray-200 flex items-center justify-center">
          Chart Placeholder
        </div>
      </div>
    </div>
  );
}

