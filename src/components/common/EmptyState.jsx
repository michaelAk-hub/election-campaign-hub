import React from 'react';
import { cn } from "@/lib/utils";

export default function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className 
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-16 px-4 text-center",
      className
    )}>
      {Icon && (
        <div className="p-4 rounded-full bg-slate-100 mb-4">
          <Icon className="h-8 w-8 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      {description && (
        <p className="text-slate-500 max-w-md mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}