import { useState, useEffect } from 'react';
import { Star, Search, Grid, List, Play, Image as ImageIcon, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LibraryAsset {
  id: number;
  assetUrl: string;
  thumbnailUrl: string | null;
  assetType: 'image' | 'video';
  provider: string | null;
  visualDirection: string | null;
  prompt: string | null;
  qualityScore: number | null;
  isFavorite: boolean;
  tags: string[];
  contentType: string | null;
  createdAt: string;
  useCount: number;
  duration: string | null;
}

interface AssetLibraryBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: LibraryAsset, animationSettings?: {
    type: 'ken-burns' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'static';
    intensity: 'subtle' | 'medium' | 'dramatic';
  }) => void;
}

export function AssetLibraryBrowser({
  isOpen,
  onClose,
  onSelect,
}: AssetLibraryBrowserProps) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<LibraryAsset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [animationType, setAnimationType] = useState<'ken-burns' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'static'>('ken-burns');
  const [animationIntensity, setAnimationIntensity] = useState<'subtle' | 'medium' | 'dramatic'>('subtle');

  useEffect(() => {
    if (isOpen) {
      fetchAssets();
    }
  }, [isOpen, searchQuery, typeFilter, showFavoritesOnly]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: typeFilter,
        favorite: showFavoritesOnly.toString(),
        search: searchQuery,
      });

      const response = await fetch(`/api/asset-library?${params}`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setAssets(data);
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    }
    setLoading(false);
  };

  const toggleFavorite = async (assetId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/asset-library/${assetId}/favorite`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const { isFavorite } = await response.json();
        setAssets(assets.map(a =>
          a.id === assetId ? { ...a, isFavorite } : a
        ));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleSelect = () => {
    if (selectedAsset) {
      fetch(`/api/asset-library/${selectedAsset.id}/use`, {
        method: 'POST',
        credentials: 'include',
      });

      if (selectedAsset.assetType === 'image') {
        onSelect(selectedAsset, {
          type: animationType,
          intensity: animationIntensity,
        });
      } else {
        onSelect(selectedAsset);
      }
      onClose();
    }
  };

  const getQualityColor = (score: number | null) => {
    if (!score) return 'bg-gray-500';
    if (score >= 85) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Asset Library
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 py-3 border-b">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-asset-search"
            />
          </div>

          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={typeFilter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter('all')}
              data-testid="button-filter-all"
            >
              All
            </Button>
            <Button
              variant={typeFilter === 'image' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter('image')}
              data-testid="button-filter-images"
            >
              <ImageIcon className="h-4 w-4 mr-1" /> Images
            </Button>
            <Button
              variant={typeFilter === 'video' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter('video')}
              data-testid="button-filter-videos"
            >
              <Play className="h-4 w-4 mr-1" /> Videos
            </Button>
          </div>

          <Button
            variant={showFavoritesOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            data-testid="button-filter-favorites"
          >
            <Star className={`h-4 w-4 mr-1 ${showFavoritesOnly ? 'fill-current' : ''}`} />
            Favorites
          </Button>

          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
              data-testid="button-view-grid"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No assets found. Generate some videos to build your library!
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {assets.map(asset => (
                <div
                  key={asset.id}
                  className={`
                    relative aspect-video rounded-lg overflow-hidden cursor-pointer
                    border-2 transition-all group
                    ${selectedAsset?.id === asset.id
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-transparent hover:border-gray-300'}
                  `}
                  onClick={() => setSelectedAsset(asset)}
                  data-testid={`card-asset-${asset.id}`}
                >
                  <img
                    src={asset.thumbnailUrl || asset.assetUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />

                  <div className="absolute top-2 left-2">
                    {asset.assetType === 'video' ? (
                      <Badge className="bg-black/60">
                        <Play className="h-3 w-3 mr-1" fill="white" />
                        Video
                      </Badge>
                    ) : (
                      <Badge className="bg-black/60">
                        <ImageIcon className="h-3 w-3 mr-1" />
                        Image
                      </Badge>
                    )}
                  </div>

                  {asset.qualityScore && (
                    <div className="absolute top-2 right-8">
                      <Badge className={getQualityColor(asset.qualityScore)}>
                        Q: {asset.qualityScore}
                      </Badge>
                    </div>
                  )}

                  <button
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/40 hover:bg-black/60"
                    onClick={(e) => toggleFavorite(asset.id, e)}
                    data-testid={`button-favorite-${asset.id}`}
                  >
                    <Star
                      className={`h-4 w-4 ${asset.isFavorite ? 'text-yellow-400 fill-current' : 'text-white'}`}
                    />
                  </button>

                  {asset.provider && (
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="outline" className="bg-white/80 text-xs">
                        {asset.provider}
                      </Badge>
                    </div>
                  )}

                  {asset.useCount > 1 && (
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="outline" className="bg-white/80 text-xs">
                        Used {asset.useCount}x
                      </Badge>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                    <p className="text-white text-xs line-clamp-3">
                      {asset.visualDirection || asset.prompt || 'No description'}
                    </p>
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {asset.tags.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {assets.map(asset => (
                <div
                  key={asset.id}
                  className={`
                    flex items-center gap-4 p-3 rounded-lg cursor-pointer
                    border-2 transition-all
                    ${selectedAsset?.id === asset.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}
                  `}
                  onClick={() => setSelectedAsset(asset)}
                  data-testid={`row-asset-${asset.id}`}
                >
                  <img
                    src={asset.thumbnailUrl || asset.assetUrl}
                    alt=""
                    className="w-24 h-14 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {asset.visualDirection || asset.prompt || 'No description'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {asset.provider && (
                        <Badge variant="outline" className="text-xs">{asset.provider}</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{asset.assetType}</Badge>
                      <span className="text-xs text-gray-400">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {new Date(asset.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {asset.qualityScore && (
                    <Badge className={getQualityColor(asset.qualityScore)}>
                      Q: {asset.qualityScore}
                    </Badge>
                  )}
                  <button onClick={(e) => toggleFavorite(asset.id, e)}>
                    <Star className={`h-5 w-5 ${asset.isFavorite ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedAsset?.assetType === 'image' && (
          <div className="border-t pt-4 pb-2">
            <p className="text-sm font-medium mb-2">Animation Settings for Image</p>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500">Animation Type</label>
                <Select value={animationType} onValueChange={(v) => setAnimationType(v as any)}>
                  <SelectTrigger data-testid="select-animation-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ken-burns">Ken Burns (Pan + Zoom)</SelectItem>
                    <SelectItem value="zoom-in">Zoom In</SelectItem>
                    <SelectItem value="zoom-out">Zoom Out</SelectItem>
                    <SelectItem value="pan-left">Pan Left</SelectItem>
                    <SelectItem value="pan-right">Pan Right</SelectItem>
                    <SelectItem value="static">Static (No Animation)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">Intensity</label>
                <Select value={animationIntensity} onValueChange={(v) => setAnimationIntensity(v as any)}>
                  <SelectTrigger data-testid="select-animation-intensity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subtle">Subtle</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="dramatic">Dramatic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-500">
            {assets.length} assets in library
            {selectedAsset && ` • Selected: ${selectedAsset.assetType}`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSelect} disabled={!selectedAsset} data-testid="button-use-asset">
              Use This Asset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
