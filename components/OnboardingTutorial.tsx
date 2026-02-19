
import React, { useState, useEffect } from 'react';
import { User, Role } from '../types';
import { store } from '../services/store';
import { Card, Button } from './UI';
import { ChevronRight, ChevronLeft, X, Check, ArrowUp } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  desc: string;
  targetId?: string; // HTML ID to spotlight
}

// Configuration for role-based steps
const STAFF_STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome to Diamond Ledger', desc: 'A quick tour of your new workspace.' },
  { id: 'projects', title: 'My Work', desc: 'Your assigned projects appear here. Tap any project to view details.', targetId: 'tutorial-project-list' },
  { id: 'features', title: 'Project Actions', desc: 'Inside a project, you can Request Diamonds, Submit Returns, and log Breakage without counting.', targetId: 'tutorial-project-list' },
  { id: 'timeline', title: 'Update Progress', desc: 'Keep the team in sync by updating the project stage timeline.', targetId: 'tutorial-project-list' },
  { id: 'profile', title: 'Your Profile', desc: 'Manage your password, photo, and preferences here.', targetId: 'tutorial-profile-trigger' },
];

const DESIGNER_STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome, Designer', desc: 'Your creative workspace is ready.' },
  { id: 'designs', title: 'My Designs', desc: 'Access your active design projects here.', targetId: 'tutorial-design-list' },
  { id: 'logs', title: 'Design Logs', desc: 'Use the Design Log inside projects to attach sketches, CADs, and notes.', targetId: 'tutorial-design-list' },
  { id: 'profile', title: 'Your Profile', desc: 'Update your portfolio photo and account settings.', targetId: 'tutorial-profile-trigger' },
];

const SALES_STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome', desc: 'Track your client projects here.' },
  { id: 'projects', title: 'My Projects', desc: 'View status and details for all your linked projects.', targetId: 'tutorial-project-list' },
  { id: 'profile', title: 'Account', desc: 'Manage your profile settings here.', targetId: 'tutorial-profile-trigger' },
];

export const OnboardingTutorial: React.FC<{ user: User; onComplete: () => void }> = ({ user, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Determine steps based on role
  const steps = user.role === Role.DESIGNER ? DESIGNER_STEPS :
                user.role === Role.SALES_REP ? SALES_STEPS :
                STAFF_STEPS; // Default to Staff for Setters/Jewellers

  const currentStep = steps[stepIndex];

  // Effect to find the target element and calculate position
  useEffect(() => {
    const updatePosition = () => {
      if (currentStep.targetId) {
        const el = document.getElementById(currentStep.targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          setCoords({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          });
          // Scroll into view if needed
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Fallback if element not found (e.g. empty list)
          setCoords(null);
        }
      } else {
        setCoords(null);
      }
    };

    // Small delay to ensure rendering
    const t = setTimeout(updatePosition, 100);
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', updatePosition);
    };
  }, [stepIndex, currentStep]);

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      store.completeOnboarding(user.id);
      onComplete();
    }
  };

  const handleSkip = () => {
    store.skipOnboarding(user.id);
    onComplete();
  };

  // Render logic
  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      {/* 1. Backdrop Layer - Dims everything */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] transition-all duration-500"></div>

      {/* 2. Spotlight Layer (if coords exist) */}
      {coords && (
        <div 
          className="absolute border-2 border-lux-gold/60 shadow-[0_0_50px_rgba(245,194,73,0.3)] rounded-2xl transition-all duration-500 ease-in-out pointer-events-none"
          style={{
            top: coords.top - 4,
            left: coords.left - 4,
            width: coords.width + 8,
            height: coords.height + 8,
          }}
        ></div>
      )}

      {/* 3. Content Card Layer */}
      <div className={`absolute w-full px-4 transition-all duration-500 flex justify-center pointer-events-none`}
           style={{ 
             top: coords ? (coords.top + coords.height + 20 > window.innerHeight - 200 ? coords.top - 180 : coords.top + coords.height + 20) : '40%', 
           }}
      >
        <Card className={`pointer-events-auto w-full max-w-sm p-6 bg-[#1F2128] border-lux-gold shadow-2xl relative animate-in fade-in zoom-in-95 duration-300`}>
          {coords && coords.top + coords.height + 20 > window.innerHeight - 200 ? (
             <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 bg-[#1F2128] border-b border-r border-lux-gold/30 rotate-45 transform"></div>
          ) : coords ? (
             <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 bg-[#1F2128] border-t border-l border-lux-gold/30 rotate-45 transform"></div>
          ) : null}

          <div className="flex justify-between items-start mb-4">
             <div className="text-[10px] font-bold text-lux-gold uppercase tracking-widest">
                Tutorial {stepIndex + 1}/{steps.length}
             </div>
             <button onClick={handleSkip} className="text-zinc-600 hover:text-white transition-colors">
                <X size={16} />
             </button>
          </div>

          <h3 className="text-xl font-bold text-white mb-2">{currentStep.title}</h3>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{currentStep.desc}</p>

          <div className="flex justify-between items-center">
            <button 
               onClick={() => setStepIndex(Math.max(0, stepIndex - 1))} 
               disabled={stepIndex === 0}
               className="text-zinc-500 hover:text-white disabled:opacity-0 transition-colors"
            >
               Back
            </button>
            <Button onClick={handleNext} className="shadow-glow">
              {stepIndex === steps.length - 1 ? 'Finish' : 'Next'} <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
