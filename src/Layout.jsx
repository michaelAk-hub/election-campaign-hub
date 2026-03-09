import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import NotificationCenter from './components/notifications/NotificationCenter';
import {
    LayoutDashboard,
    Users,
    UserPlus,
    FileSpreadsheet,
    MessageSquare,
    Settings,
    LogOut,
    Menu,
    X,
    Database,
    GitCompare,
    Vote,
    UserCog,
    Search as SearchIcon,
    AlertTriangle,
    Bell
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { name: 'Πίνακας Ελέγχου', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Εγγραφές', icon: Database, page: 'Records' },
  { name: 'Πλέγμα Δεδομένων', icon: Database, page: 'DataGrid' },
  { name: 'Αποθηκευμένα Ερωτήματα', icon: SearchIcon, page: 'SavedQueries' },
  { name: 'Προβλέψεις', icon: GitCompare, page: 'Predictions' },
  { name: 'Σύγκριση & Συγχώνευση', icon: GitCompare, page: 'CompareMerge' },
  { name: 'Χρεωστικά', icon: UserPlus, page: 'ChreosiAccounts' },
  { name: 'Κανάλι', icon: Vote, page: 'KanaliAccounts' },
  { name: 'Αποτυχημένες Ψήφοι', icon: FileSpreadsheet, page: 'NotFoundVoters' },
  { name: 'Στείλε Μήνυμα', icon: MessageSquare, page: 'SendMessage' },
  { name: 'SMS Χρεωστικών', icon: MessageSquare, page: 'ChreosiSmsCredentials' },
  { name: 'Οργανωτικοί (χρήστες)', icon: UserCog, page: 'UserManagement' },
  { name: 'Προτιμήσεις Ειδοποιήσεων', icon: Settings, page: 'NotificationPreferences' },
  { name: '🔐 Πύλη Χρηστών', icon: Users, page: 'PortalLogin', divider: true },
];

const portalPages = ['Portal', 'PortalLogin', 'AdminLogin', 'MfaVerify'];

// Inactivity timeout constants (in milliseconds)
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_AT_MS = 13 * 60 * 1000; // 13 minutes
const HEARTBEAT_THROTTLE_MS = 45 * 1000; // 45 seconds

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(120);
  
  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const sessionToken = localStorage.getItem('app_session_token');
        if (sessionToken) {
          const { data } = await base44.functions.invoke('validateAppSession', {
            session_token: sessionToken
          });

          if (data.valid) {
            setUser({ 
              ...data.user, 
              full_name: `${data.user.name} ${data.user.surname}`,
              email: data.user.email,
              role: data.user.role === 'ADMIN' ? 'admin' : 'user',
              isAppUser: true
            });
            setLoading(false);
            return;
          } else {
            localStorage.removeItem('app_session_token');
            localStorage.removeItem('app_user');
            if (data.force_logout || data.reason === 'idle_timeout') {
              window.location.href = createPageUrl('AdminLogin');
              return;
            }
          }
        }
      } catch (e) {
        console.error('Session validation error:', e);
        localStorage.removeItem('app_session_token');
        localStorage.removeItem('app_user');
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  // Activity-based heartbeat - only send when user is active
  const sendHeartbeat = useCallback(async () => {
    const sessionToken = localStorage.getItem('app_session_token');
    if (!sessionToken) return;

    try {
      await base44.functions.invoke('sessionHeartbeat', {
        session_token: sessionToken
      });
      lastHeartbeatRef.current = Date.now();
    } catch (e) {
      console.error('Heartbeat failed:', e);
    }
  }, []);

  // Handle user activity - reset idle timer and send heartbeat if needed
  const handleActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;

    // Reset idle and warning timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setShowTimeoutWarning(false);

    // Send heartbeat if enough time has passed (throttle)
    if (now - lastHeartbeatRef.current >= HEARTBEAT_THROTTLE_MS) {
      sendHeartbeat();
    }

    // Set warning timer (13 minutes)
    warningTimerRef.current = setTimeout(() => {
      setShowTimeoutWarning(true);
      setTimeoutCountdown(120);
      
      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        setTimeoutCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, WARNING_AT_MS);

    // Set idle timeout (15 minutes)
    idleTimerRef.current = setTimeout(() => {
      handleIdleLogout();
    }, IDLE_TIMEOUT_MS);
  }, [sendHeartbeat]);

  // Handle logout due to inactivity
  const handleIdleLogout = async () => {
    const sessionToken = localStorage.getItem('app_session_token');
    if (sessionToken) {
      await base44.functions.invoke('appLogout', { session_token: sessionToken });
    }
    localStorage.removeItem('app_session_token');
    localStorage.removeItem('app_user');
    window.location.href = createPageUrl('AdminLogin');
  };

  // Handle "Stay logged in" button
  const handleStayLoggedIn = () => {
    setShowTimeoutWarning(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    sendHeartbeat(); // Send immediate heartbeat
    handleActivity(); // Reset timers
  };

  // Set up activity listeners
  useEffect(() => {
    if (!user) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    
    // Throttle activity handler to avoid excessive calls
    let activityTimeout = null;
    const throttledActivity = () => {
      if (!activityTimeout) {
        activityTimeout = setTimeout(() => {
          handleActivity();
          activityTimeout = null;
        }, 1000);
      }
    };

    events.forEach(event => {
      document.addEventListener(event, throttledActivity, { passive: true });
    });

    // Initial activity setup
    handleActivity();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, throttledActivity);
      });
      if (activityTimeout) clearTimeout(activityTimeout);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [user, handleActivity]);

  // Portal pages have their own layout
  if (portalPages.includes(currentPageName)) {
      return <>{children}</>;
  }

  // Block KANALI and CHREOSI from accessing UserManagement
  if (currentPageName === 'UserManagement') {
      // Check if the user is trying to access from a portal session (not admin session)
      const portalToken = localStorage.getItem('portal_session_token');
      if (portalToken && !user) {
          return (
              <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                  <div className="text-center">
                      <h1 className="text-2xl font-bold text-slate-900 mb-2">Δεν επιτρέπεται η πρόσβαση</h1>
                      <p className="text-slate-600 mb-4">Μόνο διαχειριστές και οργανωτικοί έχουν πρόσβαση σε αυτή τη σελίδα.</p>
                      <Button onClick={() => window.location.href = createPageUrl('Portal')}>
                          Επιστροφή
                      </Button>
                  </div>
              </div>
          );
      }
  }

  // Admin/Organotikos layout
  const isAdmin = user?.role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    // Redirect to AdminLogin for unauthenticated users
    if (currentPageName !== 'AdminLogin') {
      window.location.href = createPageUrl('AdminLogin');
      return null;
    }
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        body { overscroll-behavior: none; }
        button, [role="button"], svg { user-select: none; -webkit-user-select: none; }
      `}</style>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 text-blue-600" />
          <span className="font-semibold">Εκλογές</span>
        </div>
        {user && <NotificationCenter userType={user.role === 'admin' ? 'admin' : 'organotikos'} />}
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transition-transform duration-300",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <Vote className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900">Εκλογές</span>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">2026</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          {adminNavItems.map(item => (
            <React.Fragment key={item.page}>
              {item.divider && <div className="border-t border-slate-200 my-2" />}
              <Link
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  currentPageName === item.page
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            </React.Fragment>
          ))}
        </nav>

        {/* User */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-100 bg-white">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center">
              <span className="text-sm font-medium text-slate-600">
                {user.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user.full_name || user.email}
              </p>
              <p className="text-xs text-slate-500">
                {isAdmin ? 'Διαχειριστής' : 'Οργανωτικός'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <NotificationCenter userType={isAdmin ? 'admin' : 'organotikos'} />
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  const sessionToken = localStorage.getItem('app_session_token');
                  if (sessionToken) {
                    await base44.functions.invoke('appLogout', { session_token: sessionToken });
                  }
                  localStorage.removeItem('app_session_token');
                  localStorage.removeItem('app_user');
                  window.location.href = createPageUrl('AdminLogin');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen pb-16 lg:pb-0">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          { label: 'Πίνακας', icon: LayoutDashboard, page: 'Dashboard' },
          { label: 'Εγγραφές', icon: Database, page: 'Records' },
          { label: 'Ειδοποιήσεις', icon: Bell, page: 'NotificationPreferences' },
        ].map(item => (
          <Link
            key={item.page}
            to={createPageUrl(item.page)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors",
              currentPageName === item.page
                ? "text-blue-600"
                : "text-slate-500"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Timeout Warning Modal */}
      <Dialog open={showTimeoutWarning} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" hideClose>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <DialogTitle className="text-xl">Προειδοποίηση Αδράνειας</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Η συνεδρία σας θα λήξει σύντομα λόγω αδράνειας. Θα αποσυνδεθείτε αυτόματα σε:
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {Math.floor(timeoutCountdown / 60)}:{String(timeoutCountdown % 60).padStart(2, '0')}
              </div>
              <div className="text-sm text-slate-500">λεπτά</div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleIdleLogout}
              className="w-full sm:w-auto"
            >
              Αποσύνδεση Τώρα
            </Button>
            <Button
              onClick={handleStayLoggedIn}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              Συνέχεια Σύνδεσης
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}