import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';
import { Card } from './UI';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#16171D] flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <Card className="border-red-500/30 p-8 max-w-lg w-full shadow-2xl flex flex-col items-center text-center z-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
              <AlertOctagon size={40} />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-white">Application Error</h1>
            <p className="text-zinc-400 mb-6 text-sm">
              We encountered an unexpected error. Don't worry, your data is safe in the cloud.
            </p>
            
            <div className="w-full bg-black/50 p-4 rounded-xl text-left overflow-auto max-h-40 mb-8 border border-white/5">
              <p className="text-red-400 font-mono text-xs whitespace-pre-wrap break-all">
                {this.state.error?.toString() || 'Unknown Error'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <button 
                onClick={() => window.location.reload()}
                className="flex-1 flex justify-center items-center gap-2 bg-lux-gold text-black px-6 py-3 rounded-xl font-bold hover:bg-lux-gold/90 transition-colors shadow-[0_0_15px_rgba(245,194,73,0.3)]"
              >
                <RefreshCw size={18} />
                Reload App
              </button>
              <button 
                onClick={() => window.location.href = '/'}
                className="flex-1 flex justify-center items-center gap-2 bg-white/5 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-colors border border-white/10"
              >
                <Home size={18} />
                Go Home
              </button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
