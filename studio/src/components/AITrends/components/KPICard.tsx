import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Card, CardContent } from '../../Card';

interface KPICardProps {
  title: string;
  value: string | number;
  trend?: number; // percentage change, positive or negative
  trendLabel?: string; // e.g. "vs last week"
  icon?: React.ElementType;
  className?: string;
  confidence?: number; // 0-1 confidence score
}

export function KPICard({ title, value, trend, trendLabel, icon: Icon, className, confidence }: KPICardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;
  const isNeutral = !trend || trend === 0;

  // Determine confidence level and styling
  const getConfidenceInfo = () => {
    if (confidence === undefined) return null;
    
    if (confidence >= 0.7) {
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        label: 'High Confidence',
        tooltip: `${Math.round(confidence * 100)}% confidence - Real data`,
      };
    } else if (confidence >= 0.5) {
      return {
        icon: AlertTriangle,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        label: 'Medium Confidence',
        tooltip: `${Math.round(confidence * 100)}% confidence - Partial data`,
      };
    } else {
      return {
        icon: Info,
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        label: 'Low Confidence',
        tooltip: `${Math.round(confidence * 100)}% confidence - Simulated data`,
      };
    }
  };

  const confidenceInfo = getConfidenceInfo();
  const isLowConfidence = confidence !== undefined && confidence < 0.5;

  return (
    <Card className={cn(
      "border-none shadow-sm hover:shadow-md transition-shadow duration-200 bg-white relative",
      isLowConfidence && "opacity-75",
      className
    )}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-500">{title}</h3>
            {confidenceInfo && (
              <div
                className={cn(
                  "p-1 rounded-full transition-all cursor-help group relative",
                  confidenceInfo.bgColor
                )}
                title={confidenceInfo.tooltip}
              >
                <confidenceInfo.icon className={cn("w-3 h-3", confidenceInfo.color)} />
                
                {/* Tooltip */}
                <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50 min-w-max">
                  <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
                    {confidenceInfo.tooltip}
                  </div>
                </div>
              </div>
            )}
          </div>
          {Icon && (
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
        
        <div className="flex items-end justify-between">
          <div className={cn(
            "text-2xl font-bold tracking-tight font-mono transition-colors",
            isLowConfidence ? "text-gray-400" : "text-gray-900"
          )}>
            {value}
          </div>
          
          {trend !== undefined && (
            <div className={cn(
              "flex items-center text-xs font-medium px-2 py-1 rounded-full",
              isPositive ? "text-green-700 bg-green-50" :
              isNegative ? "text-red-700 bg-red-50" :
              "text-gray-600 bg-gray-50"
            )}>
              {isPositive && <ArrowUpRight className="w-3 h-3 mr-1" />}
              {isNegative && <ArrowDownRight className="w-3 h-3 mr-1" />}
              {isNeutral && <Minus className="w-3 h-3 mr-1" />}
              <span>{Math.abs(trend)}%</span>
            </div>
          )}
        </div>
        
        {/* Confidence bar */}
        {confidence !== undefined && (
          <div className="mt-3">
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  confidence >= 0.7 ? "bg-green-500" :
                  confidence >= 0.5 ? "bg-yellow-500" :
                  "bg-gray-300"
                )}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {trendLabel && (
          <p className="text-xs text-gray-400 mt-2">{trendLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

