import React, { useState, useRef } from 'react';
import { store } from '../services/store';
import { User, Role } from '../types';
import { Card, Input, Button, SetterAvatar, Badge } from '../components/UI';
import { useToast } from '../App';
import { Plus, Trash2, Edit2, Shield, User as UserIcon, Lock, Upload, X } from 'lucide-react';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', 
  '#8b5cf6', '#d946ef', '#f43f5e', '#64748b'
];

const SettersManagement: React.FC = () => {
  const showToast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<User[]>(store.getUsers().filter(u => u.role !== Role.MANAGER));
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    password: '',
    role: Role.SETTER,
    setterColor: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
    profilePhoto: '',
    active: true
  });

  const refreshList = () => {
    setUsers(store.getUsers().filter(u => u.role !== Role.MANAGER));
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({ ...user });
    setIsEditing(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: Role.SETTER,
      setterColor: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      profilePhoto: '',
      active: true
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.email) return alert("Name and Email are required");

    if (editingId) {
      const fullUser = store.getUser(editingId);
      if (fullUser) {
        const updated = { ...fullUser, ...formData } as User;
        store.updateUser(updated);
        showToast("User updated successfully");
      }
    } else {
      // Create new
      const newUser: User = {
        id: 'u-' + Math.random().toString(36).substr(2, 9),
        name: formData.name!,
        email: formData.email!,
        password: formData.password || '123456',
        role: formData.role || Role.SETTER,
        active: true,
        setterColor: formData.setterColor,
        profilePhoto: formData.profilePhoto,
      };
      store.createUser(newUser);
      showToast("New user created");
    }
    
    setIsEditing(false);
    refreshList();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB
        alert("File too large. Max 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, profilePhoto: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setFormData(prev => ({ ...prev, profilePhoto: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-lux-cream tracking-tight">Team Management</h1>
          <p className="text-zinc-500 text-sm">Manage Setters and Jewellers access.</p>
        </div>
        <Button onClick={handleCreate} icon={<Plus size={18} />}>Add Team Member</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map(u => (
          <Card key={u.id} className="p-5 flex items-start justify-between border-lux-border group hover:border-zinc-700 transition-colors">
            <div className="flex items-center gap-4">
              <SetterAvatar name={u.name} color={u.setterColor} image={u.profilePhoto} size="lg" />
              <div>
                <h3 className="font-bold text-lux-cream text-lg">{u.name}</h3>
                <div className="flex items-center gap-2 mb-1">
                   <Badge color="blue">{u.role}</Badge>
                   <span className="text-xs text-zinc-500">{u.email}</span>
                </div>
                {u.password && <div className="text-[10px] text-zinc-600 font-mono">Pass: ••••••</div>}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => handleEdit(u)} icon={<Edit2 size={14} />}>Edit</Button>
          </Card>
        ))}
      </div>

      {/* Edit/Create Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6 animate-in zoom-in-95 border-lux-border bg-lux-surface shadow-2xl">
            <h2 className="text-xl font-bold text-lux-cream mb-6">{editingId ? 'Edit User' : 'Add New Member'}</h2>
            
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <Input 
                    label="Full Name" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                 />
                 <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 ml-1">Role</label>
                    <select 
                      className="block w-full rounded-2xl border border-transparent bg-lux-input text-lux-cream shadow-inner focus:border-lux-gold focus:ring-0 text-sm px-4 py-3.5"
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value as Role})}
                    >
                      <option value={Role.SETTER}>Setter</option>
                      <option value={Role.JEWELLER}>Jeweller</option>
                    </select>
                 </div>
               </div>

               <Input 
                  label="Email Address" 
                  type="email"
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
               />

               <Input 
                  label="Login Password" 
                  type="text"
                  placeholder="Set a password..."
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
               />
               
               {/* Image Upload Area */}
               <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 ml-1">Profile Photo</label>
                  <div className="flex items-center gap-4 p-3 bg-lux-input rounded-2xl border border-transparent hover:border-zinc-700 transition-colors">
                     <SetterAvatar name={formData.name || '?'} color={formData.setterColor} image={formData.profilePhoto} size="md" />
                     
                     <div className="flex-1">
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          className="hidden" 
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                        <div className="flex gap-2">
                           <Button 
                             size="sm" 
                             variant="secondary" 
                             onClick={() => fileInputRef.current?.click()}
                             icon={<Upload size={14} />}
                           >
                             Upload
                           </Button>
                           {formData.profilePhoto && (
                             <Button 
                               size="sm" 
                               variant="danger" 
                               onClick={removePhoto}
                               icon={<X size={14} />}
                             >
                               Remove
                             </Button>
                           )}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-2">Recommended: 400x400px (Max 2MB)</p>
                     </div>
                  </div>
               </div>

               <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-2 ml-1">Avatar Color (Fallback)</label>
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
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-zinc-800">
              <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingId ? 'Save Changes' : 'Create User'}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SettersManagement;