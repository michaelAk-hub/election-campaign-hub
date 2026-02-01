import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { 
  LayoutGrid, 
  Users, 
  MessageSquare, 
  Upload, 
  Settings,
  Database,
  UserCircle,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  const isAdmin = user?.role === 'admin';
  const isOrganotikos = isAdmin; // Admin has Organotikos access

  // Don't show layout for portal pages
  if (currentPageName?.includes('Portal') || currentPageName === 'Login') {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }

  const navigation = [
    { name: 'Πίνακας Ελέγχου', page: 'Dashboard', icon: LayoutGrid, show: true },
    { name: 'Δεδομένα', page: 'DataGrid', icon: Database, show: isOrganotikos },
    { name: 'Εισαγωγή', page: 'BootImport', icon: Upload, show: isAdmin },
    { name: 'Λογαριασμοί', page: 'Accounts', icon: Users, show: isOrganotikos },
    { name: 'Μηνύματα', page: 'Messages', icon: MessageSquare, show: isOrganotikos },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-900 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Εκλογική Πλατφόρμα</h1>
                <p className="text-xs text-slate-500">Campaign Data Platform</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              {navigation.filter(item => item.show).map(item => {
                const Icon = item.icon;
                const isActive = currentPageName === item.page;
                return (
                  <Link key={item.page} to={createPageUrl(item.page)}>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      className={isActive ? "bg-blue-900 text-white" : "text-slate-600 hover:text-slate-900"}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              {user && (
                <>
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                    <p className="text-xs text-slate-500">{user.role === 'admin' ? 'Διαχειριστής' : 'Χρήστης'}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleLogout}>
                    <LogOut className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-3 space-y-1">
              {navigation.filter(item => item.show).map(item => {
                const Icon = item.icon;
                const isActive = currentPageName === item.page;
                return (
                  <Link key={item.page} to={createPageUrl(item.page)}>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      className={`w-full justify-start ${isActive ? "bg-blue-900 text-white" : ""}`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-slate-500">
            © 2026 Εκλογική Πλατφόρμα - Campaign Data Platform v1.0
          </p>
        </div>
      </footer>
    </div>
  );
}