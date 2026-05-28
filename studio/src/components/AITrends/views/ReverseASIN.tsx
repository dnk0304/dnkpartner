import React from 'react';
import { Button } from '../../Button';
import { Search } from 'lucide-react';

export function ReverseASIN() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl">
            <Search className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">Reverse ASIN Lookup</h2>
              <span className="px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full border border-orange-300 flex items-center gap-1.5">
                <span>📦</span>
                Amazon
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Analyze competitor keywords by ASIN</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <input 
          type="text" 
          placeholder="Enter ASIN (e.g. B08XYZ1234)" 
          className="flex-1 h-10 px-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
        <Button>Analyze</Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Enter an ASIN above to see keyword data.</p>
      </div>
    </div>
  );
}

