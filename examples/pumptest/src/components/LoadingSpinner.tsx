/**
 * Loading and error state components.
 */

import { Loader2, AlertTriangle } from "lucide-react";

export function LoadingSpinner({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
      <Loader2 size={32} className="animate-spin text-accent-purple" />
      <span className="mt-3 text-sm">{message}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
      <AlertTriangle size={32} className="text-accent-red" />
      <span className="mt-3 text-sm">{message}</span>
      <span className="mt-1 text-xs">Make sure the Uho API is running</span>
    </div>
  );
}
