import React from 'react';
import { cn } from "@/lib/utils";

export default function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  trendUp,
  className,
  iconClassName 
}) {
  return (
    <div className={cn(
      "bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all duration-300",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              "text-sm font-medium",
              trendUp ? "text-emerald-600" : "text-red-500"
            )}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "p-3 rounded-xl bg-slate-100",
            iconClassName
          )}>
            <Icon className="h-6 w-6 text-slate-600" />
          </div>
        )}
      </div>
    </div>
  );
}