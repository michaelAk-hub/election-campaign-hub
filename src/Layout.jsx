import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
    ChevronLeft,
    Trash2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { name: 'Πίνακας Ελέγχου', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Εγγραφές', icon: Database, page: 'Records' },
  { name: 'Αποθηκευμένα Ερωτήματα', icon: SearchIcon, page: 'SavedQueries' },
  { name: 'Προβλέψεις', icon: GitCompare, page: 'Predictions' },
  { name: 'Σύγκριση & Συγχώνευση', icon: GitCompare, page: 'CompareMerge' },
  { name: 'Χρεωστικά', icon: UserPlus, page: 'ChreosiAccounts' },
  { name: 'Κανάλι', icon: Vote, page: 'KanaliAccounts' },
  { name: 'Αποτυχημένες Ψήφοι', icon: FileSpreadsheet, page: 'NotFoundVoters' },
  { name: 'Στείλε Notification', icon: MessageSquare, page: 'SendMessage' },
  { name: 'Στείλε SMS', icon: MessageSquare, page: 'ChreosiSmsCredentials' },
  { name: 'Οργανωτικοί (χρήστες)', icon: UserCog, page: 'UserManagement' },
  { name: 'Προτιμήσεις Ειδοποιήσεων', icon: Settings, page: 'NotificationPreferences' },
  { name: '🔐 Πύλη Χρηστών', icon: Users, page: 'PortalLogin', divider: true },
];

