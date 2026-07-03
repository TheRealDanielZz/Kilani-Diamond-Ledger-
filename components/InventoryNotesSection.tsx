import React, { useState, useRef, useEffect } from 'react';
import { store } from '../services/store';
import { User, Role, Diamond, DiamondSpec, InventoryNote, NoteAuditEntry } from '../types';
import { Button } from './UI';
import { Send, Trash2, Edit3, RotateCcw, MessageSquare, History, Calendar, ShieldAlert } from 'lucide-react';

interface InventoryNotesSectionProps {
  item: Diamond | DiamondSpec;
  itemType: 'diamond' | 'spec';
  currentUser: User | null;
  onSave: (text: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRestore: (prevValue: string) => Promise<void>;
}

export const InventoryNotesSection: React.FC<InventoryNotesSectionProps> = ({
  item,
  itemType,
  currentUser,
  onSave,
  onDelete,
  onRestore,
}) => {
  const itemLocation = itemType === 'spec' ? 'Melee' : (item as Diamond).location;
  const hasAccess = store.hasLocationAccess(currentUser, itemLocation);

  const [isEditing, setIsEditing] = useState(false);
  const [noteText, setNoteText] = useState(item.inventoryNote?.text || '');
  const [showHistory, setShowHistory] = useState(false);

  // Mentions autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [filteredManagers, setFilteredManagers] = useState<User[]>([]);
  const [triggerPos, setTriggerPos] = useState<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNoteText(item.inventoryNote?.text || '');
  }, [item.inventoryNote]);

  if (!hasAccess) {
    return (
      <div className="bg-red-950/20 border border-red-900/30 rounded-2xl p-4 flex items-center gap-3 text-red-400">
        <ShieldAlert size={20} />
        <span className="text-xs font-semibold">
          You do not have permission to view inventory notes for the {itemLocation} location.
        </span>
      </div>
    );
  }

  const managers = store.getUsers().filter(u => u.role === Role.MANAGER);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteText(val);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, selectionStart);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]))) {
      const query = textBeforeCursor.slice(lastAt + 1);
      if (!/\s/.test(query)) {
        setMentionQuery(query);
        setTriggerPos(lastAt);
        const filtered = managers.filter(u =>
          u.name.toLowerCase().includes(query.toLowerCase())
        );
        setFilteredManagers(filtered);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
    setFilteredManagers([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredManagers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredManagers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredManagers.length) % filteredManagers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredManagers[mentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setFilteredManagers([]);
      }
    }
  };

  const insertMention = (user: User) => {
    if (triggerPos === -1 || !textareaRef.current) return;
    const val = noteText;
    const before = val.slice(0, triggerPos);
    const after = val.slice(textareaRef.current.selectionStart);
    const inserted = `@${user.name} `;
    const newVal = before + inserted + after;
    setNoteText(newVal);
    setMentionQuery(null);
    setFilteredManagers([]);
    
    // Reset cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const cursor = triggerPos + inserted.length;
        textareaRef.current.setSelectionRange(cursor, cursor);
      }
    }, 10);
  };

  const handleSave = async () => {
    if (!noteText.trim()) return;
    await onSave(noteText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setNoteText(item.inventoryNote?.text || '');
    setIsEditing(false);
    setMentionQuery(null);
    setFilteredManagers([]);
  };

  const canEdit = !item.inventoryNote || 
    currentUser?.role === Role.MANAGER || 
    currentUser?.id === item.inventoryNote.authorId;

  const isManager = currentUser?.role === Role.MANAGER;

  // Render mentions with shiny gold styling
  const renderNoteWithMentions = (text: string) => {
    if (!text) return null;
    const userNames = managers.map(u => u.name);
    userNames.sort((a, b) => b.length - a.length);

    const regexStr = `@(${userNames.map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')}|[A-Za-z0-9_]+)`;
    const regex = new RegExp(regexStr, 'g');

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const matchText = match[0];
      if (matchIndex > lastIndex) {
        elements.push(text.substring(lastIndex, matchIndex));
      }
      elements.push(
        <span key={matchIndex} className="text-lux-gold font-bold bg-lux-gold/10 px-1.5 py-0.5 rounded border border-lux-gold/25 text-[11px] inline-block font-mono">
          {matchText}
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }
    return <span className="whitespace-pre-wrap leading-relaxed text-zinc-200 text-xs">{elements.length > 0 ? elements : text}</span>;
  };

  const auditTrail = [...(item.noteAuditTrail || [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="w-full bg-zinc-950/80 rounded-2xl border border-zinc-800 p-5 mt-4 relative z-10 transition-all duration-300 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-4">
        <div className="flex items-center gap-2 text-lux-gold">
          <MessageSquare size={16} />
          <span className="font-serif font-bold text-sm tracking-wide">Inventory Ledger Notes</span>
        </div>
        <div className="flex items-center gap-2">
          {item.inventoryNote && (
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
              Author: {item.inventoryNote.authorName}
            </span>
          )}
          {item.inventoryNote && !isEditing && canEdit && (
            <button 
              onClick={() => setIsEditing(true)} 
              className="text-zinc-400 hover:text-lux-gold transition-colors p-1"
              title="Edit Note"
            >
              <Edit3 size={14} />
            </button>
          )}
          {item.inventoryNote && isManager && (
            <button 
              onClick={onDelete} 
              className="text-zinc-500 hover:text-red-400 transition-colors p-1"
              title="Delete Note"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {isEditing || !item.inventoryNote ? (
        <div className="space-y-3 relative">
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={!canEdit}
            placeholder={canEdit ? "Type a note... Use @ name to mention Managers." : "You are not authorized to edit this note."}
            rows={3}
            className="w-full bg-black/60 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-lux-gold/50 focus:ring-1 focus:ring-lux-gold/20 transition-all leading-relaxed resize-none"
          />

          {mentionQuery !== null && filteredManagers.length > 0 && (
            <div className="absolute left-0 bottom-full mb-1 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto">
              <div className="px-3 py-1.5 border-b border-white/[0.04] bg-black/20">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">Mention Managers</span>
              </div>
              {filteredManagers.map((user, idx) => (
                <div
                  key={user.id}
                  onClick={() => insertMention(user)}
                  className={`px-3 py-2 text-xs flex justify-between items-center cursor-pointer transition-colors ${
                    idx === mentionIndex ? 'bg-lux-gold/15 text-lux-gold' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-bold">{user.name}</span>
                  <span className="text-[10px] text-zinc-500">{user.email}</span>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="flex justify-end gap-2">
              {item.inventoryNote && (
                <Button size="sm" variant="secondary" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={handleSave} className="flex items-center gap-1.5 bg-lux-gold hover:bg-lux-gold-dark text-black border-none font-bold">
                <Send size={12} />
                Save Note
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-black/40 border border-white/[0.03] rounded-xl p-4 leading-relaxed">
            {renderNoteWithMentions(item.inventoryNote.text)}
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/[0.02] text-[10px] text-zinc-500 font-mono">
              <span>Created {new Date(item.inventoryNote.createdAt).toLocaleString()}</span>
              {item.inventoryNote.edited && (
                <span>Last Edited {new Date(item.inventoryNote.lastEditedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {auditTrail.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.03]">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 font-bold transition-colors"
          >
            <History size={12} />
            {showHistory ? 'Hide History & Audit Trail' : `Show History & Audit Trail (${auditTrail.length})`}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
              {auditTrail.map((entry) => {
                const actionLabels: Record<string, string> = {
                  created: 'Created',
                  edited: 'Edited',
                  deleted: 'Deleted',
                  restored: 'Restored',
                  transferred: 'Transferred',
                };
                const actionColors: Record<string, string> = {
                  created: 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/30',
                  edited: 'bg-blue-950/20 text-blue-400 border border-blue-800/30',
                  deleted: 'bg-red-950/20 text-red-400 border border-red-800/30',
                  restored: 'bg-purple-950/20 text-purple-400 border border-purple-800/30',
                  transferred: 'bg-amber-950/20 text-amber-400 border border-amber-800/30',
                };

                return (
                  <div key={entry.id} className="bg-black/30 border border-zinc-900 rounded-xl p-3 text-[11px] flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${actionColors[entry.action] || 'bg-zinc-800'}`}>
                          {actionLabels[entry.action]}
                        </span>
                        <span className="font-bold text-zinc-400">{entry.userName} ({entry.userRole})</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="text-zinc-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                      {entry.action === 'transferred' ? (
                        <span>Transferred stock location from <strong className="text-zinc-400">{entry.prevValue}</strong> to <strong className="text-lux-gold">{entry.newValue}</strong></span>
                      ) : entry.action === 'deleted' ? (
                        <span className="text-zinc-500 italic">Note content cleared (was: "{entry.prevValue}")</span>
                      ) : (
                        <span>"{entry.newValue}"</span>
                      )}
                    </div>

                    {isManager && entry.action !== 'deleted' && entry.action !== 'transferred' && entry.newValue !== item.inventoryNote?.text && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => onRestore(entry.newValue)}
                          className="flex items-center gap-1 text-[10px] text-lux-gold hover:underline font-bold"
                        >
                          <RotateCcw size={10} />
                          Restore this note version
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
