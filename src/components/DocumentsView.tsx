import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  File, 
  FileText, 
  Upload, 
  Trash2, 
  Plus, 
  ChevronRight, 
  ChevronLeft,
  FileImage,
  FileArchive,
  Download,
  Loader2,
  FolderPlus,
  MoreVertical,
  Search,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Document {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parent_id: string | null;
  branch_id?: string | null;
  storage_path: string | null;
  file_size?: number;
  content_type?: string;
  created_at: string;
}

interface DocumentsViewProps {
  mode: 'encargado' | 'administracion';
  branchId?: string | 'all';
  branchName?: string;
  branches?: any[];
  onBranchSelect?: (id: string) => void;
  isReadOnly?: boolean;
}

export default function DocumentsView({ mode, branchId, branchName, branches = [], onBranchSelect, isReadOnly }: DocumentsViewProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [navigationStack, setNavigationStack] = useState<{ id: string | null, name: string }[]>([{ id: null, name: 'Raíz' }]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDocuments();
  }, [currentFolderId, branchId, mode]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      if (mode === 'encargado' && branchId === 'all' && currentFolderId === null) {
        // Special case: Root of Encargado mode with "All Branches"
        // We show virtual branch folders (or real ones if we had a better schema)
        // For now, let's just use the branches list to show "folders"
        setDocuments([]); // We'll handle this in the render
        setLoading(false);
        return;
      }

      let query = supabase
        .from('documents')
        .select('*')
        .eq('parent_id', currentFolderId);

      if (mode === 'administracion') {
        query = query.is('branch_id', null);
      } else {
        if (branchId && branchId !== 'all') {
          query = query.eq('branch_id', branchId);
        }
      }

      const { data, error } = await query.order('type', { ascending: false }).order('name');

      if (error) {
        console.error('Error fetching documents:', error);
        // Table might not exist, we'll try to create it "lazily" in concept
        // but for now just show empty.
        setDocuments([]);
      } else {
        setDocuments(data || []);
      }
    } catch (err) {
      console.error('Documents fetch catch:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateInto = (folder: Document) => {
    setCurrentFolderId(folder.id);
    setNavigationStack([...navigationStack, { id: folder.id, name: folder.name }]);
  };

  const handleNavigateBack = (index: number) => {
    const newStack = navigationStack.slice(0, index + 1);
    const target = newStack[newStack.length - 1];
    setNavigationStack(newStack);
    setCurrentFolderId(target.id);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    if (isReadOnly) {
      alert('Modo Solo Lectura activado. No tienes permisos para crear carpetas.');
      return;
    }

    try {
      const { error } = await supabase.from('documents').insert([
        {
          name: newFolderName,
          type: 'folder',
          parent_id: currentFolderId,
          branch_id: mode === 'encargado' && branchId !== 'all' ? branchId : null,
          category: 'folder', // Satisfy real Supabase schema NOT NULL constraint
          url: 'folder'       // Satisfy real Supabase schema NOT NULL constraint
        }
      ]);

      if (error) throw error;

      setNewFolderName('');
      setShowNewFolderModal(false);
      fetchDocuments();
    } catch (err: any) {
      console.error('Error creating folder:', err);
      alert(`Error al crear carpeta: ${err.message || JSON.stringify(err)}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isReadOnly) {
      alert('Modo Solo Lectura activado. No tienes permisos para subir archivos.');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload to Storage
      const fileName = `${Date.now()}_${file.name}`;
      const path = `${mode}/${branchId || 'general'}/${fileName}`;
      
      const { data: storageData, error: storageError } = await supabase.storage
        .from('documents')
        .upload(path, file);

      if (storageError) throw storageError;

      // 2. Insert metadata into DB
      const { error: dbError } = await supabase.from('documents').insert([
        {
          name: file.name,
          type: 'file',
          parent_id: currentFolderId,
          branch_id: mode === 'encargado' && branchId !== 'all' ? branchId : null,
          storage_path: path,
          file_size: file.size,
          content_type: file.type,
          category: 'file', // Satisfy real Supabase schema NOT NULL constraint
          url: path        // Satisfy real Supabase schema NOT NULL constraint
        }
      ]);

      if (dbError) throw dbError;

      fetchDocuments();
    } catch (err: any) {
      console.error('Error uploading file:', err);
      alert(`Error al subir archivo: ${err.message || JSON.stringify(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (isReadOnly) {
      alert('Modo Solo Lectura activado. No tienes permisos para eliminar carpetas o archivos.');
      return;
    }
    if (!confirm(`¿Estás seguro de eliminar "${doc.name}"?`)) return;

    try {
      if (doc.type === 'file' && doc.storage_path) {
        await supabase.storage.from('documents').remove([doc.storage_path]);
      } else {
        // If folder, we should ideally delete children recursively
        // For simplicity now, just delete the entry
      }

      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;

      fetchDocuments();
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!doc.storage_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      if (error) throw error;

      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading:', err);
    }
  };

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (doc: Document) => {
    if (doc.type === 'folder') return <Folder className="text-brand-500" size={24} />;
    
    const type = doc.content_type || '';
    if (type.includes('image')) return <FileImage className="text-blue-500" size={24} />;
    if (type.includes('pdf')) return <FileText className="text-red-500" size={24} />;
    if (type.includes('zip') || type.includes('rar')) return <FileArchive className="text-yellow-500" size={24} />;
    return <File className="text-text-dim" size={24} />;
  };

  return (
    <div className="flex flex-col h-full bg-bg-sidebar/30 rounded-xl border border-border-dim overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border-dim bg-bg-sidebar/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 rounded-lg">
             <FileText className="text-brand-500" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-text-main uppercase tracking-widest">
              Papeles Importantes
            </h2>
            <div className="flex items-center gap-1 mt-0.5">
              {navigationStack.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight size={10} className="text-text-dim" />}
                  <button 
                    onClick={() => handleNavigateBack(i)}
                    className={cn(
                      "text-[10px] font-bold uppercase transition-colors",
                      i === navigationStack.length - 1 ? "text-brand-500" : "text-text-dim hover:text-text-main"
                    )}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
            <input 
              type="text"
              placeholder="Buscar documentos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-bg-accent border border-border-dim rounded-full pl-9 pr-4 py-1.5 text-xs outline-none focus:border-brand-500 transition-all w-48 focus:w-64"
            />
          </div>
          
          <button 
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-2 bg-bg-card border border-border-dim px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-text-main hover:bg-bg-accent transition-all"
          >
            <FolderPlus size={14} />
            Nueva Carpeta
          </button>

          <label className={cn(
            "flex items-center gap-2 bg-brand-500 text-black px-4 py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer hover:bg-brand-600 transition-all",
            uploading && "opacity-50 pointer-events-none"
          )}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir Archivo
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse text-text-dim">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p className="text-[10px] font-bold uppercase tracking-widest">Cargando archivos...</p>
          </div>
        ) : (mode === 'encargado' && branchId === 'all' && currentFolderId === null) ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
             {branches.map(b => (
               <motion.div 
                 key={b.id}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="group relative glass-card p-4 flex flex-col items-center text-center cursor-pointer hover:border-brand-500 bg-brand-500/5 transition-all"
                 onClick={() => onBranchSelect?.(b.id)}
               >
                 <div className="mb-3 transform group-hover:scale-110 transition-transform">
                   <Folder className="text-brand-500 fill-brand-500/20" size={32} />
                 </div>
                 <p className="text-[10px] font-black text-text-main uppercase leading-tight">
                   {b.name}
                 </p>
                 <p className="text-[8px] text-text-dim uppercase mt-1">Carpeta Sucursal</p>
               </motion.div>
             ))}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <div className="bg-bg-accent p-6 rounded-full mb-4">
              <Folder size={48} className="text-text-dim" />
            </div>
            <p className="text-xs font-bold text-text-main uppercase tracking-widest">Esta carpeta está vacía</p>
            <p className="text-[10px] text-text-dim uppercase mt-1">Sube archivos o crea subcarpetas</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredDocuments.map((doc) => (
              <motion.div 
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group relative glass-card p-4 flex flex-col items-center text-center cursor-pointer hover:border-brand-500/50 transition-all",
                  doc.type === 'folder' ? "bg-brand-500/5" : "bg-bg-card"
                )}
                onDoubleClick={() => doc.type === 'folder' ? handleNavigateInto(doc) : handleDownload(doc)}
              >
                <div className="mb-3 transform group-hover:scale-110 transition-transform">
                  {getFileIcon(doc)}
                </div>
                <p className="text-[10px] font-bold text-text-main uppercase line-clamp-2 leading-tight break-all">
                  {doc.name}
                </p>
                {doc.type === 'file' && doc.file_size && (
                  <p className="text-[8px] text-text-dim font-mono mt-1">
                    {(doc.file_size / 1024).toFixed(1)} KB
                  </p>
                )}

                {/* Hover Actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   {doc.type === 'file' && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                       className="p-1.5 bg-bg-accent rounded-md text-text-dim hover:text-brand-500 hover:bg-brand-500/10 transition-all"
                       title="Descargar"
                     >
                       <Download size={12} />
                     </button>
                   )}
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                     className="p-1.5 bg-bg-accent rounded-md text-text-dim hover:text-red-500 hover:bg-red-500/10 transition-all"
                     title="Eliminar"
                   >
                     <Trash2 size={12} />
                   </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="px-6 py-3 bg-bg-sidebar/50 border-t border-border-dim flex justify-between items-center">
        <p className="text-[9px] text-text-dim font-mono uppercase">
           {filteredDocuments.length} Elementos {branchName ? `| Sucursal: ${branchName}` : ''}
        </p>
        <div className="flex items-center gap-2">
           <AlertCircle size={10} className="text-brand-500" />
           <p className="text-[8px] font-bold text-text-dim uppercase tracking-tighter italic">
             Los documentos son compartidos según el nivel de acceso
           </p>
        </div>
      </div>

      {/* New Folder Modal */}
      <AnimatePresence>
        {showNewFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-sidebar border border-border-dim p-8 rounded-lg w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xs font-black text-brand-500 uppercase tracking-widest mb-6 border-l-2 border-brand-500 pl-4">Nueva Carpeta</h3>
              <input 
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nombre de la carpeta"
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleCreateFolder}
                  className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all"
                >
                  Crear Carpeta
                </button>
                <button 
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-6 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
