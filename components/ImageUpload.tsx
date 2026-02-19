
import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Button } from './UI';

interface ImageUploadProps {
  label?: string;
  value?: string; // base64
  onChange: (base64: string | undefined) => void;
  required?: boolean;
  className?: string;
}

// Helper to compress image
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Increased from 800 to 1600 thanks to IndexedDB
        const MAX_WIDTH = 1600; 
        const scaleSize = MAX_WIDTH / img.width;
        
        // If image is smaller than max, don't resize up
        const finalScale = scaleSize < 1 ? scaleSize : 1;
        
        canvas.width = img.width * finalScale;
        canvas.height = img.height * finalScale;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Compress to JPEG 0.85 quality (High Quality)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const ImageUpload: React.FC<ImageUploadProps> = ({ label, value, onChange, required, className = '' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } catch (err) {
      console.error(err);
      alert('Error processing image');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wide">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      
      <div 
        onClick={() => !value && fileInputRef.current?.click()}
        className={`
          relative w-full rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
          ${value ? 'border-lux-gold bg-black' : 'border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-500'}
          h-48 flex flex-col items-center justify-center
        `}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          capture="environment" // Prefer rear camera on mobile
          className="hidden" 
          onChange={handleFileChange}
        />

        {loading ? (
          <div className="flex flex-col items-center text-lux-gold">
            <Loader2 className="animate-spin mb-2" />
            <span className="text-xs">Compressing...</span>
          </div>
        ) : value ? (
          <>
            <img src={value} alt="Preview" className="w-full h-full object-contain" />
            <button 
              onClick={handleClear}
              className="absolute top-2 right-2 bg-red-500/80 text-white p-1.5 rounded-full hover:bg-red-500 transition-colors shadow-lg"
            >
              <X size={16} />
            </button>
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
              Tap to replace
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <div className="bg-zinc-800 p-3 rounded-full mb-3">
              <Camera size={24} />
            </div>
            <span className="text-sm font-semibold">Take Photo</span>
            <span className="text-[10px] mt-1 opacity-70">or upload from gallery</span>
          </div>
        )}
      </div>
      {required && !value && <p className="text-[10px] text-red-400 mt-1.5 text-center flex items-center justify-center gap-1">Photo required to proceed</p>}
    </div>
  );
};
