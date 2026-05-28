import React from 'react';
import { cn } from '../lib/utils';
import { SOURCE_COLORS, type SourceType } from '../constants/themeColors';

interface SourceBadgeProps {
  type: SourceType;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SourceBadge({ type, className, size = 'md' }: SourceBadgeProps) {
  const config = SOURCE_COLORS[type];
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-xs gap-1.5',
    lg: 'px-4 py-1.5 text-sm gap-2',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full border',
        `bg-${config.bg} text-${config.text} border-${config.border}`,
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: `var(--${config.bg})`,
        color: `var(--${config.text})`,
        borderColor: `var(--${config.border})`,
      }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

