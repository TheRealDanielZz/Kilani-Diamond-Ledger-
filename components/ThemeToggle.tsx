import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { motion } from 'motion/react';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-theme-text-primary hover:bg-theme-table-hover transition-all relative z-50 flex items-center justify-center cursor-pointer shadow-lg active:scale-95"
      aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
    >
      <motion.div
        initial={false}
        animate={{ rotate: theme === 'light' ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="flex items-center justify-center"
      >
        {theme === 'light' ? (
          <Sun size={20} className="text-lux-gold" />
        ) : (
          <Moon size={20} className="text-zinc-400" />
        )}
      </motion.div>
    </button>
  );
};
