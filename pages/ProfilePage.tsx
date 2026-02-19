
import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { store } from '../services/store';
import { User } from '../types';
import { Card, Input, Button, SetterAvatar } from '../components/UI';
import { useToast } from '../App';
import { UserCog, Camera, Lock, Mail, Upload, GraduationCap, LogOut } from 'lucide-react';
import { useTour } from '../components/TourContext';

const ProfilePage: React.FC = () => {
  const showToast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { onLogout, user: contextUser } = useOutletContext<{ onLogout: () => void, user: User }>();
  const { startTour } = useTour();
  
  // Use the user from context as the initial source of truth
  const [user, setUser] = useState<User | undefined>(contextUser);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});

  useEffect(() => {
    if (contextUser) {
      setUser(contextUser);
      setFormData({ ...contextUser });
    }
  }, [contextUser]);

  if (!user) return <div className="p-8 text-center text-zinc-500">Loading Profile...</div>;

  const handleSave = async () => {
    if (user && formData.name && formData.email) {
       setLoading(true);
       
       // Basic validation
       if (formData.password && formData.password !== user.password) {
           const err = store.validatePassword(formData.password);
           if (err) {
               showToast(err);
               setLoading(false);
               return;
           }
       }

       try {
           await store.updateCurrentUserProfile({
               name: formData.name,
               email: formData.email,
               password: formData.password,
               setterColor: formData.setterColor,
               profilePhoto: formData.profilePhoto
           });
           
           showToast("Profile Updated Successfully");
           
           // Fetch latest user data to ensure UI sync
           const updatedUser = store.getUser(user.id);
           if(updatedUser) {
               setUser(updatedUser);
               setFormData({...updatedUser});
           }
           
       } catch (e: any) {
           console.error("Update failed", e);
           if (e.code === 'auth/requires-recent-login' || e.message?.includes('recent-login')) {
               alert("Security Update: Please log out and log back in to change your email or password.");
           } else {
               alert(`Update failed: ${e.message}`);
           }
       } finally {
           setLoading(false);
       }
    }
  };

  const handleReplayTutorial = () => {
     if (user) {
        startTour(user.role);
     }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        alert("File size too large. Please upload an image under 2MB.");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, profilePhoto: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 pb-24">
      <h1 data-tour="profile-header" className="text-2xl font-bold text-lux-cream mb-8 flex items-center gap-3">
        <UserCog className="text-lux-gold" size={28} /> My Profile
      </h1>

      <Card className="p-8 border-lux-border mb-6">
         <div className="flex flex-col items-center mb-8">
            <div 
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
               <SetterAvatar name={formData.name || '?'} color={formData.setterColor} image={formData.profilePhoto} size="lg" />
               <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ring-2 ring-lux-gold">
                 <Camera size={20} className="text-white" />
               </div>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 text-xs font-semibold text-lux-gold hover:text-white transition-colors flex items-center gap-2"
            >
              <Upload size={14} /> Change Photo
            </button>
            <p className="mt-2 text-[10px] text-zinc-500">
               Recommended: Square JPG/PNG, 400x400px (Max 2MB)
            </p>
         </div>

         <div className="space-y-6">
            <Input 
              label="Full Name" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Input 
                 label="Email Address" 
                 type="email"
                 value={formData.email} 
                 onChange={e => setFormData({...formData, email: e.target.value})} 
                 className="font-mono"
               />
               <Input 
                 label="Password" 
                 type="text"
                 value={formData.password} 
                 onChange={e => setFormData({...formData, password: e.target.value})} 
                 placeholder="Change password..."
               />
            </div>
            
            <div className="pt-6 flex justify-end border-t border-zinc-800">
               <Button size="lg" onClick={handleSave} loading={loading}>Save Changes</Button>
            </div>
         </div>
      </Card>

      <Card className="p-6 border-lux-border bg-lux-surface/50 mb-6">
         <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <GraduationCap size={20} className="text-zinc-500"/> Help & Learning
         </h3>
         <div className="flex justify-between items-center">
            <div className="text-sm text-zinc-400">
               Missed the introduction? Replay the new member tutorial.
            </div>
            <Button size="sm" variant="secondary" onClick={handleReplayTutorial}>Replay Tutorial</Button>
         </div>
      </Card>

      <div className="mt-8">
        <Button 
            variant="danger" 
            onClick={onLogout} 
            className="w-full flex items-center justify-center gap-2 py-4 shadow-lg"
        >
            <LogOut size={20} /> Sign Out
        </Button>
        <p className="text-center text-xs text-zinc-600 mt-4 font-mono">
            KILANI Ledger v5.0
        </p>
      </div>
    </div>
  );
};

export default ProfilePage;
