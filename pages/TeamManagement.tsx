
import React, { useState, useRef, useEffect } from 'react';
import { store } from '../services/store';
import { User, Role } from '../types';
import { Card, Input, Button, SetterAvatar, Badge } from '../components/UI';
import { useToast } from '../App';
import { Plus, Edit2, Upload, Trash2, AlertTriangle, Key, Mail, User as UserIcon, Eye, EyeOff } from 'lucide-react';

const PRESET_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#64748b'];

const TeamManagement: React.FC = () => {
  const showToast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const currentUser = store.getCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'STAFF' | 'SALES'>('STAFF');
  
  // Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  
  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    name: '', email: '', password: '', role: Role.SETTER, setterColor: PRESET_COLORS[0], profilePhoto: '', active: true, onboarding: { needsOnboarding: true }
  });

  useEffect(() => {
    // Subscribe to real-time updates from store
    const updateLocalState = () => {
        setUsers([...store.getUsers()]);
    };
    
    // Initial fetch
    updateLocalState();
    
    // Listen for changes
    const unsubscribe = store.subscribe(updateLocalState);
    return () => unsubscribe();
  }, []);

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({ ...user });
    setShowPassword(false);
    setResetMode(false);
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ 
        name: '', 
        email: activeTab === 'SALES' ? `sales-${Date.now()}@kilani.com` : '', 
        // Force empty password for Sales to avoid Auth creation
        password: '', 
        role: activeTab === 'SALES' ? Role.SALES_REP : Role.SETTER, 
        setterColor: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)], 
        profilePhoto: '', 
        active: true,
        onboarding: { needsOnboarding: true } 
    });
    setShowPassword(false);
    setResetMode(false);
    setIsEditing(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setLoading(true);
    try {
       await store.deleteUser(userToDelete);
       showToast("User Deleted");
       setDeleteModalOpen(false);
       setUserToDelete(null);
       if (editingId === userToDelete) setIsEditing(false);
    } catch(e: any) {
       console.error(e);
       alert(e.message || "Failed to delete user.");
    } finally {
       setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) return alert("Name is required");
    if (activeTab === 'STAFF' && !formData.email) return alert("Email is required");
    if (activeTab === 'STAFF' && !editingId && (!formData.password || formData.password.length < 6)) return alert("Password must be at least 6 characters");

    setLoading(true);
    
    const userPayload = { 
      ...formData,
      // If editing, keep ID. If new, let store handle ID generation (or use temp ID logic if desired)
      id: editingId || 'temp-' + Date.now() 
    } as User;
    
    try {
        if (editingId) {
            await store.updateUser(userPayload);
            showToast("Profile Updated");
        } else {
            await store.createUser(userPayload);
            showToast("User Profile & Login Created");
        }
        setIsEditing(false);
    } catch (e: any) {
        console.error(e);
        alert(e.message || "Failed to save user.");
    } finally {
        setLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
      if (!formData.email) return;
      if (confirm(`Send password reset email to ${formData.email}?`)) {
          try {
              await store.requestPasswordReset(formData.email);
              alert("Reset link sent! The user can now set a new password.");
          } catch (e: any) {
              alert(e.message);
          }
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) return alert("File too large (Max 2MB)");
      const reader = new FileReader();
      reader.onloadend = () => setFormData(p => ({ ...p, profilePhoto: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  // Filter based on tab
  const filteredUsers = users.filter(u => activeTab === 'SALES' ? u.role === Role.SALES_REP : u.role !== Role.SALES_REP);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Management</h1>
          <p className="text-zinc-500 text-sm">Manage workspace access and personnel.</p>
        </div>
        <Button onClick={handleCreate} icon={<Plus size={18} />}>
            {activeTab === 'SALES' ? 'Add Sales Rep' : 'Add Member'}
        </Button>
      </div>

      <div className="flex border-b border-zinc-800 mb-6">
         <button onClick={() => setActiveTab('STAFF')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'STAFF' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Staff & Users</button>
         <button onClick={() => setActiveTab('SALES')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'SALES' ? 'border-lux-gold text-lux-gold' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Sales Reps</button>
      </div>
      
      {filteredUsers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
              <p className="text-zinc-500">No users found in this category.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map(u => (
              <Card key={u.id} className="p-5 flex items-center gap-4 hover:border-lux-gold/50 group transition-all">
                <SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                     <h3 className="font-bold text-white text-lg truncate pr-2">{u.name}</h3>
                     <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(u)} className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"><Edit2 size={16} /></button>
                        {u.id !== currentUser?.id && (
                            <button onClick={() => { setUserToDelete(u.id); setDeleteModalOpen(true); }} className="p-1.5 text-zinc-400 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"><Trash2 size={16} /></button>
                        )}
                     </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                     <Badge color="gray">{u.role.replace('_', ' ')}</Badge>
                     {!u.active && <Badge color="red">Inactive</Badge>}
                  </div>
                  {u.role !== Role.SALES_REP && <p className="text-xs text-zinc-500 truncate">{u.email}</p>}
                </div>
              </Card>
            ))}
          </div>
      )}

      {/* EDIT / CREATE MODAL */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-8 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto bg-[#1F2128] border-lux-border shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-6">
                {editingId ? 'Edit Profile' : activeTab === 'SALES' ? 'New Sales Rep' : 'New Team Member'}
            </h2>
            
            <div className="space-y-5">
               {/* Avatar Section */}
               <div className="flex items-center gap-4 mb-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <SetterAvatar name={formData.name || '?'} color={formData.setterColor} image={formData.profilePhoto} size="lg" />
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload size={14} className="text-white"/>
                    </div>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  
                  <div className="flex-1">
                    {activeTab === 'STAFF' ? (
                        <>
                            <label className="text-xs font-bold text-zinc-500 uppercase">System Role</label>
                            <select 
                                className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white mt-1 focus:ring-lux-gold focus:border-lux-gold" 
                                value={formData.role} 
                                onChange={e => setFormData({...formData, role: e.target.value as Role})}
                            >
                                <option value={Role.SETTER}>Setter</option>
                                <option value={Role.JEWELLER}>Jeweller</option>
                                <option value={Role.DESIGNER}>Designer</option>
                                <option value={Role.MANAGER}>Manager</option>
                            </select>
                        </>
                    ) : (
                        <div className="text-sm text-zinc-400">Sales Representatives do not have login access by default.</div>
                    )}
                  </div>
               </div>

               {/* Core Info */}
               <Input 
                  label="Full Name" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="e.g. John Smith"
                  icon={<UserIcon size={16} />}
                  autoFocus 
               />
               
               {activeTab === 'STAFF' && (
                   <div className="space-y-4 pt-2">
                    <Input 
                        label="Email Address (Login)" 
                        type="email" 
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        icon={<Mail size={16} />}
                    />
                    
                    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                        {!editingId || resetMode ? (
                            <div className="relative animate-in fade-in">
                                <Input 
                                    label="Password (Login)" 
                                    type={showPassword ? "text" : "password"} 
                                    placeholder={editingId ? "Update password..." : "Create a password..."} 
                                    value={formData.password} 
                                    onChange={e => setFormData({...formData, password: e.target.value})} 
                                    icon={<Key size={16} />}
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-[40px] text-zinc-500 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                                {editingId && (
                                     <button onClick={() => setResetMode(false)} className="text-xs text-zinc-500 mt-2 hover:text-white">Cancel Password Change</button>
                                )}
                            </div>
                        ) : (
                             <div className="flex justify-between items-center">
                                 <span className="text-sm text-zinc-400 font-medium">Password Hidden</span>
                                 <div className="flex gap-2">
                                     <button 
                                        type="button" 
                                        onClick={() => setResetMode(true)} 
                                        className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-white font-medium transition-colors"
                                    >
                                        Change Manually
                                    </button>
                                     <button 
                                        type="button" 
                                        onClick={handleSendResetEmail} 
                                        className="text-xs bg-lux-gold/10 hover:bg-lux-gold/20 text-lux-gold px-3 py-1.5 rounded-lg font-medium transition-colors"
                                    >
                                        Send Reset Email
                                    </button>
                                 </div>
                             </div>
                        )}
                        
                        <p className="text-[10px] text-zinc-500 italic mt-2">
                            {editingId && resetMode ? "Note: Changing password manually requires re-authentication in some cases. Reset Email is recommended." : ""}
                        </p>
                    </div>
                   </div>
               )}
               
               {/* Color Picker */}
               <div>
                 <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase">Avatar Color</label>
                 <div className="flex gap-2 flex-wrap">
                   {PRESET_COLORS.map(c => (
                     <button 
                        key={c} 
                        onClick={() => setFormData({...formData, setterColor: c})} 
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${formData.setterColor === c ? 'border-white scale-110 shadow-glow' : 'border-transparent hover:scale-105'}`} 
                        style={{backgroundColor: c}} 
                     />
                   ))}
                 </div>
               </div>
               
               {/* Active Toggle */}
               <div className="flex flex-col gap-3 pt-4 border-t border-zinc-800">
                 <div className="flex items-center gap-3">
                    <input 
                        type="checkbox" 
                        id="active" 
                        checked={formData.active} 
                        onChange={e => setFormData({...formData, active: e.target.checked})} 
                        className="w-5 h-5 rounded border-zinc-700 bg-black text-lux-gold focus:ring-0 cursor-pointer" 
                    />
                    <label htmlFor="active" className="text-sm font-medium text-white cursor-pointer select-none">Active Account</label>
                 </div>
               </div>
            </div>
            
            <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800">
                <Button variant="secondary" onClick={() => setIsEditing(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleSave} loading={loading} className="flex-1">
                    {editingId ? 'Save Changes' : 'Create & Sync'}
                </Button>
            </div>
          </Card>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
           <Card className="w-full max-w-sm p-6 border-red-500/30 bg-[#1F2128] shadow-2xl animate-in zoom-in-95">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20 text-red-500">
                    <AlertTriangle size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-white mb-2">Delete User?</h3>
                 <p className="text-zinc-400 text-sm mb-6">
                    This will permanently remove the user profile from the database.
                 </p>
                 <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} className="flex-1">Cancel</Button>
                    <Button variant="danger" onClick={confirmDeleteUser} className="flex-1" loading={loading}>Confirm Delete</Button>
                 </div>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;