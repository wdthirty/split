// Pulsing placeholder block. Pass sizing/shape via className (h-*, w-*, rounded-*).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-700/70 ${className}`} />;
}
