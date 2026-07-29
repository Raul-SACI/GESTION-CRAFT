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
  Eye,
  X,
  FolderPlus,
  MoreVertical,
  Search,
  AlertCircle,
  Link as LinkIcon,
  ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Document {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'link';
  parent_id: string | null;
  branch_id?: string | null;
  storage_path: string | null;
  url?: string | null;
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
  const [showNewLinkModal, setShowNewLinkModal] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [currentFolderId, branchId, mode]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      if (mode === 'encargado' && branchId === 'all' && currentFolderId === null) {
        // Raíz de "Todas": además de las carpetas virtuales por sucursal, mostramos
        // los documentos/carpetas compartidos para todas (branch_id = 'all').
        const { data: shared } = await supabase.from('documents').select('*')
          .is('parent_id', null).eq('branch_id', 'all')
          .order('type', { ascending: false }).order('name');
        setDocuments(shared || []);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('documents')
        .select('*');
      
      // Handle null parent_id correctly (root level)
      if (currentFolderId === null || currentFolderId === undefined) {
        query = query.is('parent_id', null);
      } else {
        query = query.eq('parent_id', currentFolderId);
      }

      // Filter by branch - administracion sees all, encargado sees their branch
      if (mode !== 'administracion') {
        if (branchId && branchId !== 'all') {
          if (branchId === '__mkt__') {
            query = query.eq('branch_id', branchId);
          } else {
            // Una sucursal ve sus documentos + los compartidos para "Todas" (branch_id = 'all')
            query = query.in('branch_id', [branchId, 'all']);
          }
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

  const handleCreateLink = async () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) {
      alert('Completá el título y el enlace.');
      return;
    }
    if (isReadOnly) {
      alert('Modo Solo Lectura activado. No tienes permisos para agregar enlaces.');
      return;
    }
    // Normalizar la URL (agregar https:// si falta)
    let url = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    try {
      const { error } = await supabase.from('documents').insert([
        {
          name: newLinkName.trim(),
          type: 'link',
          parent_id: currentFolderId,
          branch_id: branchId && branchId !== 'all' ? branchId : (mode === 'administracion' ? 'admin' : 'all'),
          category: 'link',
          url: url
        }
      ]);
      if (error) throw error;
      setNewLinkName('');
      setNewLinkUrl('');
      setShowNewLinkModal(false);
      fetchDocuments();
    } catch (err: any) {
      console.error('Error creating link:', err);
      alert(`Error al agregar enlace: ${err.message || JSON.stringify(err)}`);
    }
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
          branch_id: branchId && branchId !== 'all' ? branchId : (mode === 'administracion' ? 'admin' : 'all'),
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
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (isReadOnly) {
      alert('Modo Solo Lectura activado. No tienes permisos para subir archivos.');
      return;
    }

    setUploading(true);
    const errores: string[] = [];
    try {
      for (const file of files) {
        try {
          // 1. Upload to Storage
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${file.name}`;
          const path = `${mode}/${branchId || 'general'}/${fileName}`;

          const { error: storageError } = await supabase.storage
            .from('documents')
            .upload(path, file);

          if (storageError) throw storageError;

          // 2. Insert metadata into DB
          const { error: dbError } = await supabase.from('documents').insert([
            {
              name: file.name,
              type: 'file',
              parent_id: currentFolderId,
              branch_id: branchId && branchId !== 'all' ? branchId : (mode === 'administracion' ? 'admin' : 'all'),
              storage_path: path,
              file_size: file.size,
              content_type: file.type,
              category: 'file',
              url: path
            }
          ]);

          if (dbError) throw dbError;
        } catch (errFile: any) {
          errores.push(`${file.name}: ${errFile.message || 'error'}`);
        }
      }

      fetchDocuments();
      if (errores.length > 0) {
        alert(`Algunos archivos no se pudieron subir (${errores.length}):\n\n${errores.join('\n')}`);
      }
    } catch (err: any) {
      console.error('Error uploading files:', err);
      alert(`Error al subir archivos: ${err.message || JSON.stringify(err)}`);
    } finally {
      setUploading(false);
      e.target.value = ''; // permitir volver a elegir los mismos archivos
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

  // Detectar si un archivo es previsualizable (PDF o imagen) por su extensión
  const getExt = (name: string) => (name.split('.').pop() || '').toLowerCase();
  const isPreviewable = (name: string) => {
    const e = getExt(name);
    return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e);
  };
  const isImageExt = (name: string) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(getExt(name));

  const handlePreview = async (doc: Document) => {
    if (!doc.storage_path) return;
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 3600);
      if (error) throw error;
      setPreviewUrl(data?.signedUrl || null);
    } catch (err) {
      console.error('Error preview:', err);
      alert('No se pudo previsualizar el archivo. Probá descargarlo.');
      setPreviewDoc(null);
    }
    setPreviewLoading(false);
  };

  const closePreview = () => { setPreviewDoc(null); setPreviewUrl(null); };

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (doc: Document) => {
    if (doc.type === 'folder') return <Folder className="text-brand-500" size={24} />;
    if (doc.type === 'link') return <LinkIcon className="text-blue-500" size={24} />;
    
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

          <button 
            onClick={() => setShowNewLinkModal(true)}
            className="flex items-center gap-2 bg-bg-card border border-border-dim px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-text-main hover:bg-bg-accent transition-all"
          >
            <LinkIcon size={14} />
            Agregar Enlace
          </button>

          <label className={cn(
            "flex items-center gap-2 bg-brand-500 text-black px-4 py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer hover:bg-brand-600 transition-all",
            uploading && "opacity-50 pointer-events-none"
          )}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir Archivo
            <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
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
          <div className="space-y-6">
            {/* Compartido para todas las sucursales (branch_id = 'all') */}
            {filteredDocuments.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase text-brand-500 tracking-widest mb-2">Compartido · Todas las sucursales</p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredDocuments.map((doc) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className={cn("group relative glass-card p-4 flex flex-col items-center text-center cursor-pointer hover:border-brand-500/50 transition-all", doc.type === 'folder' ? "bg-brand-500/5" : "bg-bg-card")}
                      onDoubleClick={() => {
                        if (doc.type === 'folder') handleNavigateInto(doc);
                        else if (doc.type === 'link') { if (doc.url) window.open(doc.url, '_blank', 'noopener,noreferrer'); }
                        else if (isPreviewable(doc.name)) handlePreview(doc);
                        else handleDownload(doc);
                      }}
                    >
                      <div className="mb-3 transform group-hover:scale-110 transition-transform">{getFileIcon(doc)}</div>
                      <p className="text-[10px] font-bold text-text-main uppercase line-clamp-2 leading-tight break-all">{doc.name}</p>
                      <p className="text-[8px] text-text-dim uppercase mt-1">{doc.type === 'folder' ? 'Carpeta compartida' : 'Compartido'}</p>
                      {!isReadOnly && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-opacity"><Trash2 size={13} /></button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            {/* Carpetas por sucursal */}
            <div>
              <p className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-2">Por sucursal</p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {branches.map(b => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="group relative glass-card p-4 flex flex-col items-center text-center cursor-pointer hover:border-brand-500 bg-brand-500/5 transition-all"
                    onClick={() => onBranchSelect?.(b.id)}
                  >
                    <div className="mb-3 transform group-hover:scale-110 transition-transform">
                      <Folder className="text-brand-500 fill-brand-500/20" size={32} />
                    </div>
                    <p className="text-[10px] font-black text-text-main uppercase leading-tight">{b.name}</p>
                    <p className="text-[8px] text-text-dim uppercase mt-1">Carpeta Sucursal</p>
                  </motion.div>
                ))}
              </div>
            </div>
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
                onDoubleClick={() => {
                  if (doc.type === 'folder') handleNavigateInto(doc);
                  else if (doc.type === 'link') { if (doc.url) window.open(doc.url, '_blank', 'noopener,noreferrer'); }
                  else if (isPreviewable(doc.name)) handlePreview(doc);
                  else handleDownload(doc);
                }}
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
                   {doc.type === 'link' && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); if (doc.url) window.open(doc.url, '_blank', 'noopener,noreferrer'); }}
                       className="p-1.5 bg-bg-accent rounded-md text-text-dim hover:text-blue-500 hover:bg-blue-500/10 transition-all"
                       title="Abrir enlace"
                     >
                       <ExternalLink size={12} />
                     </button>
                   )}
                   {doc.type === 'file' && isPreviewable(doc.name) && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); handlePreview(doc); }}
                       className="p-1.5 bg-bg-accent rounded-md text-text-dim hover:text-brand-500 hover:bg-brand-500/10 transition-all"
                       title="Visualizar"
                     >
                       <Eye size={12} />
                     </button>
                   )}
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

      {/* New Link Modal */}
      <AnimatePresence>
        {showNewLinkModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-sidebar border border-border-dim p-8 rounded-lg w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-6 border-l-2 border-blue-500 pl-4">Agregar Enlace</h3>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Título</label>
              <input 
                type="text"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="Ej: Carpeta de Canva, Drive de fotos..."
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold mb-4"
                autoFocus
              />
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Enlace (URL)</label>
              <input 
                type="text"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLink()}
              />
              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleCreateLink}
                  className="flex-1 bg-blue-500 text-white py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all"
                >
                  Guardar Enlace
                </button>
                <button 
                  onClick={() => setShowNewLinkModal(false)}
                  className="px-6 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de previsualización */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={closePreview}>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim shrink-0">
              <p className="text-[11px] font-black uppercase text-text-main truncate">{previewDoc.name}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDownload(previewDoc)} title="Descargar"
                  className="p-2 rounded text-text-dim hover:text-brand-500 hover:bg-bg-accent transition-all"><Download size={16} /></button>
                <button onClick={closePreview} title="Cerrar"
                  className="p-2 rounded text-text-dim hover:text-red-500 hover:bg-bg-accent transition-all"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-bg-accent/20 flex items-center justify-center">
              {previewLoading ? (
                <Loader2 size={28} className="animate-spin text-brand-500" />
              ) : !previewUrl ? (
                <p className="text-[11px] text-text-dim font-bold uppercase">No se pudo cargar la vista previa.</p>
              ) : isImageExt(previewDoc.name) ? (
                <img src={previewUrl} alt={previewDoc.name} className="max-w-full max-h-full object-contain" />
              ) : (
                <iframe src={previewUrl} title={previewDoc.name} className="w-full h-full border-none" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
