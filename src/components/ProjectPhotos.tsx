import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Photo = {
  id: string;
  storage_path: string;
  caption: string | null;
  taken_at: string;
  url?: string;
};

type Props = { projectId: string; readOnly?: boolean };

export default function ProjectPhotos({ projectId, readOnly = false }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchPhotos(); }, [projectId]);

  async function fetchPhotos() {
    const { data } = await supabase
      .from('project_photos')
      .select('id, storage_path, caption, taken_at')
      .eq('project_id', projectId)
      .order('taken_at', { ascending: false });
    if (data) {
      const withUrls = await Promise.all(data.map(async (p) => {
        const { data: urlData } = await supabase.storage.from('project-photos').createSignedUrl(p.storage_path, 3600);
        return { ...p, url: urlData?.signedUrl };
      }));
      setPhotos(withUrls);
    }
    setLoading(false);
  }

  async function uploadFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setUploading(true);
    for (const file of imageFiles) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('project-photos').upload(fileName, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        await supabase.from('project_photos').insert({ project_id: projectId, storage_path: fileName, taken_at: new Date().toISOString() });
      } catch (e) {
        alert(`Upload failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
    setUploading(false);
    fetchPhotos();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (readOnly) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }

  // Without this, a drop that misses the drop zone (or lands on a child
  // element) falls through to the browser default of navigating to the
  // file/opening it as a page, which silently aborts the upload.
  useEffect(() => {
    function preventNav(e: DragEvent) { e.preventDefault(); }
    window.addEventListener('dragover', preventNav);
    window.addEventListener('drop', preventNav);
    return () => {
      window.removeEventListener('dragover', preventNav);
      window.removeEventListener('drop', preventNav);
    };
  }, []);

  async function deletePhoto(photo: Photo) {
    if (!confirm('Delete this photo?')) return;
    await supabase.storage.from('project-photos').remove([photo.storage_path]);
    await supabase.from('project_photos').delete().eq('id', photo.id);
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    setLightboxIndex(null);
  }

  function goToPrev() {
    if (lightboxIndex !== null && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
  }
  function goToNext() {
    if (lightboxIndex !== null && lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
  }

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, photos.length]);

  const selectedPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="card-title">Photos</p>
        {!readOnly && (
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{ background: 'var(--bg-muted)', border: 'none', color: 'var(--text-accent)', padding: '4px 10px', borderRadius: 6, cursor: uploading ? 'default' : 'pointer', fontSize: 13, opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Uploading…' : '+ Add'}
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          {!readOnly && (
            <div
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={e => {
                e.preventDefault();
                // Only clear dragOver when actually leaving the drop zone itself,
                // not when the pointer passes over a child element (e.g. the
                // hint text), which otherwise causes flicker and can interfere
                // with the eventual drop firing correctly.
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOver(false);
              }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-medium)'}`,
                borderRadius: 10, padding: photos.length === 0 ? 24 : 12, textAlign: 'center',
                marginBottom: photos.length > 0 ? 12 : 0, cursor: 'pointer',
                background: dragOver ? 'var(--bg-accent)' : 'transparent',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>
                {photos.length === 0 ? 'Drag photos here or click to upload' : 'Drop more photos here, or click to browse'}
              </p>
            </div>
          )}

          {photos.length === 0 && readOnly ? (
            <p style={{ color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic' }}>No photos yet.</p>
          ) : photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {photos.map((photo, index) => (
                <div key={photo.id} onClick={() => setLightboxIndex(index)} style={{ position: 'relative', cursor: 'pointer', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-muted)' }}>
                  {photo.url
                    ? <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>…</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedPhoto && (
        <div onClick={() => setLightboxIndex(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>

          {lightboxIndex! > 0 && (
            <button onClick={(e) => { e.stopPropagation(); goToPrev(); }}
              style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 24, width: 48, height: 48, color: '#fff', fontSize: 26, cursor: 'pointer' }}>‹</button>
          )}
          {lightboxIndex! < photos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); goToNext(); }}
              style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 24, width: 48, height: 48, color: '#fff', fontSize: 26, cursor: 'pointer' }}>›</button>
          )}

          {selectedPhoto.url && (
            <img src={selectedPhoto.url} alt="" onClick={e => e.stopPropagation()}
              style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }} />
          )}

          <div style={{ position: 'absolute', bottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{lightboxIndex! + 1} / {photos.length}</span>
            {!readOnly && (
              <button onClick={(e) => { e.stopPropagation(); deletePhoto(selectedPhoto); }}
                style={{ border: '1px solid var(--danger-vivid)', background: 'transparent', color: 'var(--danger-vivid)', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>
                Delete Photo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