const portalPages = ['Portal', 'PortalLogin', 'AdminLogin', 'MfaVerify'];
const TAB_ROOT_PAGES = ['Dashboard', 'Records', 'NotificationPreferences'];

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_AT_MS = 13 * 60 * 1000;
const HEARTBEAT_THROTTLE_MS = 45 * 1000;

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(120);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const historyStackRef = useRef([]);
  const tabScrollRef = useRef({});

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

  useEffect(() => {
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    };
    applyTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, []);

  useEffect(() => {
    historyStackRef.current = [...historyStackRef.current, location.pathname];
    if (historyStackRef.current.length > 20) {
      historyStackRef.current = historyStackRef.current.slice(-20);
    }
  }, [location.pathname]);

  const sendHeartbeat = useCallback(async () => {
    const sessionToken = localStorage.getItem('app_session_token');
    if (!sessionToken) return;
    try {
      await base44.functions.invoke('sessionHeartbeat', { session_token: sessionToken });
      lastHeartbeatRef.current = Date.now();
    } catch (e) {
      console.error('Heartbeat failed:', e);
    }
  }, []);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setShowTimeoutWarning(false);
    if (now - lastHeartbeatRef.current >= HEARTBEAT_THROTTLE_MS) sendHeartbeat();

    warningTimerRef.current = setTimeout(() => {
      setShowTimeoutWarning(true);
      setTimeoutCountdown(120);
      countdownIntervalRef.current = setInterval(() => {
        setTimeoutCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownIntervalRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    }, WARNING_AT_MS);

    idleTimerRef.current = setTimeout(() => { handleIdleLogout(); }, IDLE_TIMEOUT_MS);
  }, [sendHeartbeat]);

  const handleIdleLogout = async () => {
    const sessionToken = localStorage.getItem('app_session_token');
    if (sessionToken) await base44.functions.invoke('appLogout', { session_token: sessionToken });
    localStorage.removeItem('app_session_token');
    localStorage.removeItem('app_user');
    window.location.href = createPageUrl('AdminLogin');
  };

  const handleStayLoggedIn = () => {
    setShowTimeoutWarning(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    sendHeartbeat();
    handleActivity();
  };

  useEffect(() => {
    if (!user) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    let activityTimeout = null;
    const throttledActivity = () => {
      if (!activityTimeout) {
        activityTimeout = setTimeout(() => { handleActivity(); activityTimeout = null; }, 1000);
      }
    };
    events.forEach(e => document.addEventListener(e, throttledActivity, { passive: true }));
    handleActivity();
    return () => {
      events.forEach(e => document.removeEventListener(e, throttledActivity));
      if (activityTimeout) clearTimeout(activityTimeout);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [user, handleActivity]);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    const sessionToken = localStorage.getItem('app_session_token');
    await base44.functions.invoke('deleteAppAccount', { session_token: sessionToken });
    localStorage.removeItem('app_session_token');
    localStorage.removeItem('app_user');
    window.location.href = createPageUrl('AdminLogin');
  };

  const handleLogout = async () => {
    const sessionToken = localStorage.getItem('app_session_token');
    if (sessionToken) await base44.functions.invoke('appLogout', { session_token: sessionToken });
    localStorage.removeItem('app_session_token');
    localStorage.removeItem('app_user');
    window.location.href = createPageUrl('AdminLogin');
  };

  const isDeepPage = !TAB_ROOT_PAGES.includes(currentPageName) && historyStackRef.current.length > 1;

  if (portalPages.includes(currentPageName)) return <>{children}</>;

  if (currentPageName === 'UserManagement') {
    const portalToken = localStorage.getItem('portal_session_token');
    if (portalToken && !user) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Δεν επιτρέπεται η πρόσβαση</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-4">Μόνο διαχειριστές και οργανωτικοί έχουν πρόσβαση σε αυτή τη σελίδα.</p>
            <Button onClick={() => window.location.href = createPageUrl('Portal')}>Επιστροφή</Button>
          </div>
        </div>
      );
    }
  }

  const isAdmin = user?.role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    if (currentPageName !== 'AdminLogin') {
      window.location.href = createPageUrl('AdminLogin');
      return null;
    }
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <style>{`
        body { overscroll-behavior: none; }
        button, [role="button"], svg { user-select: none; -webkit-user-select: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── DESKTOP: single-row fixed top navbar with integrated menu (lg+) ── */}
      <header className="hidden lg:flex items-center gap-3 fixed top-0 left-0 right-0 z-40 h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        {/* Branding */}
        <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-md flex items-center justify-center">
            <Vote className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight hidden xl:block">
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Εκλογές</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider ml-1.5">2026</span>
          </div>
        </Link>

        <div className="w-px self-stretch bg-slate-200 dark:bg-slate-700 my-3 shrink-0" />

        {/* Nav links — inline, horizontally scrollable if they overflow */}
        <nav className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {adminNavItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <React.Fragment key={item.page}>
                {item.divider && (
                  <div className="w-px self-stretch bg-slate-200 dark:bg-slate-700 mx-1 my-2 shrink-0" />
                )}
                <Link
                  to={createPageUrl(item.page)}
                  title={item.name}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all shrink-0",
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              </React.Fragment>
            );
          })}
        </nav>

        {/* User info + actions */}
        <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-slate-200 dark:border-slate-700">
          <div className="text-right hidden xl:block">
            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-tight max-w-[140px] truncate">
              {user.full_name || user.email}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {isAdmin ? 'Διαχειριστής' : 'Οργανωτικός'}
            </p>
          </div>
          <NotificationCenter userType={isAdmin ? 'admin' : 'organotikos'} />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-slate-400 hover:text-slate-600 h-7 w-7"
            title="Αποσύνδεση"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── MOBILE: Top header ── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-40 flex items-center justify-between px-4"
        style={{ paddingTop: 'env(safe-area-inset-top)', minHeight: 'calc(env(safe-area-inset-top) + 64px)' }}
      >
        {isDeepPage ? (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 text-blue-500" />
          <span className="font-semibold text-sm truncate max-w-[140px] text-slate-900 dark:text-slate-100">
            {isDeepPage ? (adminNavItems.find(i => i.page === currentPageName)?.name || 'Εκλογές') : 'Εκλογές'}
          </span>
        </div>
        {user && <NotificationCenter userType={user.role === 'admin' ? 'admin' : 'organotikos'} />}
      </div>

      {/* ── MOBILE: Sidebar overlay ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── MOBILE: Drawer sidebar ── */}
      <aside className={cn(
        "lg:hidden fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 z-50 transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <Vote className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">Εκλογές</span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">2026</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          {adminNavItems.map(item => (
            <React.Fragment key={item.page}>
              {item.divider && <div className="border-t border-slate-200 dark:border-slate-700 my-2" />}
              <Link
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  currentPageName === item.page
                    ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            </React.Fragment>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {user.full_name || user.email}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAdmin ? 'Διαχειριστής' : 'Οργανωτικός'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <NotificationCenter userType={isAdmin ? 'admin' : 'organotikos'} />
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-slate-400 hover:text-slate-600">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      {/* Desktop: single-row header is h-14 (56px); pt-16 (64px) clears it with a small gap. */}
      <main className="lg:pt-16 pt-16 min-h-screen w-full max-w-full"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="p-4 sm:p-6 lg:p-8 w-full max-w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── MOBILE: Bottom navigation bar ── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 z-40 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          { label: 'Πίνακας', icon: LayoutDashboard, page: 'Dashboard', relatedPages: ['Dashboard'] },
          { label: 'Προβλέψεις', icon: GitCompare, page: 'Predictions', relatedPages: ['Predictions'] },
          { label: 'Μενού', icon: Menu, page: null, relatedPages: [] },
        ].map(item => {
          const isActive = item.relatedPages.includes(currentPageName);
          if (!item.page) {
            return (
              <button
                key="menu"
                onClick={() => setSidebarOpen(true)}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          }
          return (
            <button
              key={item.page}
              onClick={() => {
                if (isActive) {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  tabScrollRef.current[currentPageName] = window.scrollY;
                  navigate(createPageUrl(item.page));
                  const saved = tabScrollRef.current[item.page] || 0;
                  requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'instant' }));
                }
              }}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors",
                isActive ? "text-blue-500 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Delete Account Dialog ── */}
      <Dialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <DialogTitle className="text-xl">Διαγραφή Λογαριασμού</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Είστε σίγουροι ότι θέλετε να διαγράψετε μόνιμα τον λογαριασμό σας; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteAccountDialog(false)} disabled={deletingAccount} className="w-full sm:w-auto">
              Ακύρωση
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deletingAccount} className="w-full sm:w-auto">
              {deletingAccount ? 'Διαγραφή...' : 'Διαγραφή Λογαριασμού'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Timeout Warning Modal ── */}
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
              <div className="text-5xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                {Math.floor(timeoutCountdown / 60)}:{String(timeoutCountdown % 60).padStart(2, '0')}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">λεπτά</div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleIdleLogout} className="w-full sm:w-auto">
              Αποσύνδεση Τώρα
            </Button>
            <Button onClick={handleStayLoggedIn} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
              Συνέχεια Σύνδεσης
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}