import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Building2, 
  MapPin, 
  Users, 
  ExternalLink, 
  Edit2, 
  Save, 
  X,
  CheckCircle2,
  AlertCircle,
  Globe,
  Star,
  Search
} from 'lucide-react';
import { Branch } from '../types';
import { cn } from '../lib/utils';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export default function BranchManagementView({ 
  branches, 
  onUpdateBranch,
  onAddBranchClick
}: { 
  branches: Branch[], 
  onUpdateBranch: (branch: Branch) => void,
  onAddBranchClick: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Branch>>({});
  const [placeQuery, setPlaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<google.maps.places.Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const placesLib = useMapsLibrary('places');

  const handlePlaceSearch = async () => {
    if (!placesLib || !placeQuery) return;
    setIsSearching(true);
    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: placeQuery,
        fields: ['displayName', 'formattedAddress', 'id'],
        maxResultCount: 5
      });
      setSearchResults(places || []);
    } catch (error) {
      console.error('Error searching places:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const startEditing = (branch: Branch) => {
    setEditingId(branch.id);
    setEditValues(branch);
    setPlaceQuery(branch.name);
    setSearchResults([]);
  };

  const handleSave = () => {
    if (editingId) {
      onUpdateBranch(editValues as Branch);
      setEditingId(null);
      setEditValues({});
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-main uppercase tracking-tight italic flex items-center gap-2">
            <Building2 className="text-brand-500" size={24} />
            Gestión de Sucursales
          </h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest mt-1">Configuración y links operativos de puntos de venta</p>
        </div>
        <button 
          onClick={onAddBranchClick}
          className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
        >
           NUEVA SUCURSAL
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((branch) => (
          <div key={branch.id} className={cn(
            "bg-bg-sidebar border rounded-lg p-6 transition-all relative overflow-hidden group",
            editingId === branch.id ? "border-brand-500 shadow-lg shadow-brand-500/5" : "border-border-dim hover:border-brand-500/50"
          )}>
            {editingId === branch.id ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Editando Sucursal</span>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)} className="p-1 text-text-dim hover:text-red-500">
                      <X size={16} />
                    </button>
                    <button onClick={handleSave} className="p-1 text-brand-500 hover:text-brand-600">
                      <Save size={16} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[8px] font-bold text-text-dim uppercase mb-1 block">Nombre</label>
                    <input 
                      type="text"
                      value={editValues.name || ''}
                      onChange={(e) => setEditValues({...editValues, name: e.target.value})}
                      className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-xs text-text-main outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-bold text-text-dim uppercase mb-1 block">Ubicación / Dirección</label>
                    <input 
                      type="text"
                      value={editValues.location || ''}
                      onChange={(e) => setEditValues({...editValues, location: e.target.value})}
                      className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-xs text-text-main outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-bold text-text-dim uppercase mb-1 block">Buscar en Google Maps</label>
                    <div className="flex gap-2">
                       <input 
                        type="text"
                        value={placeQuery}
                        onChange={(e) => setPlaceQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch()}
                        placeholder="Nombre o dirección para vincular..."
                        className="flex-1 bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-xs text-text-main outline-none focus:border-brand-500"
                      />
                      <button 
                        onClick={handlePlaceSearch}
                        disabled={isSearching}
                        className="bg-bg-accent hover:bg-brand-500 hover:text-black border border-border-dim px-3 rounded transition-all"
                      >
                         <Search size={14} className={isSearching ? "animate-spin" : ""} />
                      </button>
                    </div>
                    
                    {searchResults.length > 0 && (
                      <div className="mt-2 space-y-1 bg-bg-accent rounded border border-border-dim p-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {searchResults.map(place => (
                          <button
                            key={place.id}
                            onClick={() => {
                              setEditValues({
                                ...editValues, 
                                googlePlaceId: place.id || undefined,
                                location: place.formattedAddress || editValues.location,
                                name: place.displayName || editValues.name
                              });
                              setSearchResults([]);
                              setPlaceQuery(place.displayName || '');
                            }}
                            className="w-full text-left px-2 py-1.5 hover:bg-brand-500/10 rounded group transition-all"
                          >
                            <p className="text-[10px] font-bold text-text-main group-hover:text-brand-500 line-clamp-1">{place.displayName}</p>
                            <p className="text-[8px] text-text-dim line-clamp-1 italic">{place.formattedAddress}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                     <label className="text-[8px] font-bold text-text-dim uppercase mb-1 block italic">Place ID (Vinculado)</label>
                     <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-sidebar border border-dashed border-border-dim rounded">
                        <Star size={10} className={editValues.googlePlaceId ? "text-yellow-500" : "text-text-dim"} />
                        <span className="text-[9px] font-mono text-text-dim truncate">{editValues.googlePlaceId || 'No vinculado'}</span>
                     </div>
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-text-dim uppercase mb-1 block">Google Maps URL</label>
                    <input 
                      type="text"
                      value={editValues.googleMapsUrl || ''}
                      onChange={(e) => setEditValues({...editValues, googleMapsUrl: e.target.value})}
                      placeholder="https://maps.google.com/..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-xs font-mono text-text-main outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-bold text-text-dim uppercase mb-1 block">Google Reviews URL</label>
                    <input 
                      type="text"
                      value={editValues.googleReviewUrl || ''}
                      onChange={(e) => setEditValues({...editValues, googleReviewUrl: e.target.value})}
                      placeholder="https://search.google.com/local/writereview?..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-xs font-mono text-text-main outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border-dim flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={editValues.isActive}
                      onChange={(e) => setEditValues({...editValues, isActive: e.target.checked})}
                      id={`active-${branch.id}`}
                      className="rounded border-border-dim bg-bg-accent text-brand-500 focus:ring-brand-500"
                    />
                    <label htmlFor={`active-${branch.id}`} className="text-[10px] font-bold uppercase text-text-dim cursor-pointer">Sucursal Activa</label>
                  </div>
                  <button 
                    onClick={handleSave}
                    className="bg-brand-500 text-black px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2"
                  >
                    <Save size={12} /> Guardar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                    onClick={() => startEditing(branch)}
                    className="bg-bg-accent hover:bg-brand-500 hover:text-black text-text-dim p-2 rounded-full border border-border-dim transition-all"
                   >
                      <Edit2 size={14} />
                   </button>
                </div>

                <div className="flex items-center gap-4 mb-6">
                   <div className="bg-brand-500/10 p-3 rounded text-brand-500 border border-brand-500/20">
                      <Building2 size={24} />
                   </div>
                   <div className="flex-1 min-w-0">
                      <h3 className="font-black text-text-main text-lg uppercase tracking-tighter truncate">{branch.name}</h3>
                      <div className="flex items-center gap-1.5 text-text-dim">
                        <MapPin size={10} className="text-brand-500" />
                        <p className="text-[10px] font-bold uppercase tracking-widest truncate">{branch.location || 'Sin dirección'}</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border-dim">
                   <div className="flex justify-between items-center">
                      <span className="text-[9px] text-text-dim uppercase font-bold tracking-widest">Estado Operativo</span>
                      {branch.isActive ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-tighter flex items-center gap-1">
                          <CheckCircle2 size={10} /> Activa
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[8px] font-black uppercase tracking-tighter flex items-center gap-1">
                          <AlertCircle size={10} /> Inactiva
                        </span>
                      )}
                   </div>
                   
                   <div className="pt-2 flex flex-col gap-2">
                      <div className="flex justify-between items-center p-2 bg-bg-accent rounded border border-border-dim/50">
                        <div className="flex items-center gap-2">
                          <Globe size={12} className={branch.googleMapsUrl ? "text-brand-500" : "text-text-dim"} />
                          <span className="text-[9px] font-bold text-text-dim uppercase">Google Maps</span>
                        </div>
                        {branch.googleMapsUrl ? (
                          <a href={branch.googleMapsUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-600">
                            <ExternalLink size={12} />
                          </a>
                        ) : <span className="text-[9px] text-text-dim/40 italic">No cargado</span>}
                      </div>

                      <div className="flex justify-between items-center p-2 bg-bg-accent rounded border border-border-dim/50">
                        <div className="flex items-center gap-2">
                          <Star size={12} className={branch.googleReviewUrl ? "text-yellow-500" : "text-text-dim"} />
                          <span className="text-[9px] font-bold text-text-dim uppercase">Google Review Link</span>
                        </div>
                        {branch.googleReviewUrl ? (
                          <a href={branch.googleReviewUrl} target="_blank" rel="noreferrer" className="text-yellow-500 hover:text-yellow-600">
                            <ExternalLink size={12} />
                          </a>
                        ) : <span className="text-[9px] text-text-dim/40 italic">No cargado</span>}
                      </div>
                   </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="p-6 bg-brand-500/5 border border-brand-500/20 rounded-lg flex items-center gap-4">
        <div className="p-2 bg-brand-500/10 rounded-full text-brand-500">
          <AlertCircle size={20} />
        </div>
        <p className="text-[11px] text-text-dim font-medium leading-relaxed italic">
          Los links configurados aquí se utilizan en el dashboard principal y en el módulo de Desempeño para acceso rápido por parte de los supervisores.
        </p>
      </div>
    </motion.div>
  );
}
