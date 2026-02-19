
import React, { useState, useEffect, useContext, createContext, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './services/store';
import { User, Role } from './types';
import Login from './pages/Login';
import SetterDashboard from './pages/SetterDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import DesignerDashboard from './pages/DesignerDashboard';
import ProjectDetail from './pages/ProjectDetail';
import TeamManagement from './pages/TeamManagement';
import InventoryPage from './pages/InventoryPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import BulkReturnPage from './pages/BulkReturnPage';
import AllProjectsPage from './pages/AllProjectsPage';
import ProfilePage from './pages/ProfilePage';
import { Layout } from './components/Layout';
import { Toast, Spinner } from './components/UI';
import { InstallPrompt } from './components/InstallPrompt';
import { TourProvider } from './components/TourContext';
import { TourOverlay } from './components/TourOverlay';

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
    const initApp = async () => {
      // 1. Subscribe to updates
      const unsubscribe = store.subscribe(() => {
         setDataTick(prev => prev + 1);
         const currentUser = store.getCurrentUser();
         if (currentUser) setUser({...currentUser}); 
      });

      // 2. Initialize Store (Async Firebase Check)
      await store.init();
      setUser(store.getCurrentUser());
      setLoading(false);

      return () => unsubscribe();
    };
    initApp();
  }, []);

  const handleLogin = async (email: string, password?: string) => {
    const u = await store.login(email, password);
    if (u) {
      setUser(u);
      return true;
    }
    return false;
  };

  const handleLogout = async () => {
    await store.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#16171D] text-white gap-4">
        <Spinner size="md" />
        <span className="text-sm font-mono tracking-widest animate-pulse text-lux-gold">CONNECTING TO CLOUD...</span>
      </div>
    );
  }

  return (
    <ToastContext.Provider value={(msg) => setToastMsg(msg)}>
      <HashRouter>
        <TourProvider>
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            <InstallPrompt />
            <TourOverlay />

            <Routes>
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
                
                <Route path="/projects" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><AllProjectsPage /></ProtectedRoute>} />
                <Route path="/team" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><TeamManagement /></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><InventoryPage /></ProtectedRoute>} />
                <Route path="/bulk-return" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><BulkReturnPage /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><ReportsPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute user={user} allowedRoles={[Role.MANAGER]}><SettingsPage /></ProtectedRoute>} />
            </Route>
            </Routes>
        </TourProvider>
      </HashRouter>
    </ToastContext.Provider>
  );
};
export default App;
