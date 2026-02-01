import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function LoadingSpinner({ className, text = "Φόρτωση..." }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
      <p className="text-slate-500 text-sm">{text}</p>
    </div>
  );
}