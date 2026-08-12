
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card } from '../components/UI';
import { Gem, ArrowLeft, Mail } from 'lucide-react';
import { store } from '../services/store';

const Login: React.FC<{ onLogin: (email: string, pass?: string) => Promise<boolean> }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
        const success = await onLogin(email.trim(), password);
        if (success) {
           navigate('/');
        } else {
           setError('Account exists but has no access to this app. Contact Manager.');
        }
    } catch (e: any) {
        console.error("Login caught error:", e);
        let msg = e.message || "Login failed";
        // Map common codes even if message text varies
        if (msg.includes('invalid-credential') || msg.includes('wrong-password') || e.code === 'auth/invalid-credential') msg = "Incorrect email or password.";
        if (msg.includes('user-not-found') || e.code === 'auth/user-not-found') msg = "User not found.";
        if (msg.includes('too-many-requests') || e.code === 'auth/too-many-requests') msg = "Too many attempts. Try again later.";
        setError(msg);
    } finally {
        setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await store.requestPasswordReset(email);
      setMessage('Reset link sent successfully to your email.');
      // Optional: switch back to login after a delay
      setTimeout(() => setIsResetting(false), 5000);
    } catch (e: any) {
      console.error(e);
      let msg = e.message || "Failed to send reset link.";
      if (e.code === 'auth/user-not-found') msg = "No account found with this email.";
      if (e.code === 'auth/invalid-email') msg = "Invalid email format.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="flex flex-col items-center mb-10 z-10 animate-enter group">
        {store.isDemoMode ? (
          <>
            <div className="w-28 h-28 backdrop-blur-md rounded-3xl border border-blue-400/25 flex items-center justify-center mb-8 shadow-glass transform rotate-3 hover:rotate-0 transition-all duration-700 group-hover:border-blue-400/50" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(59,130,246,0.05))' }}>
              <svg width="52" height="52" viewBox="0 0 36 36" fill="none">
                <polygon points="18,3 33,12 33,24 18,33 3,24 3,12" fill="none" stroke="rgba(96,165,250,0.8)" strokeWidth="1.5"/>
                <polygon points="18,8 28,14 28,22 18,28 8,22 8,14" fill="rgba(59,130,246,0.2)" stroke="rgba(96,165,250,0.5)" strokeWidth="1"/>
                <circle cx="18" cy="18" r="3.5" fill="rgba(147,197,253,0.95)"/>
              </svg>
            </div>
            <div className="flex flex-col items-center">
              <h1 className="text-5xl font-bold text-white tracking-tight mb-2 font-serif group-hover:text-blue-300 transition-colors duration-500">DANIELS</h1>
              <div className="flex items-center gap-4 opacity-80">
                 <div className="h-px w-10 bg-gradient-to-r from-transparent to-blue-400/40"></div>
                 <span className="text-[11px] font-black text-blue-400 uppercase tracking-[0.4em] font-mono whitespace-nowrap">Diamond Reporter</span>
                 <div className="h-px w-10 bg-gradient-to-l from-transparent to-blue-400/40"></div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-28 h-28 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md rounded-3xl border border-white/10 flex items-center justify-center mb-8 shadow-glass transform rotate-3 hover:rotate-0 transition-all duration-700 overflow-hidden group-hover:shadow-lux-gold/20 group-hover:border-lux-gold/30">
                <img src="/brand-logo.jpg" alt="Kilani Logo" className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-1000" />
            </div>
            <div className="flex flex-col items-center">
              <h1 className="text-5xl font-bold text-white tracking-tight mb-2 font-serif group-hover:text-lux-gold transition-colors duration-500">KILANI</h1>
              <div className="flex items-center gap-4 opacity-80">
                 <div className="h-px w-10 bg-gradient-to-r from-transparent to-lux-gold/40"></div>
                 <span className="text-[11px] font-black text-lux-gold uppercase tracking-[0.4em] font-mono whitespace-nowrap">Diamond Ledger</span>
                 <div className="h-px w-10 bg-gradient-to-l from-transparent to-lux-gold/40"></div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <Card className="w-full max-w-sm p-8 border-white/10 shadow-2xl z-10 animate-enter transition-all duration-300 rounded-3xl">
        <h2 className="text-xl font-bold mb-6 text-white text-center">
          {isResetting ? 'Reset Password' : 'Sign in to workspace'}
        </h2>
        
        {isResetting ? (
          <form onSubmit={handleResetPassword} className="space-y-5 animate-in fade-in">
             <Input 
                id="reset-email"
                label="Email Address" 
                type="email" 
                placeholder="name@company.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                icon={<Mail size={16} />}
                autoComplete="email"
                autoFocus 
             />
             
             {error && <p className="text-sm text-red-400 bg-red-950/20 p-3 rounded-xl text-center border border-red-900/30 backdrop-blur-sm">{error}</p>}
             {message && <p className="text-sm text-green-400 bg-green-950/20 p-3 rounded-xl text-center border border-green-900/30 backdrop-blur-sm">{message}</p>}

             <Button type="submit" className="w-full h-14 text-base shadow-glow" size="lg" loading={loading}>
                Send Reset Link
             </Button>
             
             <button 
                type="button" 
                onClick={() => { setIsResetting(false); setError(''); setMessage(''); }}
                className="w-full text-center text-sm text-zinc-500 hover:text-white mt-4 flex items-center justify-center gap-2"
             >
                <ArrowLeft size={14} /> Back to Login
             </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in">
              <Input id="login-email" label="Email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
              <div>
                <Input id="login-password" label="Password" type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                <div className="text-right mt-1">
                   <button 
                      type="button" 
                      onClick={() => { setIsResetting(true); setError(''); }}
                      className="text-[11px] text-zinc-500 hover:text-lux-gold transition-colors font-medium"
                   >
                      Forgot Password?
                   </button>
                </div>
              </div>
              
              {error && <p className="text-sm text-red-400 bg-red-950/20 p-3 rounded-xl text-center border border-red-900/30 backdrop-blur-sm animate-in slide-in-from-top-2">{error}</p>}
              
              <Button type="submit" className="w-full h-14 text-base shadow-glow" size="lg" loading={loading}>Sign In</Button>
          </form>
        )}
      </Card>
      
      {store.isDemoMode && (
          <div className="w-full max-w-sm mt-6 p-5 bg-blue-500/5 border border-blue-400/20 rounded-2xl backdrop-blur-xl animate-enter flex flex-col items-center gap-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-blue-400 font-bold text-center">
                Demo Edition Active
              </div>
              <button
                onClick={() => navigate('/demo')}
                className="w-full h-11 rounded-xl border border-blue-400/25 bg-blue-500/10 text-blue-300 text-[12px] font-semibold hover:bg-blue-500/20 hover:border-blue-400/50 transition-all duration-200"
              >
                ← Back to Role Selection
              </button>
          </div>
      )}
      
      <div className="mt-8 flex flex-col items-center gap-2 opacity-50">
        <div className="text-[10px] text-zinc-500 font-mono tracking-widest">VERSION 7.0 (CLOUD) • INTERNAL USE</div>
        <div className="text-[10px] text-zinc-600 font-sans tracking-wide">Designed by Daniel ZaeryZadeh</div>
      </div>
    </div>
  );
};

export default Login;
