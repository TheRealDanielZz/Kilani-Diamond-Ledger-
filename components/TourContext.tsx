
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Role } from '../types';
import { store } from '../services/store';

export interface TourStep {
  id: string;
  title: string;
  desc: string;
  targetId: string; // matches data-tour attribute
  route: string; // Route to navigate to
  placement?: 'top' | 'bottom' | 'auto';
  action?: () => void; // Run this when step starts (e.g. switch tab)
}

interface TourContextType {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  startTour: (role: Role) => void;
  nextStep: () => void;
  prevStep: () => void;
  endTour: () => void;
  targetRect: DOMRect | null;
  loadingTarget: boolean;
}

const TourContext = createContext<TourContextType>({} as any);

export const useTour = () => useContext(TourContext);

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [isActive, setIsActive] = useState(false);
  const [role, setRole] = useState<Role>(Role.SETTER);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);

  // Dynamic Step Generation based on real data
  const getSteps = (userRole: Role): TourStep[] => {
    // Try to find a real project to point to
    const project = store.getProjects()[0];
    const projectId = project ? project.id : 'demo';

    const STAFF_STEPS: TourStep[] = [
      { 
        id: 'dashboard', 
        title: 'Your Workspace', 
        desc: 'This is your dashboard. View your assigned tasks and deadlines here.', 
        targetId: 'dashboard-list', 
        route: '/' 
      },
      { 
        id: 'view-mode', 
        title: 'View Options', 
        desc: 'Switch between List and Grid view to see project covers.', 
        targetId: 'dashboard-view-toggle', 
        route: '/' 
      },
      { 
        id: 'project-detail', 
        title: 'Project Details', 
        desc: 'Tap a project to view instructions, timeline, and actions.', 
        targetId: 'project-header', 
        route: `/project/${projectId}` 
      },
      { 
        id: 'stage', 
        title: 'Update Progress', 
        desc: 'Keep the team updated by moving the production stage forward.', 
        targetId: 'project-stage-control', 
        route: `/project/${projectId}`,
        placement: 'top'
      },
      { 
        id: 'actions', 
        title: 'Quick Actions', 
        desc: 'Request stones or return bags without leaving the project page.', 
        targetId: 'project-actions', 
        route: `/project/${projectId}`,
        placement: 'bottom'
      },
      { 
        id: 'profile', 
        title: 'Your Profile', 
        desc: 'Manage your password, photo, and preferences.', 
        targetId: 'profile-header', 
        route: '/profile' 
      }
    ];

    const DESIGNER_STEPS: TourStep[] = [
      { id: 'dash', title: 'Design Board', desc: 'Your active design assignments appear here.', targetId: 'designer-list', route: '/' },
      { id: 'project', title: 'Design Hub', desc: 'Upload renders and track design stages.', targetId: 'project-header', route: `/project/${projectId}` },
      { id: 'logs', title: 'Design Logs', desc: 'Post updates, sketches, and notes for the team.', targetId: 'project-tabs', route: `/project/${projectId}` },
      { id: 'profile', title: 'Profile', desc: 'Update your portfolio settings.', targetId: 'profile-header', route: '/profile' }
    ];

    const MANAGER_STEPS: TourStep[] = [
      { id: 'overview', title: 'Manager Overview', desc: 'Monitor active projects, requests, and returns from one screen.', targetId: 'manager-header', route: '/' },
      { id: 'create', title: 'New Project', desc: 'Start a new job and assign it to your team.', targetId: 'manager-new-project', route: '/' },
      { id: 'requests', title: 'Requests Queue', desc: 'Fulfill stone requests from setters efficiently.', targetId: 'manager-requests', route: '/' },
      { id: 'returns', title: 'Returns Queue', desc: 'Verify returned bags and log breakage.', targetId: 'manager-returns', route: '/' },
      { id: 'inventory', title: 'Inventory Ledger', desc: 'Track live stock, record shipments, and manage loose stones.', targetId: 'inventory-header', route: '/inventory' },
      { id: 'reports', title: 'Reports Hub', desc: 'Generate weekly reports and analyze costs.', targetId: 'reports-header', route: '/reports' },
      { id: 'profile', title: 'Settings', desc: 'Manage your account and app settings.', targetId: 'profile-header', route: '/profile' }
    ];

    if (userRole === Role.DESIGNER) return DESIGNER_STEPS;
    if (userRole === Role.MANAGER) return MANAGER_STEPS;
    return STAFF_STEPS;
  };

  const steps = getSteps(role);
  const currentStep = steps[currentStepIndex] || null;

  // Navigation Logic
  useEffect(() => {
    if (!isActive || !currentStep) return;

    let attempts = 0;
    const maxAttempts = 20; // 5 seconds approx
    
    const findTarget = () => {
      // 1. Ensure Route
      if (location.pathname !== currentStep.route) {
        navigate(currentStep.route);
        // Wait for route change before looking for DOM
        return; 
      }

      // 2. Execute Action (e.g. click tab) if first time hitting this step
      if (attempts === 0 && currentStep.action) {
        currentStep.action();
      }

      // 3. Find DOM Element
      const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
      
      if (el) {
        // Scroll into view
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Calculate Rect
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        setLoadingTarget(false);
      } else {
        // Retry
        if (attempts < maxAttempts) {
            attempts++;
            setLoadingTarget(true);
            setTimeout(findTarget, 250);
        } else {
            console.warn(`Tour Target Not Found: ${currentStep.targetId}`);
            setLoadingTarget(false); 
            // Optional: Auto-skip?
        }
      }
    };

    findTarget();

  }, [isActive, currentStepIndex, location.pathname, currentStep]); // Removed 'navigate' from deps to avoid loop

  const startTour = (r: Role) => {
    setRole(r);
    setCurrentStepIndex(0);
    setIsActive(true);
    setLoadingTarget(true);
  };

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setLoadingTarget(true);
      setCurrentStepIndex(p => p + 1);
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setLoadingTarget(true);
      setCurrentStepIndex(p => p - 1);
    }
  };

  const endTour = () => {
    setIsActive(false);
    setTargetRect(null);
    store.completeOnboarding(store.getUsers().find(u => u.role === role)?.id || 'unknown');
  };

  return (
    <TourContext.Provider value={{
      isActive,
      currentStepIndex,
      currentStep,
      startTour,
      nextStep,
      prevStep,
      endTour,
      targetRect,
      loadingTarget
    }}>
      {children}
    </TourContext.Provider>
  );
};
