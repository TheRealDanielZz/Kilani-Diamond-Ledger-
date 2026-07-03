
import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Button } from './UI';

interface ImageUploadProps {
  label?: string;
  value?: string; // base64
  onChange: (base64: string | undefined, source?: 'Camera' | 'Device Gallery') => void;
  required?: boolean;
  className?: string;
}

export const generateThumbnail = (base64: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_DIMENSION = 150; 
      
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.onerror = (err) => reject(err);
  });
};

// Helper to compress image
export const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Limit both width and height to 600 to prevent exceeding Firestore 1MB document limit
        // Since multiple images can be stored in a single document array, we must keep them very small.
        const MAX_DIMENSION = 600; 
        
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG 0.6 quality to keep size small (usually < 100KB)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
        // Check size, if still too large (> 200KB), compress further
        if (dataUrl.length > 200000) {
          resolve(canvas.toDataURL('image/jpeg', 0.4));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const ImageUpload: React.FC<ImageUploadProps> = ({ label, value, onChange, required, className = '' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clickedSourceRef = React.useRef<'Camera' | 'Device Gallery'>('Device Gallery');
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed, clickedSourceRef.current);
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
        onClick={() => {
          if (!value && fileInputRef.current) {
            clickedSourceRef.current = 'Device Gallery';
            fileInputRef.current.removeAttribute('capture');
            fileInputRef.current.click();
          }
        }}
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
          className="hidden" 
          onChange={handleFileChange}
        />

        {loading ? (
          <div className="flex flex-col items-center text-lux-gold">
            <Loader2 className="animate-spin mb-2" />
            <span className="text-xs">Processing...</span>
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
          <div className="flex flex-col items-center gap-4">
             <div className="flex gap-4">
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     if (fileInputRef.current) {
                       clickedSourceRef.current = 'Camera';
                       fileInputRef.current.setAttribute('capture', 'environment');
                       fileInputRef.current.click();
                     }
                   }}
                   className="flex flex-col items-center bg-zinc-800/80 hover:bg-zinc-700 p-4 rounded-2xl transition-all border border-zinc-700"
                 >
                    <Camera size={24} className="text-lux-gold mb-1" />
                    <span className="text-xs font-bold text-white">Camera</span>
                 </button>
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     if (fileInputRef.current) {
                       clickedSourceRef.current = 'Device Gallery';
                       fileInputRef.current.removeAttribute('capture');
                       fileInputRef.current.click();
                     }
                   }}
                   className="flex flex-col items-center bg-zinc-800/80 hover:bg-zinc-700 p-4 rounded-2xl transition-all border border-zinc-700"
                 >
                    <ImageIcon size={24} className="text-blue-400 mb-1" />
                    <span className="text-xs font-bold text-white">Gallery</span>
                 </button>
             </div>
             <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Select Source</span>
          </div>
        )}
      </div>
      {required && !value && <p className="text-[10px] text-red-400 mt-1.5 text-center flex items-center justify-center gap-1">Photo required to proceed</p>}
    </div>
  );
};
