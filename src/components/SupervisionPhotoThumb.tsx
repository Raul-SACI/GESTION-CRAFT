import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Miniatura de una foto de supervisión. Las fotos se guardan en el bucket privado
// "documents" (solo la ruta), así que acá pedimos una URL firmada para mostrarla.
export default function SupervisionPhotoThumb({ path, size = 56 }: { path: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from('documents').createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl || null);
    }).catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className="rounded bg-bg-accent animate-pulse" style={{ width: size, height: size }} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Ver foto en grande">
      <img src={url} alt="Foto de la supervisión" className="object-cover rounded border border-border-dim hover:opacity-80 transition-opacity" style={{ width: size, height: size }} />
    </a>
  );
}
