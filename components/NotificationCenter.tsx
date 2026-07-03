
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell, Check, CheckCheck, Inbox, PackageCheck, UserPlus, Info, Trash2,
  MessageSquare, Activity, AlertTriangle, X, Filter
} from 'lucide-react';
import { store } from '../services/store';
import { AppNotification, User } from '../types';
import { useNavigate } from 'react-router-dom';

// ─── Type Config ────────────────────────────────────────────────────────────

type FilterTab = 'ALL' | 'UNREAD' | 'ASSIGNMENT' | 'REQUEST' | 'RETURN' | 'STATUS_UPDATE' | 'SYSTEM';

interface TypeConfig {
  icon: React.ReactNode;
  borderColor: string;
  bgBadge: string;
  label: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  ASSIGNMENT: {
    icon: <UserPlus size={14} />,
    borderColor: 'border-blue-400',
    bgBadge: 'bg-blue-400/10 text-blue-400',
    label: 'Assignment',
  },
  REQUEST: {
    icon: <Inbox size={14} />,
    borderColor: 'border-lux-gold',
    bgBadge: 'bg-lux-gold/10 text-lux-gold',
    label: 'Request',
  },
  RETURN: {
    icon: <PackageCheck size={14} />,
    borderColor: 'border-emerald-400',
    bgBadge: 'bg-emerald-400/10 text-emerald-400',
    label: 'Return',
  },
  HANDOFF: {
    icon: <UserPlus size={14} />,
    borderColor: 'border-purple-400',
    bgBadge: 'bg-purple-400/10 text-purple-400',
    label: 'Handoff',
  },
  MENTION: {
    icon: <MessageSquare size={14} />,
    borderColor: 'border-pink-400',
    bgBadge: 'bg-pink-400/10 text-pink-400',
    label: 'Mention',
  },
  STATUS_UPDATE: {
    icon: <Activity size={14} />,
    borderColor: 'border-orange-400',
    bgBadge: 'bg-orange-400/10 text-orange-400',
    label: 'Status',
  },
  SYSTEM: {
    icon: <AlertTriangle size={14} />,
    borderColor: 'border-red-400',
    bgBadge: 'bg-red-400/10 text-red-400',
    label: 'System',
  },
};

const getTypeConfig = (type: string): TypeConfig =>
  TYPE_CONFIG[type] ?? {
    icon: <Info size={14} />,
    borderColor: 'border-zinc-500',
    bgBadge: 'bg-zinc-500/10 text-zinc-400',
    label: 'Info',
  };

// ─── Relative Time ───────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Filter Tabs Config ───────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL',           label: 'All' },
  { key: 'UNREAD',        label: 'Unread' },
  { key: 'ASSIGNMENT',    label: 'Assigned' },
  { key: 'REQUEST',       label: 'Requests' },
  { key: 'RETURN',        label: 'Returns' },
  { key: 'STATUS_UPDATE', label: 'Status' },
  { key: 'SYSTEM',        label: 'System' },
];

// ─── Notification Item ────────────────────────────────────────────────────────

interface NotifItemProps {
  n: AppNotification;
  index: number;
  onRead: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onClick: (n: AppNotification) => void;
}

