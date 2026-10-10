import { cn } from '@/utils/helpers';

export function Logo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 select-none', className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400 via-primary to-primary-700 shadow-glow-primary">
        <span className="font-black leading-none text-primary-foreground">C</span>
        <span className="absolute -inset-0.5 rounded-lg bg-primary/30 blur-sm -z-10" aria-hidden />
      </span>
      {!iconOnly && (
        <span className="text-[1.05rem] font-extrabold tracking-tight">
          Crypto<span className="text-primary">Gaming</span>
        </span>
      )}
    </span>
  );
}
