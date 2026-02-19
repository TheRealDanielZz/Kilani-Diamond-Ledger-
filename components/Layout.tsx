
import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Role } from '../types';
import { LogOut, Users, LayoutDashboard, Settings, PackageOpen, FileBarChart, Layers, Briefcase, Menu, X, User as UserIcon } from 'lucide-react';
import { SetterAvatar } from './UI';
import { NotificationCenter } from './NotificationCenter';

export const Layout: React.FC<{ user: User | null; onLogout: () => void }> = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  if (!user) return <Outlet />;

  const isManager = user.role === Role.MANAGER;
  const isProjectDetail = location.pathname.startsWith('/project/');
  
  const NavItem = ({ to, icon: Icon, label }: any) => {
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    return (
      <Link to={to} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl text-[14px] font-medium transition-all mb-1 ${isActive ? 'bg-lux-gold text-[#16171D] font-bold shadow-glow' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        <span>{label}</span>
      </Link>
    );
  };

  const BottomNavItem = ({ to, icon: Icon, label, dataTour }: any) => {
    const isActive = location.pathname === to;
    return (
      <Link to={to} data-tour={dataTour} className={`flex flex-col items-center justify-center w-full py-1 relative group ${isActive ? 'text-lux-gold' : 'text-zinc-500'}`}>
        <div className={`transition-transform duration-300 ${isActive ? '-translate-y-1 scale-110' : ''}`}>
           <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        </div>
        <span className={`text-[10px] mt-1 font-semibold tracking-wide transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
        {isActive && <div className="absolute -bottom-2 w-1 h-1 rounded-full bg-lux-gold shadow-[0_0_8px_#F5C249]"></div>}
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans text-white relative">
      {/* Sidebar (Desktop) - Glass Panel | Mobile/Tablet - Full Drawer */}
      <aside className={`
          fixed z-[60] transform transition-transform duration-300 shadow-2xl
          inset-y-0 left-0 w-72 bg-[#1F2128] border-r border-white/5
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:inset-y-4 lg:left-4 lg:bg-[#1F2128]/95 lg:backdrop-blur-2xl lg:border lg:border-white/5 lg:rounded-3xl lg:translate-x-0
          ${!isManager ? 'hidden lg:flex flex-col' : 'flex flex-col'}
          safe-pt safe-pb
      `}>
        <div className="p-8 mb-2 flex items-center justify-between">
           <div>
             <h1 className="text-2xl font-bold tracking-tight text-white leading-none mb-1 font-serif">KILANI</h1>
             <p className="text-[10px] text-lux-gold font-bold uppercase tracking-[0.2em] font-mono">Ledger</p>
           </div>
           <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden text-zinc-500 hover:text-white"><X size={28}/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-6 custom-scrollbar">
          <nav>
            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-4 mb-2 font-mono">Workspace</div>
            <NavItem to="/" icon={LayoutDashboard} label={isManager ? "Overview" : "My Work"} />
            {isManager && <NavItem to="/projects" icon={Briefcase} label="All Projects" />}
            {isManager && <NavItem to="/inventory" icon={PackageOpen} label="Inventory" />}
          </nav>

          {isManager && (
            <nav>
              <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-4 mb-2 font-mono">Operations</div>
              <NavItem to="/bulk-return" icon={Layers} label="Bulk Returns" />
              <NavItem to="/reports" icon={FileBarChart} label="Reports Hub" />
              <NavItem to="/team" icon={Users} label="Team" />
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </nav>
          )}
        </div>

        <div className="p-4 mt-auto">
           <div data-tour="nav-profile" onClick={() => navigate('/profile')} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-lux-gold/30 cursor-pointer transition-all hover:bg-white/10">
              <SetterAvatar name={user.name} color={user.setterColor} image={user.profilePhoto} size="sm" />
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold truncate">{user.name}</p>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{user.role}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onLogout(); }} className="text-zinc-500 hover:text-red-400"><LogOut size={18}/></button>
           </div>
        </div>
      </aside>

      {/* Mobile/Tablet Header (Glass) - Visible up to LG */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#16171D]/90 backdrop-blur-xl border-b border-white/5 safe-pt transition-all duration-200">
         <div className="h-16 flex items-center justify-between px-5 w-full">
            <span className="font-bold text-lg text-white font-serif">KILANI <span className="text-lux-gold font-sans text-xs uppercase tracking-widest ml-1">Ledger</span></span>
            <div className="flex items-center gap-3">
               <NotificationCenter user={user} />
               {/* Always show menu button on mobile/tablet for Manager */}
               {isManager && <button onClick={() => setMobileMenuOpen(true)} className="text-white p-2 bg-white/5 rounded-xl border border-white/5"><Menu size={24}/></button>}
               
               {/* Avatar for non-managers */}
               {!isManager && <div data-tour="nav-profile-mobile" onClick={() => navigate('/profile')}><SetterAvatar name={user.name} color={user.setterColor} image={user.profilePhoto} size="sm" /></div>}
            </div>
         </div>
      </header>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden relative ${isManager ? 'lg:pl-[320px]' : 'lg:pl-[320px] pb-[90px] lg:pb-0'}`}>
         
         {/* Desktop Top Bar (Hidden on Mobile) */}
         <div className="hidden lg:flex justify-end items-center px-8 py-4 gap-4 absolute top-0 right-0 z-40 w-full pointer-events-none">
            <div className="pointer-events-auto">
               <NotificationCenter user={user} />
            </div>
         </div>

         <main className="flex-1 overflow-auto scroll-smooth p-0 md:pr-4 md:py-4 safe-pb relative">
           {/* Spacer for Fixed Header on Mobile/Tablet */}
           <div className="lg:hidden w-full transition-[height]" style={{ height: 'calc(4rem + env(safe-area-inset-top) + 1rem)' }}></div>
           
           <Outlet context={{ onLogout, user }} />
         </main>
      </div>

      {/* Staff Bottom Nav (Glass) - Floating (Hidden on Project Detail & Desktop) */}
      {!isManager && !isProjectDetail && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 h-16 bg-[#1F2128]/95 backdrop-blur-xl border border-white/10 rounded-2xl z-50 flex justify-around items-center shadow-2xl safe-pb ring-1 ring-white/5 animate-in slide-in-from-bottom-2">
           <BottomNavItem to="/" icon={LayoutDashboard} label="Work" />
           <BottomNavItem to="/profile" icon={UserIcon} label="Profile" dataTour="nav-profile" />
        </div>
      )}

      {mobileMenuOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden animate-in fade-in" onClick={() => setMobileMenuOpen(false)} />}
    </div>
  );
};
