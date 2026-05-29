import React, { useState, useEffect } from 'react';
import { Search, Map, Filter, ChevronDown, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { PROVINCES_BY_COMMUNITY, OFFICIAL_CATEGORIES } from '@/lib/constants';
import { UserTier, AuctionCategory } from '@/types';
import { apiFetch } from "@/lib/api-path";

interface SidebarProps {
  userTier: UserTier;
  setUserTier: (tier: UserTier) => void;
  selectedCategories: AuctionCategory[];
  setSelectedCategories: (categories: AuctionCategory[]) => void;
  selectedProvinces: string[];
  setSelectedProvinces: (provinces: string[]) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onUpgradeClick: () => void;
}

interface ProvinceStats {
  active: number;
  preAuction: number;
  finished: number;
  total: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userTier,
  setUserTier,
  selectedCategories,
  setSelectedCategories,
  selectedProvinces,
  setSelectedProvinces,
  searchTerm,
  setSearchTerm,
  onUpgradeClick
}) => {
  const [stats, setStats] = useState<Record<string, ProvinceStats>>({});

  // Fetch stats from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiFetch('/api/stats');
        const result = await response.json();
        
        if (result.success) {
          setStats(result.data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };
    
    fetchStats();
  }, []);

  const toggleCategory = (category: AuctionCategory) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const toggleProvince = (province: string) => {
    if (selectedProvinces.includes(province)) {
      setSelectedProvinces(selectedProvinces.filter(p => p !== province));
    } else {
      setSelectedProvinces([...selectedProvinces, province]);
    }
  };

  const getProvinceCounts = (province: string) => {
    return stats[province] || { active: 0, preAuction: 0, finished: 0, total: 0 };
  };

  return (
    <div className="flex h-full flex-col border-r bg-white">
      <div className="p-4 space-y-4">
        {/* Header / Brand */}
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white font-bold">S</span>
          </div>
          <span className="font-bold text-lg tracking-tight">SubastaPro</span>
        </div>

        {/* Upgrade Callout */}
        {userTier === 'free' && (
          <Button 
            onClick={onUpgradeClick}
            className="w-full bg-gradient-to-r from-amber-200 to-yellow-400 text-black hover:from-amber-300 hover:to-yellow-500 border-none shadow-md"
          >
            <Sparkles className="mr-2 h-4 w-4" /> Upgrade to Gold
          </Button>
        )}

        {/* Tier Switcher (Dev) */}
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Dev: User Tier</Label>
          <Select value={userTier} onValueChange={(v) => setUserTier(v as UserTier)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free Tier</SelectItem>
              <SelectItem value="gold">Gold Tier</SelectItem>
              <SelectItem value="diamond">Diamond Tier</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input 
            placeholder="Search auctions..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Categories */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Filter className="h-4 w-4" /> Categories
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Real Estate</p>
                <div className="space-y-2">
                  {OFFICIAL_CATEGORIES.REAL_ESTATE.map((cat) => (
                    <div key={cat} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`cat-${cat}`} 
                        checked={selectedCategories.includes(cat)}
                        onCheckedChange={() => toggleCategory(cat)}
                      />
                      <label htmlFor={`cat-${cat}`} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                        {cat}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Movable Assets</p>
                <div className="space-y-2">
                  {OFFICIAL_CATEGORIES.MOVABLE.map((cat) => (
                    <div key={cat} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`cat-${cat}`} 
                        checked={selectedCategories.includes(cat)}
                        onCheckedChange={() => toggleCategory(cat)}
                      />
                      <label htmlFor={`cat-${cat}`} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                        {cat}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Provinces */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Map className="h-4 w-4" /> Regions
            </h3>
            <Accordion type="multiple" className="w-full">
              {Object.entries(PROVINCES_BY_COMMUNITY).map(([community, provinces]) => (
                <AccordionItem key={community} value={community}>
                  <AccordionTrigger className="text-sm py-2 hover:no-underline hover:bg-gray-50 px-2 -mx-2 rounded-md">
                    {community}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-1 pl-1">
                      {provinces.map((province) => {
                        const counts = getProvinceCounts(province);
                        return (
                          <div key={province} className="flex items-center justify-between py-1 group cursor-pointer hover:bg-gray-50 px-2 rounded-md -mx-2" onClick={() => toggleProvince(province)}>
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                id={`prov-${province}`} 
                                checked={selectedProvinces.includes(province)}
                                onCheckedChange={() => toggleProvince(province)}
                              />
                              <label htmlFor={`prov-${province}`} className="text-sm cursor-pointer">
                                {province}
                              </label>
                            </div>
                            {(counts.total > 0 || province === 'Las Palmas') && (
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-gray-500">
                                <span className={counts.active > 0 ? "text-green-600 font-bold" : ""}>{counts.active}</span>
                                <span className="mx-0.5">/</span>
                                <span>{counts.total}</span>
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