const NotifItem: React.FC<NotifItemProps> = ({ n, index, onRead, onDelete, onClick }) => {
  const cfg = getTypeConfig(n.type);

  return (
    <div
      className="notif-item group relative flex gap-0 cursor-pointer"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
      onClick={() => onClick(n)}
    >
      {/* Left accent border */}
      <div className={`w-0.5 flex-shrink-0 ${cfg.borderColor} ${!n.read ? 'opacity-100' : 'opacity-20'} rounded-r transition-opacity`} />

      {/* Content */}
      <div className={`flex-1 flex gap-3 px-4 py-3.5 hover:bg-theme-row-hover transition-colors ${!n.read ? 'bg-lux-gold-dim/10' : ''}`}>
        {/* Icon bubble */}
        <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.bgBadge} ${!n.read ? 'opacity-100' : 'opacity-40'} transition-opacity`}>
          {cfg.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex justify-between items-start gap-2 mb-0.5">
            <h4 className={`text-xs font-semibold leading-tight ${!n.read ? 'text-theme-text-primary' : 'text-theme-text-muted'}`}>
              {n.title}
            </h4>
            <span className="text-[10px] text-theme-text-muted whitespace-nowrap flex-shrink-0 mt-0.5">
              {relativeTime(n.createdAt)}
            </span>
          </div>
          <p className={`text-[11px] leading-relaxed line-clamp-2 ${!n.read ? 'text-theme-text-secondary' : 'text-theme-text-muted'}`}>
            {n.message}
          </p>
          {n.link && (
            <span className={`text-[10px] mt-1 inline-block ${cfg.bgBadge} px-1.5 py-0.5 rounded font-medium`}>
              {cfg.label}
            </span>
          )}
        </div>

        {/* Unread dot */}
        {!n.read && (
          <div className="flex-shrink-0 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-lux-gold animate-pulse" />
          </div>
        )}
      </div>

      {/* Hover action row */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-150 translate-x-1 group-hover:translate-x-0 pointer-events-none group-hover:pointer-events-auto z-10">
        {!n.read && (
          <button
            onClick={(e) => onRead(e, n.id)}
            title="Mark read"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-theme-input-bg border border-theme-border text-theme-text-muted hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/10 shadow-lg transition-all"
          >
            <Check size={11} />
          </button>
        )}
        <button
          onClick={(e) => onDelete(e, n.id)}
          title="Dismiss"
          className="w-7 h-7 flex items-center justify-center rounded-full bg-theme-input-bg border border-theme-border text-theme-text-muted hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 shadow-lg transition-all"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

export const NotificationCenter: React.FC<{ user: User }> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [prevUnread, setPrevUnread] = useState(0);
  const [bellRing, setBellRing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    setNotifications(store.getNotifications(user.id));
  }, [user.id]);

  useEffect(() => {
    refresh();
    const unsubscribe = store.subscribe(refresh);
    return () => unsubscribe();
  }, [refresh]);

  // Bell ring on new unread
  const unreadCount = notifications.filter(n => !n.read).length;
  useEffect(() => {
    if (unreadCount > prevUnread && prevUnread !== -1) {
      setBellRing(true);
      const t = setTimeout(() => setBellRing(false), 700);
      return () => clearTimeout(t);
    }
    setPrevUnread(unreadCount);
  }, [unreadCount]);

  // Click outside
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await store.deleteNotification(id);
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

  // Filter logic
  const filtered = notifications.filter(n => {
    if (activeFilter === 'ALL')    return true;
    if (activeFilter === 'UNREAD') return !n.read;
    return n.type === activeFilter;
  });

  // Badge display
  const badgeLabel = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Bell Button ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-full transition-all duration-200 ${
          isOpen
            ? 'bg-lux-gold/15 text-lux-gold'
            : unreadCount > 0
            ? 'text-lux-gold hover:bg-lux-gold/10'
            : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-row-hover'
        }`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell
          size={20}
          className={bellRing ? 'notif-bell-ring' : ''}
          style={{ transformOrigin: 'top center' }}
        />
        {badgeLabel && (
          <span className="notif-badge-pop absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-[3px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-theme-bg leading-none shadow-lg">
            {badgeLabel}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {isOpen && (
        <div className="notif-panel absolute right-0 top-12 w-[360px] md:w-[420px] rounded-xl border border-theme-border bg-theme-modal-bg shadow-2xl z-[100] overflow-hidden">

          {/* Header */}
          <div className="px-4 pt-4 pb-0 bg-theme-table-header border-b border-theme-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-theme-text-primary text-sm tracking-tight">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-semibold bg-lux-gold/20 text-lux-gold px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-[10px] text-theme-text-muted hover:text-emerald-400 transition-colors font-medium"
                    title="Mark all read"
                  >
                    <CheckCheck size={12} />
                    All read
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-0.5 overflow-x-auto pb-0 -mb-px scrollbar-none">
              {FILTER_TABS.map(tab => {
                const count = tab.key === 'ALL'
                  ? notifications.length
                  : tab.key === 'UNREAD'
                  ? notifications.filter(n => !n.read).length
                  : notifications.filter(n => n.type === tab.key).length;
                if (count === 0 && tab.key !== 'ALL' && tab.key !== 'UNREAD') return null;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`flex-shrink-0 text-[10px] font-medium px-3 py-2 border-b-2 transition-all whitespace-nowrap ${
                      activeFilter === tab.key
                        ? 'border-lux-gold text-lux-gold'
                        : 'border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:border-theme-border'
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`ml-1 ${activeFilter === tab.key ? 'text-lux-gold/70' : 'text-theme-text-muted'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-[440px] overflow-y-auto custom-scrollbar divide-y divide-theme-border">
            {filtered.length === 0 ? (
              <div className="py-14 flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-theme-row-hover flex items-center justify-center">
                  <Bell size={22} className="text-theme-text-muted" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-theme-text-secondary font-medium">
                    {activeFilter === 'ALL' ? 'No notifications yet' : `No ${activeFilter.toLowerCase().replace('_', ' ')} notifications`}
                  </p>
                  <p className="text-[11px] text-theme-text-muted mt-0.5">
                    {activeFilter === 'ALL' ? "You're all caught up" : 'Try another filter'}
                  </p>
                </div>
                {activeFilter !== 'ALL' && (
                  <button
                    onClick={() => setActiveFilter('ALL')}
                    className="text-[11px] text-lux-gold hover:underline mt-1"
                  >
                    Show all notifications
                  </button>
                )}
              </div>
            ) : (
              filtered.map((n, i) => (
                <NotifItem
                  key={n.id}
                  n={n}
                  index={i}
                  onRead={handleMarkRead}
                  onDelete={handleDelete}
                  onClick={handleClickItem}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-theme-border bg-theme-modal-bg flex justify-between items-center">
              <span className="text-[10px] text-theme-text-muted">
                {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </span>
              {notifications.some(n => n.read) && (
                <button
                  onClick={async () => {
                    const readOnes = notifications.filter(n => n.read);
                    for (const n of readOnes) {
                      await store.deleteNotification(n.id);
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] text-theme-text-muted hover:text-red-400 transition-colors"
                >
                  <Trash2 size={10} />
                  Clear read
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
