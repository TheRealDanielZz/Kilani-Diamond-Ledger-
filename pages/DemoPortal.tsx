
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Role } from '../types';
import { useTour } from '../components/TourContext';

// ── Particle background ──────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 3 + 1,
  delay: Math.random() * 6,
  duration: Math.random() * 8 + 6,
  opacity: Math.random() * 0.4 + 0.1,
}));

// ── Role definitions ─────────────────────────────────────────────────────────
const ROLES = [
  {
    role: Role.MANAGER,
    label: 'Workshop Manager',
    emoji: '💎',
    tagline: 'Full access',
    desc: 'Oversee all active projects, manage inventory, issue stones, and generate financial reports.',
    color: 'from-blue-500/20 to-blue-900/10',
    border: 'border-blue-400/30 hover:border-blue-400/70',
    glow: 'shadow-[0_0_40px_rgba(96,165,250,0.15)] hover:shadow-[0_0_60px_rgba(96,165,250,0.35)]',
    pill: 'bg-blue-500/20 text-blue-300',
    badge: 'bg-blue-400',
  },
  {
    role: Role.SETTER,
    label: 'Master Setter',
    emoji: '💍',
    tagline: 'Setter view',
    desc: 'View your active assignments, request diamond bags, and update production progress in real time.',
    color: 'from-sky-500/15 to-sky-900/5',
    border: 'border-sky-400/25 hover:border-sky-400/60',
    glow: 'shadow-[0_0_40px_rgba(56,189,248,0.1)] hover:shadow-[0_0_60px_rgba(56,189,248,0.28)]',
    pill: 'bg-sky-500/20 text-sky-300',
    badge: 'bg-sky-400',
  },
  {
    role: Role.JEWELLER,
    label: 'Master Jeweller',
    emoji: '✏️',
    tagline: 'Craft view',
    desc: 'Track your crafting queue, log progress entries, and coordinate with the workshop manager.',
    color: 'from-indigo-500/15 to-indigo-900/5',
    border: 'border-indigo-400/25 hover:border-indigo-400/60',
    glow: 'shadow-[0_0_40px_rgba(129,140,248,0.1)] hover:shadow-[0_0_60px_rgba(129,140,248,0.28)]',
    pill: 'bg-indigo-500/20 text-indigo-300',
    badge: 'bg-indigo-400',
  },
];

