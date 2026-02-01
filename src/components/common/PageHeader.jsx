import React from 'react';
import { cn } from "@/lib/utils";

export default function PageHeader({ 
  title, 
  subtitle, 
  actions, 
  className,
  icon: Icon 
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8", className)}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && (
            <p className="text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}