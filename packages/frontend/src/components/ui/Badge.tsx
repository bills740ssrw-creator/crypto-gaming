'use client';

import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils/helpers';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'gold' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', dot, children, ...props }, ref) => {
    const variants = {
      default: 'bg-secondary text-secondary-foreground',
      success: 'bg-primary/15 text-primary',
      warning: 'bg-gold-500/15 text-gold-400',
      error: 'bg-destructive/15 text-destructive',
      info: 'bg-sky-500/15 text-sky-400',
      gold: 'bg-gold-500/15 text-gold-400',
      outline: 'border border-border text-muted-foreground',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
      lg: 'px-3 py-1.5 text-base',
    };

    const dotColors = {
      default: 'bg-muted-foreground',
      success: 'bg-primary',
      warning: 'bg-gold-500',
      error: 'bg-destructive',
      info: 'bg-sky-400',
      gold: 'bg-gold-500',
      outline: 'bg-muted-foreground',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 font-medium rounded-full',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';