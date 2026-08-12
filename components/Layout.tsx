
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Role } from '../types';
import { LogOut, Users, LayoutDashboard, Settings, PackageOpen, FileBarChart, Layers, Briefcase, Menu, X, User as UserIcon } from 'lucide-react';
import { SetterAvatar } from './UI';
import { NotificationCenter } from './NotificationCenter';
import { ThemeToggle } from './ThemeToggle';
import { store } from '../services/store';

export const Layout: React.FC<{ user: User | null; onLogout: () => void }> = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  if (!user) return <Outlet />;

  const isManager = user.role === Role.MANAGER;
  const isDesigner = user.role === Role.DESIGNER;
  const isProjectDetail = location.pathname.startsWith('/project/');
  
  const NavItem = ({ to, icon: Icon, label }: any) => {
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    return (
      <Link to={to} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-4 px-5 py-3.5 rounded-[1.25rem] text-[14px] font-medium transition-all mb-1 ${isActive ? 'bg-lux-gold/15 text-lux-gold font-bold shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]' : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-row-hover'}`}>
        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        <span>{label}</span>
      </Link>
    );
  };

  const BottomNavItem = ({ to, icon: Icon, label, dataTour }: any) => {
    const isActive = location.pathname === to;
    return (
      <Link to={to} data-tour={dataTour} className={`flex flex-col items-center justify-center w-full py-1 relative z-10 group ${isActive ? 'text-white' : 'text-zinc-500'}`}>
        <div className={`p-2.5 rounded-2xl transition-colors duration-500 ${isActive ? 'bg-white/10' : ''}`}>
           <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        </div>
        <span className={`text-[10px] mt-1 font-semibold tracking-wide transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans text-white relative">
      {/* Sidebar (Desktop/iPad) - Glass Panel | Mobile - Full Drawer */}
      <aside className={`
          fixed z-[60] transform transition-transform duration-300 shadow-2xl overflow-hidden
          inset-y-0 left-0 w-72 bg-black/40 border-r border-white/5 md:border-r-0
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:inset-y-4 md:left-4 md:liquid-glass md:translate-x-0
          ${(!isManager && !isDesigner) ? 'hidden md:flex flex-col' : 'flex flex-col'}
          safe-pt safe-pb
      `}>
        {/* Texture Overlay */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
         <div className="p-8 mb-2 h-[120px] flex items-center justify-between relative z-10">
           <Link to="/" className="flex items-center gap-4 group">
             {store.isDemoMode ? (
               <>
                 {/* Daniels diamond mark */}
                 <div className="w-14 h-14 rounded-2xl flex items-center justify-center border border-blue-400/30 group-hover:border-blue-400/60 transition-all duration-500" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(59,130,246,0.08))' }}>
                   <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
                     <polygon points="18,3 33,12 33,24 18,33 3,24 3,12" fill="none" stroke="rgba(96,165,250,0.8)" strokeWidth="1.5"/>
                     <polygon points="18,8 28,14 28,22 18,28 8,22 8,14" fill="rgba(59,130,246,0.2)" stroke="rgba(96,165,250,0.5)" strokeWidth="1"/>
                     <circle cx="18" cy="18" r="3" fill="rgba(147,197,253,0.9)"/>
                   </svg>
                 </div>
                 <div className="flex flex-col">
                   <h1 className="text-xl font-bold tracking-tight text-theme-text-primary leading-none mb-1 font-serif group-hover:text-blue-300 transition-colors">DANIELS</h1>
                   <p className="text-[9px] text-blue-400 font-bold uppercase tracking-[0.3em] font-mono leading-none opacity-80 group-hover:opacity-100 transition-opacity">Diamond Reporter</p>
                 </div>
               </>
             ) : (
               <>
                 <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-2xl border border-white/10 group-hover:border-lux-gold/50 transition-all duration-500 shadow-lux-gold/5">
                    <img src="/brand-logo.jpg" alt="Kilani Logo" className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-700" />
                 </div>
                 <div className="flex flex-col">
                   <h1 className="text-xl font-bold tracking-tight text-theme-text-primary leading-none mb-1 font-serif group-hover:text-lux-gold transition-colors">KILANI</h1>
                   <p className="text-[9px] text-lux-gold font-bold uppercase tracking-[0.3em] font-mono leading-none opacity-80 group-hover:opacity-100 transition-opacity">Ledger</p>
                 </div>
               </>
             )}
           </Link>
           <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-zinc-500 hover:text-white transition-colors p-2 -mr-2"><X size={24}/></button>
         </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-6 custom-scrollbar">
          <nav>
            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-4 mb-2 font-mono">Workspace</div>
            <NavItem to="/" icon={LayoutDashboard} label={isManager ? "Overview" : "My Work"} />
            {(isManager || isDesigner) && <NavItem to="/projects" icon={Briefcase} label="All Projects" />}
            {(isManager || isDesigner) && <NavItem to="/inventory" icon={PackageOpen} label="Inventory" />}
          </nav>

          {(isManager || isDesigner) && (
            <nav>
              <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-4 mb-2 font-mono">Operations</div>

              <NavItem to="/reports" icon={FileBarChart} label="Reports Hub" />
              {isManager && <NavItem to="/team" icon={Users} label="Team" />}
              {isManager && <NavItem to="/settings" icon={Settings} label="Settings" />}
            </nav>
          )}
        </div>

        <div className="p-4 mt-auto">
            <div data-tour="nav-profile" onClick={() => navigate('/profile')} className="flex items-center gap-3 p-3 rounded-2xl bg-theme-input-bg border border-theme-border hover:border-lux-gold/30 cursor-pointer transition-all hover:bg-theme-row-hover">
              <SetterAvatar name={user.name} color={user.setterColor} image={user.profilePhoto} size="sm" />
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold truncate">{user.name}</p>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{user.role}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onLogout(); }} className="text-zinc-500 hover:text-red-400"><LogOut size={18}/></button>
           </div>
           {store.isDemoMode && (
                <div className="mt-4 px-4 py-2 border-t border-white/5 flex flex-col gap-1">
                    <span className="text-[9px] text-blue-400 font-bold uppercase tracking-[0.2em] opacity-60">Demo Edition</span>
                    <span className="text-[10px] text-zinc-500 font-medium">Daniels Diamond Reporter</span>
                </div>
            )}
        </div>
      </aside>

      {/* Mobile Header (Glass) - Visible up to MD */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/5 safe-pt transition-all duration-200">
         <div className="h-20 flex items-center justify-between px-6 w-full">
            <Link to="/" className="flex items-center gap-3">
              {store.isDemoMode ? (
                <>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-blue-400/25" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(59,130,246,0.05))' }}>
                    <svg width="20" height="20" viewBox="0 0 36 36" fill="none">
                      <polygon points="18,3 33,12 33,24 18,33 3,24 3,12" fill="none" stroke="rgba(96,165,250,0.8)" strokeWidth="1.5"/>
                      <circle cx="18" cy="18" r="3.5" fill="rgba(147,197,253,0.9)"/>
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-lg text-white font-serif leading-none">DANIELS</span>
                    <span className="text-blue-400 font-mono text-[8px] uppercase tracking-[0.2em] font-bold leading-none mt-1">Diamond Reporter</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 shadow-lg shadow-lux-gold/10">
                     <img src="/brand-logo.jpg" alt="Kilani Logo" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-lg text-white font-serif leading-none">KILANI</span>
                    <span className="text-lux-gold font-mono text-[8px] uppercase tracking-[0.2em] font-bold leading-none mt-1">Ledger</span>
                  </div>
                </>
              )}
            </Link>
            <div className="flex items-center gap-3">
               <ThemeToggle />
               <NotificationCenter user={user} />
               {(isManager || isDesigner) && <button onClick={() => setMobileMenuOpen(true)} className="text-white p-2.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl active:scale-95 transition-all"><Menu size={22}/></button>}
               {(!isManager && !isDesigner) && <div data-tour="nav-profile-mobile" onClick={() => navigate('/profile')} className="active:scale-90 transition-transform"><SetterAvatar name={user.name} color={user.setterColor} image={user.profilePhoto} size="sm" /></div>}
            </div>

         </div>
      </header>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden relative ${(isManager || isDesigner) ? 'md:pl-80' : 'md:pl-80 pb-[90px] md:pb-0'}`}>
         
         <main className="flex-1 overflow-auto scroll-smooth p-6 md:p-12 safe-pb relative">
           {/* Spacer for Fixed Header on Mobile */}
           <div className="md:hidden w-full h-24"></div>
           
           <div className="max-w-[1600px] mx-auto w-full">
              {/* Desktop Top Bar (Hidden on Mobile) - Now scrolls with content */}
              <div className="hidden md:flex justify-end items-center mb-6 gap-6 w-full">
                 <div className="flex items-center gap-4">
                    <ThemeToggle />
                    <NotificationCenter user={user} />
                 </div>
              </div>

              <Outlet context={{ onLogout, user }} />
           </div>
         </main>
      </div>

      {/* Staff Bottom Nav (Glass) - Floating (Hidden on Project Detail & Desktop) */}
      {(!isManager && !isDesigner) && !isProjectDetail && (
        <div className="md:hidden fixed bottom-6 left-6 right-6 h-16 liquid-glass z-50 flex justify-around items-center safe-pb animate-in slide-in-from-bottom-2">
           {/* Texture Overlay */}
           <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
           <BottomNavItem to="/" icon={LayoutDashboard} label="Work" />
           <BottomNavItem to="/profile" icon={UserIcon} label="Profile" dataTour="nav-profile" />
        </div>
      )}

      {mobileMenuOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden animate-in fade-in" onClick={() => setMobileMenuOpen(false)} />}
    </div>
  );
};
