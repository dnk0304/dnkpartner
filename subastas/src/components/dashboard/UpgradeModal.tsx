'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Crown, Zap, Shield, Loader2, CreditCard } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();

  const handleCheckout = async (tier: 'gold' | 'diamond') => {
    try {
      setLoading(true);
      // Mock checkout - in production this goes to Stripe
      setTimeout(() => {
        setLoading(false);
        alert('Redirecting to secure checkout...');
      }, 1000);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-white border-0 rounded-3xl shadow-2xl">
        
        {/* Header Section */}
        <div className="text-center pt-12 pb-8 px-6 bg-gray-50/50">
          <Badge variant="outline" className="mb-4 px-3 py-1 border-gray-200 bg-white text-gray-600 font-medium rounded-full text-xs uppercase tracking-wider">
            Choose your plan
          </Badge>
          <DialogTitle className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
            Aprovecha todo el potencial de SubastasActivas
          </DialogTitle>
          <DialogDescription className="text-lg text-gray-500 max-w-2xl mx-auto">
            Start with a 15-day free trial. Cancel anytime.
          </DialogDescription>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-gray-100 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          
          {/* 1. Free Tier */}
          <div className="p-8 flex flex-col h-full hover:bg-gray-50/50 transition-colors">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Browser</h3>
              <p className="text-sm text-gray-500">For casual browsing</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-gray-900">€0</span>
              <span className="text-gray-400">/mo</span>
            </div>
            <Button variant="outline" className="w-full rounded-xl h-12 border-gray-200 font-medium text-gray-600 mb-8" disabled>
              Current Plan
            </Button>
            <div className="space-y-4 flex-1">
              <FeatureItem text="Browse active auctions" />
              <FeatureItem text="Basic search filters" />
              <FeatureItem text="Map view (limited)" />
              <FeatureItem text="Notifications" included={false} />
              <FeatureItem text="Pre-auction access" included={false} />
            </div>
          </div>

          {/* 2. Gold Tier (Basic) */}
          <div className="p-8 flex flex-col h-full bg-white relative z-10 shadow-xl shadow-gray-200/50 md:scale-105 md:-mt-4 md:mb-4 md:rounded-2xl md:border border-gray-100">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Badge className="bg-[var(--color-surface)] border-2 border-[var(--color-ink-primary)] text-[var(--color-ink-primary)] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                Most Popular
              </Badge>
            </div>
            <div className="mb-6 mt-2">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                <h3 className="text-xl font-bold text-gray-900">Bidder</h3>
              </div>
              <p className="text-sm text-gray-500">For active participants</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-gray-900">€29</span>
              <span className="text-gray-400">/mo</span>
            </div>
            <Button 
              onClick={() => handleCheckout('gold')}
              className="w-full rounded-xl h-12 bg-[var(--color-surface)] border-2 border-[var(--color-ink-primary)] hover:bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)] font-semibold mb-4 shadow-sm"
            >
              Start 15-Day Free Trial
            </Button>
            <p className="text-xs text-center text-gray-400 mb-8">
              +15 extra days free with credit card
            </p>
            <div className="space-y-4 flex-1">
              <FeatureItem text="Everything in Browser" />
              <FeatureItem text="Real-time email alerts" highlighted />
              <FeatureItem text="Unlimited map access" />
              <FeatureItem text="Advanced filtering" />
              <FeatureItem text="Pre-auction access" included={false} />
            </div>
          </div>

          {/* 3. Diamond Tier (Premium) */}
          <div className="p-8 flex flex-col h-full hover:bg-gray-50/50 transition-colors">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-5 h-5 text-purple-500 fill-purple-500" />
                <h3 className="text-xl font-bold text-gray-900">Investor</h3>
              </div>
              <p className="text-sm text-gray-500">For professionals</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-gray-900">€79</span>
              <span className="text-gray-400">/mo</span>
            </div>
            <Button 
              onClick={() => handleCheckout('diamond')}
              variant="outline"
              className="w-full rounded-xl h-12 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300 font-medium mb-4"
            >
              Start 15-Day Free Trial
            </Button>
            <p className="text-xs text-center text-gray-400 mb-8">
              Requires payment method
            </p>
            <div className="space-y-4 flex-1">
              <FeatureItem text="Everything in Bidder" />
              <FeatureItem text="Pre-Auction Access (TEJU)" highlighted color="text-purple-600" />
              <FeatureItem text="Debt Analysis Reports" />
              <FeatureItem text="Priority Support" />
              <FeatureItem text="API Access" />
            </div>
          </div>

        </div>

        {/* Footer Trust Signals */}
        <div className="bg-gray-50 p-6 flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-gray-500 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Secure SSL Payment</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            <span>Cancel anytime</span>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
};

const FeatureItem = ({ text, included = true, highlighted = false, color = "text-gray-700" }: { text: string, included?: boolean, highlighted?: boolean, color?: string }) => (
  <div className="flex items-start gap-3">
    {included ? (
      <div className={`mt-0.5 rounded-full p-0.5 ${highlighted ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
        <Check className="w-3 h-3" />
      </div>
    ) : (
      <div className="mt-0.5 rounded-full p-0.5 bg-gray-50 text-gray-300">
        <X className="w-3 h-3" />
      </div>
    )}
    <span className={`text-sm ${included ? color : 'text-gray-400'} ${highlighted ? 'font-medium' : ''}`}>
      {text}
    </span>
  </div>
);
