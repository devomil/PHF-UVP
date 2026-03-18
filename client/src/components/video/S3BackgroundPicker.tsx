import React, { useState, useEffect } from 'react';
import { ImageIcon, Loader2, RefreshCw, X } from 'lucide-react';

interface S3Asset {
  key: string;
  name: string;
  url: string;
  size: number;
  lastModified: string | null;
  contentType: string;
}

interface S3BackgroundPickerProps {
  category: 'intro-backgrounds' | 'end-cards';
  selectedUrl?: string | null;
  onSelect: (url: string | null) => void;
  accentColor?: string;
  label?: string;
}

export const S3BackgroundPicker: React.FC<S3BackgroundPickerProps> = ({
  category,
  selectedUrl,
  onSelect,
  accentColor = 'rgb(99 102 241)',
  label = 'Background Image',
}) => {
  const [assets, setAssets] = useState<S3Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/s3-assets/list?category=${category}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load assets');
      const data = await res.json();
      const imageAssets = (data as S3Asset[]).filter(
        (a) => a.contentType.startsWith('image/')
      );
      setAssets(imageAssets);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && assets.length === 0 && !loading) {
      fetchAssets();
    }
  }, [expanded]);

  const isSelected = (url: string) => selectedUrl === url;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          {label}
          <span className="text-[10px] opacity-60 ml-1">
            {expanded ? '(collapse)' : '(browse S3)'}
          </span>
        </button>
        {selectedUrl && (
          <button
            onClick={() => onSelect(null)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Remove selected background"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {selectedUrl && !expanded && (
        <div
          className="relative rounded-lg overflow-hidden border cursor-pointer group"
          style={{ borderColor: 'var(--border-subtle)', height: 80 }}
          onClick={() => setExpanded(true)}
        >
          <img
            src={selectedUrl}
            alt="Selected background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-[10px] font-medium">Change</span>
          </div>
          <div
            className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{ backgroundColor: accentColor, color: '#fff' }}
          >
            Selected
          </div>
        </div>
      )}

      {expanded && (
        <div className="space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                Loading assets...
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between py-3 px-3 rounded-lg border" style={{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{error}</span>
              <button onClick={fetchAssets} className="text-xs underline" style={{ color: 'var(--text-secondary)' }}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && assets.length === 0 && (
            <div className="text-center py-4">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No images found in {category === 'intro-backgrounds' ? 'Intro Backgrounds' : 'End Card Assets'}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Upload images in the S3 Asset Manager
              </p>
            </div>
          )}

          {!loading && assets.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {assets.length} image{assets.length !== 1 ? 's' : ''} available
                </span>
                <button
                  onClick={fetchAssets}
                  className="p-1 rounded hover:bg-white/5 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {assets.map((asset) => (
                  <button
                    key={asset.key}
                    onClick={() => {
                      onSelect(isSelected(asset.url) ? null : asset.url);
                    }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all group ${
                      isSelected(asset.url)
                        ? 'ring-1 shadow-lg'
                        : 'hover:border-opacity-60'
                    }`}
                    style={{
                      borderColor: isSelected(asset.url) ? accentColor : 'var(--border-subtle)',
                      ringColor: isSelected(asset.url) ? accentColor : undefined,
                      aspectRatio: '16/9',
                    }}
                    title={asset.name}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                      <p className="text-[8px] text-white truncate font-medium">
                        {asset.name}
                      </p>
                    </div>
                    {isSelected(asset.url) && (
                      <div
                        className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: accentColor }}
                      >
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default S3BackgroundPicker;
