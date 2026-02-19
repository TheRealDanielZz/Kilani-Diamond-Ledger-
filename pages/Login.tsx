
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
      <div className="flex flex-col items-center mb-8 z-10 animate-enter">
        <div className="w-24 h-24 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md rounded-3xl border border-white/10 flex items-center justify-center mb-6 shadow-glass transform rotate-6 hover:rotate-0 transition-transform duration-500 group">
            <Gem className="w-10 h-10 text-lux-gold drop-shadow-[0_0_25px_rgba(245,194,73,0.6)] group-hover:scale-110 transition-transform" />
        </div>
        <h1 className="text-5xl font-bold text-white tracking-tight mb-2 font-serif">KILANI</h1>
        <div className="flex items-center gap-3">
           <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/20"></div>
           <span className="text-[10px] font-bold text-lux-gold uppercase tracking-[0.3em] font-mono">Diamond Ledger</span>
           <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/20"></div>
        </div>
      </div>
      
      <Card className="w-full max-w-sm p-8 border-white/10 bg-[#1F2128]/70 shadow-2xl z-10 animate-enter transition-all duration-300">
        <h2 className="text-xl font-bold mb-6 text-white text-center">
          {isResetting ? 'Reset Password' : 'Sign in to workspace'}
        </h2>
        
        {isResetting ? (
          <form onSubmit={handleResetPassword} className="space-y-5 animate-in fade-in">
             <Input 
                label="Email Address" 
                type="email" 
                placeholder="name@company.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                icon={<Mail size={16} />}
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
              <Input label="Email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <div>
                <Input label="Password" type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
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
      
      <div className="mt-8 flex flex-col items-center gap-2 opacity-50">
        <div className="text-[10px] text-zinc-500 font-mono tracking-widest">SYSTEM V5.0 (CLOUD) • INTERNAL USE</div>
        <div className="text-[10px] text-zinc-600 font-sans tracking-wide">Designed by Daniel Zaery</div>
      </div>
    </div>
  );
};

export default Login;