// ── Component ────────────────────────────────────────────────────────────────
const DemoPortal: React.FC = () => {
  const navigate = useNavigate();
  const { startTour } = useTour();
  const [entering, setEntering] = useState<Role | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure demo mode is active (handles page-reload after redirect)
  useEffect(() => {
    if (!store.isDemoMode) {
      store.enableDemoMode();
    }
    // Trigger mount animation
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleEnter = async (role: Role) => {
    setEntering(role);
    await store.demoLogin(role);
    // Small delay for the animation to play
    await new Promise(r => setTimeout(r, 500));
    navigate('/');
    // Auto-start tour after navigation
    setTimeout(() => startTour(role), 600);
  };

  return (
    <div
      className="demo-portal-root"
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 20% 0%, #0f1e3a 0%, #07101e 50%, #020810 100%)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Ambient glow blobs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '10%', width: '60vw', height: '60vw',
        maxWidth: 600, maxHeight: 600,
        background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />
      <div style={{
        position: 'absolute', bottom: '0', right: '-5%', width: '40vw', height: '40vw',
        maxWidth: 400, maxHeight: 400,
        background: 'radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      {/* Floating diamond particles */}
      {PARTICLES.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: 'rgba(96,165,250,0.6)',
            borderRadius: '1px',
            transform: 'rotate(45deg)',
            opacity: p.opacity,
            animation: `floatUp ${p.duration}s ${p.delay}s ease-in-out infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* ── Top badge ── */}
      <div
        style={{
          position: 'absolute', top: '1.5rem', right: '1.5rem',
          background: 'rgba(37,99,235,0.2)',
          border: '1px solid rgba(96,165,250,0.3)',
          borderRadius: '999px',
          padding: '0.3rem 0.8rem',
          fontSize: 10,
          letterSpacing: '0.15em',
          color: '#93c5fd',
          fontWeight: 700,
          textTransform: 'uppercase',
          backdropFilter: 'blur(8px)',
        }}
      >
        Demo Edition
      </div>

      {/* ── Header ── */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: '3rem',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Diamond logo mark */}
        <div style={{
          width: 72, height: 72,
          margin: '0 auto 1.5rem',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.05))',
          border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: '1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 0 40px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <polygon points="18,3 33,12 33,24 18,33 3,24 3,12" fill="none" stroke="rgba(96,165,250,0.8)" strokeWidth="1.5"/>
            <polygon points="18,8 28,14 28,22 18,28 8,22 8,14" fill="rgba(59,130,246,0.25)" stroke="rgba(96,165,250,0.5)" strokeWidth="1"/>
            <circle cx="18" cy="18" r="3" fill="rgba(147,197,253,0.9)"/>
          </svg>
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          marginBottom: '0.5rem',
          fontFamily: "'Georgia', serif",
        }}>
          DANIELS
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ height: 1, width: 32, background: 'linear-gradient(to right, transparent, rgba(96,165,250,0.4))' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.35em', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'monospace' }}>
            Diamond Reporter
          </span>
          <div style={{ height: 1, width: 32, background: 'linear-gradient(to left, transparent, rgba(96,165,250,0.4))' }} />
        </div>

        <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.8)', letterSpacing: '0.05em' }}>
          Demo Edition — Select your role to explore
        </p>
      </div>

      {/* ── Role Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1rem',
          width: '100%',
          maxWidth: 860,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(24px)',
          transition: 'all 0.8s 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {ROLES.map((r, i) => {
          const isLoading = entering === r.role;
          const isDisabled = entering !== null && !isLoading;

          return (
            <button
              key={r.role}
              onClick={() => !entering && handleEnter(r.role)}
              disabled={!!entering}
              style={{
                background: `linear-gradient(135deg, ${r.color.replace('from-', '').replace(' to-', ', ').split(',').map(c => c.trim().replace(/from-|to-/g, '')).join(', ')})`,
                border: `1px solid rgba(96,165,250,${isLoading ? 0.8 : isDisabled ? 0.1 : 0.25})`,
                borderRadius: '1.5rem',
                padding: '1.75rem',
                textAlign: 'left',
                cursor: entering ? 'default' : 'pointer',
                opacity: isDisabled ? 0.4 : 1,
                transform: isLoading ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isLoading
                  ? '0 0 60px rgba(96,165,250,0.4)'
                  : '0 0 40px rgba(96,165,250,0.08)',
                backdropFilter: 'blur(16px)',
                transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                transitionDelay: `${i * 0.05}s`,
                position: 'relative',
                overflow: 'hidden',
              }}
              className="demo-role-card"
            >
              {/* Shimmer on loading */}
              {isLoading && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.1) 50%, transparent 100%)',
                  animation: 'shimmer 1.2s infinite',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Emoji icon */}
              <div style={{
                fontSize: 32,
                marginBottom: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{r.emoji}</span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  background: 'rgba(37,99,235,0.25)',
                  border: '1px solid rgba(96,165,250,0.2)',
                  color: '#93c5fd',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '999px',
                  fontFamily: 'monospace',
                }}>
                  {r.tagline}
                </span>
              </div>

              <h3 style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#f0f9ff',
                marginBottom: '0.5rem',
                letterSpacing: '-0.01em',
              }}>
                {r.label}
              </h3>

              <p style={{
                fontSize: 13,
                color: 'rgba(186,230,253,0.65)',
                lineHeight: 1.55,
                marginBottom: '1.25rem',
              }}>
                {r.desc}
              </p>

              {/* CTA row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                color: isLoading ? '#93c5fd' : '#7dd3fc',
                fontSize: 13, fontWeight: 600,
              }}>
                {isLoading ? (
                  <>
                    <div style={{
                      width: 14, height: 14,
                      border: '2px solid rgba(96,165,250,0.3)',
                      borderTopColor: '#60a5fa',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Entering workspace…
                  </>
                ) : (
                  <>
                    Enter as {r.label.split(' ')[0]}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 'auto' }}>
                      <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Footer note ── */}
      <div
        style={{
          marginTop: '2.5rem',
          textAlign: 'center',
          opacity: mounted ? 0.45 : 0,
          transition: 'opacity 1s 0.4s',
        }}
      >
        <p style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          This is a fully isolated demo — no real data is accessed or stored.
        </p>
        <p style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
          DANIELS DIAMOND REPORTER v6 · DEMO EDITION
        </p>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes floatUp {
          0%, 100% { transform: rotate(45deg) translateY(0px); opacity: 0.2; }
          50% { transform: rotate(45deg) translateY(-18px); opacity: 0.6; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .demo-role-card:not(:disabled):hover {
          border-color: rgba(96,165,250,0.55) !important;
          box-shadow: 0 0 60px rgba(59,130,246,0.25) !important;
          transform: translateY(-2px) scale(1.01) !important;
        }
        .demo-role-card:not(:disabled):active {
          transform: scale(0.98) !important;
        }
      `}</style>
    </div>
  );
};

export default DemoPortal;
