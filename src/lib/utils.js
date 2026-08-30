import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Filename-safe version of a table/name that KEEPS Greek letters — only strips
// characters illegal in filenames and turns whitespace into underscores.
// (A \w-based sanitizer would turn Greek names into rows of underscores.)
export const safeFileName = (s, fallback = 'export') => {
  const cleaned = String(s ?? '').trim()
    .replace(/[\\/:*?"<>|]+/g, '_') // strip characters illegal in filenames
    .replace(/\s+/g, '_')           // spaces → underscore
    .slice(0, 100);
  return cleaned || fallback;
};
