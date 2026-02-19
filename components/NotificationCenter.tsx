
import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Inbox, PackageCheck, UserPlus, Info, Trash2 } from 'lucide-react';
import { store } from '../services/store';
import { AppNotification, User } from '../types';
import { useNavigate } from 'react-router-dom';

const NotificationIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'ASSIGNMENT': return <UserPlus size={16} className="text-blue-400" />;
    case 'REQUEST': return <Inbox size={16} className="text-lux-gold" />;
    case 'RETURN': return <PackageCheck size={16} className="text-emerald-400" />;
    case 'HANDOFF': return <UserPlus size={16} className="text-purple-400" />;
    default: return <Info size={16} className="text-zinc-400" />;
  }
};

export const NotificationCenter: React.FC<{ user: User }> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refresh = () => {
    setNotifications(store.getNotifications(user.id));
  };

  useEffect(() => {
    refresh();
    const unsubscribe = store.subscribe(refresh);
    return () => unsubscribe();
  }, [user]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await store.markNotificationRead(id);
  };

  const handleMarkAllRead = async () => {
    await store.markAllNotificationsRead(user.id);
  };

  const handleClickItem = (n: AppNotification) => {
    if (!n.read) store.markNotificationRead(n.id);
    if (n.link) {
      setIsOpen(false);
      navigate(n.link);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all relative"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#16171D] animate-pulse"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-80 md:w-96 bg-[#1F2128] border border-zinc-800 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in slide-in-from-top-2 zoom-in-95">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-sm">
            <h3 className="font-bold text-white text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-[10px] text-lux-gold hover:text-white font-medium transition-colors flex items-center gap-1">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {notifications.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => handleClickItem(n)}
                    className={`p-4 hover:bg-white/5 transition-colors cursor-pointer flex gap-3 group relative ${!n.read ? 'bg-lux-gold/5' : ''}`}
                  >
                    <div className={`mt-1 flex-shrink-0 ${!n.read ? 'opacity-100' : 'opacity-50'}`}>
                      <NotificationIcon type={n.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <h4 className={`text-xs font-bold ${!n.read ? 'text-white' : 'text-zinc-400'}`}>{n.title}</h4>
                        <span className="text-[10px] text-zinc-600 whitespace-nowrap ml-2">
                          {new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <p className={`text-xs ${!n.read ? 'text-zinc-300' : 'text-zinc-500'} line-clamp-2 leading-relaxed`}>{n.message}</p>
                    </div>
                    {!n.read && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={(e) => handleMarkRead(e, n.id)}
                           className="bg-zinc-800 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 shadow-lg"
                           title="Mark Read"
                         >
                           <Check size={12} />
                         </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
