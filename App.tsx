
import React, { useState, useEffect, useContext, createContext, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './services/store';
import { User, Role } from './types';
import { requestPushPermission, onForegroundPush } from './services/push';

// Lazy loaded pages for performance
const Login = lazy(() => import('./pages/Login'));
const SetterDashboard = lazy(() => import('./pages/SetterDashboard'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const DesignerDashboard = lazy(() => import('./pages/DesignerDashboard'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

const AllProjectsPage = lazy(() => import('./pages/AllProjectsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const VerificationFlow = lazy(() => import('./pages/VerificationFlow'));
const DemoPortal = lazy(() => import('./pages/DemoPortal'));

import { Layout } from './components/Layout';
import { Toast, Spinner } from './components/UI';
import { InstallPrompt } from './components/InstallPrompt';
import { TourProvider } from './components/TourContext';
import { TourOverlay } from './components/TourOverlay';
import { ThemeProvider } from './components/ThemeContext';

const ToastContext = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

const ProtectedRoute: React.FC<{ children: React.ReactNode; user: User | null; allowedRoles?: Role[] }> = ({ children, user, allowedRoles }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dataTick, setDataTick] = useState(0); 

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    const initApp = async () => {
      // Pre-check: if #ZiziEdition is in the URL hash, activate demo mode + redirect BEFORE Firebase init
      const rawHash = window.location.hash;
      if (rawHash === '#ZiziEdition' || rawHash.startsWith('#ZiziEdition')) {
        store.enableDemoMode();
        window.location.replace(window.location.origin + window.location.pathname + '#/demo');
        return;
      }
      // Also handle direct /#/demo navigation (after redirect from ZiziEdition)
      if (rawHash === '#/demo' || rawHash.startsWith('#/demo')) {
        if (!store.isDemoMode) store.enableDemoMode();
      }

      // 1. Subscribe to updates
      cleanup = store.subscribe(() => {
         setDataTick(prev => prev + 1);
         const currentUser = store.getCurrentUser();
         if (currentUser) setUser({...currentUser}); 
      });

      // 2. Initialize Store (Async Firebase Check)
      await store.init();
      
      // TEMPORARY SCRIPT TO ADD RETURNS TO 1351
      if (!localStorage.getItem('added_returns_1351_v2')) {
        const project = store.getProjects().find(p => p.code === '1351');
        if (project) {
          const hagop = store.getUsers().find(u => u.name.toLowerCase() === 'hagop');
          const harout = store.getUsers().find(u => u.name.toLowerCase() === 'harout');
          const specs = store.getSpecs();

          if (hagop) {
            const hagopLines = [
              { label: 'RD 0.8mm', pcs: 15 },
              { label: 'RD 1mm', pcs: 8 },
              { label: 'RD 1.2mm', pcs: 9 },
              { label: 'RD 1.4mm', pcs: 16 },
              { label: 'RD 1.6mm', pcs: 15 },
              { label: 'RD 1.8mm', pcs: 3 },
              { label: 'RD 2mm', pcs: 9 },
              { label: 'RD 2.1mm', pcs: 2 },
            ].map(l => {
              const spec = specs.find(s => s.label === l.label);
              return { specId: spec?.id || '', pcs: l.pcs, ct: l.pcs * (spec?.ctPerStone || 0) };
            }).filter(l => l.specId);

            await store.createInventoryMovement({
              type: 'BULK_RETURN_INTAKE' as any,
              createdById: 'manager',
              referenceSetterId: hagop.id,
              referenceProjectId: project.id,
              notes: 'Bulk Return Intake [Reconciled]',
              lines: hagopLines
            });
          }

          if (harout) {
            const haroutLines = [
              { label: 'RD 0.9mm', pcs: 24 },
              { label: 'RD 1.1mm', pcs: 23 },
              { label: 'RD 1.25mm', pcs: 30 },
              { label: 'RD 1.3mm', pcs: 7 },
            ].map(l => {
              const spec = specs.find(s => s.label === l.label);
              return { specId: spec?.id || '', pcs: l.pcs, ct: l.pcs * (spec?.ctPerStone || 0) };
            }).filter(l => l.specId);

            await store.createInventoryMovement({
              type: 'BULK_RETURN_INTAKE' as any,
              createdById: 'manager',
              referenceSetterId: harout.id,
              referenceProjectId: project.id,
              notes: 'Harout-1351 [Reconciled]',
              lines: haroutLines
            });

            const mixedSpec = specs.find(s => s.label === 'Mixed / Unsorted');
            if (mixedSpec) {
              await store.createInventoryMovement({
                type: 'BROKEN_OUT' as any,
                createdById: 'manager',
                referenceSetterId: harout.id,
                referenceProjectId: project.id,
                notes: 'BROKEN',
                lines: [{ specId: mixedSpec.id, pcs: 2, ct: 0 }]
              });
            }
          }
          localStorage.setItem('added_returns_1351_v2', 'true');
        }
      }
      
      setUser(store.getCurrentUser());
      setLoading(false);
    };
    
    initApp();

    // Global Error Handlers to prevent silent failures
    const handleGlobalError = (event: ErrorEvent) => {
      console.error("Global Error Caught:", event.error);
      setToastMsg(`Error: ${event.message}`);
    };
    const handleGlobalRejection = (event: PromiseRejectionEvent) => {
      console.error("Global Rejection Caught:", event.reason);
      setToastMsg(`Async Error: ${event.reason?.message || 'Unknown network/async error'}`);
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleGlobalRejection);

    return () => {
      if (cleanup) cleanup();
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleGlobalRejection);
    };
  }, []);

  const handleLogin = async (email: string, password?: string) => {
    const u = await store.login(email, password);
    if (u) {
      setUser(u);
      // Run assignment integrity check on login
      const integrityResult = store.verifyAssignmentIntegrity(u.id);
      if (!integrityResult.ok) {
        console.warn('[LOGIN] Assignment integrity issues detected and repaired:', integrityResult.issues);
      }

      // Push notifications: first time (permission still 'default'), ask with a friendly
      // toast first. If already granted from a previous session, silently re-register —
      // FCM tokens can go stale/invalid over time, and this is how they self-heal.
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') {
          setToastMsg("Enabling notifications so you don't miss assignments...");
          setTimeout(() => { requestPushPermission(u.id); }, 1500);
        } else if (Notification.permission === 'granted') {
          requestPushPermission(u.id);
        }
      }

      return true;
    }
    return false;
  };

  // Show a toast for pushes that arrive while the app is already open
  // (background/lockscreen pushes are handled by the service worker instead).
  useEffect(() => {
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    onForegroundPush((payload) => {
      setToastMsg(`${payload.title || 'Notification'}${payload.body ? ': ' + payload.body : ''}`);
    }).then((unsub) => { unsubscribe = unsub; });
    return () => unsubscribe?.();
  }, [user?.id]);

  const handleLogout = async () => {
    await store.logout();
    setUser(null);
  };

  if (loading) {
    return <LoadingLogo />;
  }

  return (
    <ToastContext.Provider value={(msg) => setToastMsg(msg)}>
      <ThemeProvider>
        <HashRouter>
          <TourProvider>
              {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
              <InstallPrompt />
              <TourOverlay />

              <Suspense fallback={<LoadingLogo />}>
                  <Routes>
                  <Route path="*" element={<Navigate to="/login" replace />} />
                  <Route path="/demo" element={<DemoPortal />} />
                  <Route path="/login" element={<Login onLogin={handleLogin} />} />
                  <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
                      <Route index element={
                      !user ? <Navigate to="/login" /> : 
                      (user.role === Role.MANAGER) ? <ManagerDashboard currentUser={user} /> : 
                      user.role === Role.DESIGNER ? <DesignerDashboard currentUser={user} /> :
                      <SetterDashboard currentUser={user} />
                      } />
                      <Route path="/profile" element={<ProtectedRoute user={user}><ProfilePage /></ProtectedRoute>} />
                      <Route path="/project/:id" element={<ProtectedRoute user={user}><ProjectDetail currentUser={user} /></ProtectedRoute>} />
                      <Route path="/verify/:projectId" element={<ProtectedRoute user={user}><VerificationFlow currentUser={user} /></ProtectedRoute>} />
                      
                      <Route path="/projects" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER, Role.DESIGNER, Role.SETTER, Role.JEWELLER, Role.SALES_REP]}><AllProjectsPage /></ProtectedRoute>} />
                      <Route path="/team" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><TeamManagement /></ProtectedRoute>} />
                      <Route path="/inventory" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER, Role.DESIGNER]}><InventoryPage /></ProtectedRoute>} />

                      <Route path="/reports" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER, Role.DESIGNER]}><ReportsPage /></ProtectedRoute>} />
                      <Route path="/settings" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><SettingsPage /></ProtectedRoute>} />
                  </Route>
                  </Routes>
              </Suspense>
          </TourProvider>
        </HashRouter>
      </ThemeProvider>
    </ToastContext.Provider>
  );
};
const LoadingLogo = () => (
  <div className="h-screen w-full flex flex-col items-center justify-center gap-6">
    <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Pulsing ring */}
        <div className="absolute inset-0 rounded-full border border-lux-gold/20 animate-ping opacity-20"></div>
        {/* Glow */}
        <div className="absolute inset-4 rounded-full bg-lux-gold/10 blur-xl animate-pulse"></div>
        {/* Logo SVG */}
        <svg className="w-16 h-16 relative z-10 drop-shadow-[0_0_10px_rgba(245,194,73,0.3)]" viewBox="0 0 512 512">
            <path d="M140 100 L220 100 L220 230 L340 100 L440 100 L290 260 L450 412 L350 412 L220 290 L220 412 L140 412 Z" fill="#F5C249" />
        </svg>
    </div>
    <div className="flex flex-col items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.4em] text-lux-gold/60 font-mono animate-pulse">Synchronizing</span>
        <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-lux-gold/30 to-transparent"></div>
    </div>
  </div>
);

export default App;
