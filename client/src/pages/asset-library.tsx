import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { 
  Image, 
  Video, 
  Music, 
  Upload, 
  Search, 
  Filter, 
  Grid3X3, 
  List,
  Download,
  Trash2,
  Plus,
  Tag,
  Clock,
  FileType,
  Sparkles,
  Edit,
  Building2,
  MapPin,
  X,
  AlertCircle,
  HardDrive,
  Loader2,
  CheckCircle2,
  XCircle,
  Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { AssetUploadModal, type AssetMetadata } from '@/components/video/AssetUploadModal';
import { ASSET_CATEGORIES as TAXONOMY_CATEGORIES, getAssetType, getTypesByCategory } from '@shared/brand-asset-types';
import S3AssetManager from '@/components/video/s3-asset-manager';
import { AssetCreatorDialog } from '@/components/video/AssetCreatorDialog';

type AssetType = 'image' | 'video' | 'music' | 'all';
type ViewMode = 'grid' | 'list';

interface MediaAsset {
  id: number;
  type: 'image' | 'video' | 'music';
  name: string;
  url: string;
  thumbnail_url?: string;
  source: string;
  category?: string;
  mood?: string;
  width?: number;
  height?: number;
  duration?: number;
  file_size?: number;
  prompt?: string;
  description?: string;
  tags: string[];
  created_at: string;
  usage_count: number;
  is_favorite: boolean;
}

interface UserUpload {
  id: number;
  type: 'image' | 'video' | 'music' | 'logo' | 'testimonial';
  name: string;
  url: string;
  description?: string;
  tags: string[];
  created_at: string;
}

interface BrandMedia {
  id: number;
  name: string;
  description?: string;
  mediaType: 'logo' | 'photo' | 'video' | 'graphic' | 'watermark';
  assetType?: string | null;
  entityName?: string;
  entityType?: string;
  url: string;
  thumbnailUrl?: string;
  matchKeywords: string[];
  excludeKeywords: string[];
  usageContexts: string[];
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  personInfo?: { name?: string; title?: string; credentials?: string; consentObtained: boolean } | null;
  productInfo?: { productName?: string; sku?: string } | null;
}

interface UnifiedMediaAsset {
  id: number;
  name: string;
  description?: string;
  type: 'image' | 'video' | 'music';
  source: string;
  classification: 'uncategorized' | 'brand' | 'general';
  brandMediaId?: number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  fileSize?: number;
  mimeType?: string;
  category?: string;
  keywords?: string[];
  createdAt: string;
}

const ASSET_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'product', label: 'Product' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'nature', label: 'Nature' },
  { value: 'people', label: 'People' },
  { value: 'abstract', label: 'Abstract' },
  { value: 'technology', label: 'Technology' },
  { value: 'health', label: 'Health & Wellness' },
];

const MOOD_OPTIONS = [
  { value: 'all', label: 'All Moods' },
  { value: 'uplifting', label: 'Uplifting' },
  { value: 'calm', label: 'Calm' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'inspiring', label: 'Inspiring' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'stability_ai', label: 'Stability AI' },
  { value: 'huggingface', label: 'HuggingFace' },
  { value: 'runway', label: 'Runway' },
  { value: 'pexels', label: 'Pexels' },
  { value: 'pixabay', label: 'Pixabay' },
  { value: 'unsplash', label: 'Unsplash' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'upload', label: 'User Upload' },
];

export default function AssetLibrary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'library' | 'uploads' | 'brand' | 's3-assets' | 'characters'>('brand');
  const [assetType, setAssetType] = useState<AssetType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [moodFilter, setMoodFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [selectedLibraryAsset, setSelectedLibraryAsset] = useState<any | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  const { data: activeJobs, refetch: refetchJobs } = useQuery<any[]>({
    queryKey: ['/api/asset-library/jobs'],
    refetchInterval: (query) => {
      const jobs = query.state.data as any[] | undefined;
      const hasActive = jobs?.some((j: any) => j.status === 'pending' || j.status === 'processing');
      return hasActive ? 3000 : false;
    },
  });

  const { data: libraryAssets, isLoading: isLoadingLibraryAssets, refetch: refetchLibraryAssets } = useQuery<any[]>({
    queryKey: ['/api/asset-library'],
    enabled: activeTab === 'library',
  });

  const pendingJobs = activeJobs?.filter((j: any) => j.status === 'pending' || j.status === 'processing') || [];
  const recentCompletedJobs = activeJobs?.filter((j: any) => j.status === 'completed' && Date.now() - new Date(j.completedAt).getTime() < 60000) || [];

  useEffect(() => {
    if (recentCompletedJobs.length > 0) {
      refetchLibraryAssets();
      queryClient.invalidateQueries({ queryKey: ['/api/videos/assets'] });
    }
  }, [recentCompletedJobs.length]);

  const handleJobStarted = useCallback((jobId: string) => {
    refetchJobs();
    setActiveTab('library');
  }, [refetchJobs]);

  // Brand Media Library state
  const [selectedBrandAsset, setSelectedBrandAsset] = useState<BrandMedia | null>(null);
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [brandEditForm, setBrandEditForm] = useState({
    name: '',
    description: '',
    mediaType: 'photo',
    entityName: '',
    entityType: 'brand',
    url: '',
    matchKeywords: '',
    usageContexts: '',
    assetCategory: '',
    assetType: '',
    personName: '',
    personTitle: '',
    personCredentials: '',
    consentObtained: false,
    productName: '',
    productSku: '',
  });
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementPreview, setReplacementPreview] = useState<string | null>(null);
  const [isUploadingReplacement, setIsUploadingReplacement] = useState(false);
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [isNewUploadModalOpen, setIsNewUploadModalOpen] = useState(false);
  const [newBrandFile, setNewBrandFile] = useState<File | null>(null);
  const [newBrandPreview, setNewBrandPreview] = useState<string | null>(null);
  const [newBrandForm, setNewBrandForm] = useState({
    name: '',
    description: '',
    mediaType: 'photo',
    entityName: '',
    entityType: 'brand',
    assetCategory: '',
    assetType: '',
    personName: '',
    personTitle: '',
    personCredentials: '',
    consentObtained: false,
    productName: '',
    productSku: '',
  });

  const { data: assetsData, isLoading: isLoadingAssets } = useQuery<{ assets: MediaAsset[]; total: number }>({
    queryKey: ['/api/videos/assets', { type: assetType, search: searchQuery, category: categoryFilter, mood: moodFilter, source: sourceFilter }],
    enabled: activeTab === 'library',
  });

  const { data: uploadsData, isLoading: isLoadingUploads } = useQuery<{ uploads: UserUpload[]; total: number }>({
    queryKey: ['/api/videos/uploads'],
    enabled: activeTab === 'uploads',
  });

  const { data: brandMediaData, isLoading: isLoadingBrandMedia } = useQuery<{ assets: BrandMedia[]; total: number }>({
    queryKey: ['/api/brand-media-library'],
    enabled: activeTab === 'brand',
  });

  interface CharacterLibraryEntry {
    id: number;
    name: string;
    role?: string;
    physicalDescription?: string;
    wardrobe?: string;
    personalityNotes?: string;
    referenceImageUrl?: string;
    createdAt: string;
  }

  const { data: characterLibraryData, isLoading: isLoadingCharacters } = useQuery<{ success: boolean; characters: CharacterLibraryEntry[] }>({
    queryKey: ['/api/universal-video/character-library'],
    enabled: activeTab === 'characters',
  });

  const characters: CharacterLibraryEntry[] = Array.isArray(characterLibraryData) ? characterLibraryData : (characterLibraryData?.characters || []);

  const deleteCharacterMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/universal-video/character-library/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/character-library'] });
      queryClient.invalidateQueries({ queryKey: ['/api/asset-library'] });
      toast({ title: 'Character deleted', description: 'Character has been removed from your library.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete character.', variant: 'destructive' });
    },
  });

  const deleteBrandAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/brand-media-library/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-media-library'] });
      toast({ title: 'Asset deleted', description: 'Brand asset has been removed.' });
      setSelectedBrandAsset(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete asset.', variant: 'destructive' });
    },
  });

  const updateBrandAssetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest('PUT', `/api/brand-media-library/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-media-library'] });
      toast({ title: 'Asset updated', description: 'Brand asset has been updated.' });
      setIsEditingBrand(false);
      setSelectedBrandAsset(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update asset.', variant: 'destructive' });
    },
  });

  const createBrandAssetMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest('POST', '/api/brand-media-library', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-media-library'] });
      toast({ title: 'Asset created', description: 'New brand asset has been added.' });
      setIsCreatingBrand(false);
      setNewBrandFile(null);
      setNewBrandPreview(null);
      setNewBrandForm({
        name: '',
        description: '',
        mediaType: 'photo',
        entityName: '',
        entityType: 'brand',
        assetCategory: '',
        assetType: '',
        personName: '',
        personTitle: '',
        personCredentials: '',
        consentObtained: false,
        productName: '',
        productSku: '',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create asset.', variant: 'destructive' });
    },
  });

  // ========== UNIFIED MEDIA ASSETS STATE ==========
  const [selectedUnifiedAsset, setSelectedUnifiedAsset] = useState<UnifiedMediaAsset | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyForm, setClassifyForm] = useState({
    classification: 'general' as 'brand' | 'general',
    name: '',
    description: '',
    mediaType: 'photo',
    entityName: '',
    entityType: 'brand',
    matchKeywords: '',
    usageContexts: '',
  });

  // Query for unified media assets
  const { data: unifiedAssetsData, isLoading: isLoadingUnified } = useQuery<{ assets: UnifiedMediaAsset[]; total: number }>({
    queryKey: ['/api/media-assets'],
    enabled: activeTab === 'uploads',
  });

  const unifiedAssets: UnifiedMediaAsset[] = unifiedAssetsData?.assets || [];

  // Upload to unified media assets
  const uploadUnifiedAssetMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/media-assets', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-assets'] });
      toast({ title: 'Upload Complete', description: 'File uploaded to Asset Library.' });
    },
    onError: () => {
      toast({ title: 'Upload Failed', description: 'Failed to upload file.', variant: 'destructive' });
    },
  });

  // Classify unified media asset
  const classifyAssetMutation = useMutation({
    mutationFn: async ({ id, classification, brandData }: { id: number; classification: string; brandData?: any }) => {
      const response = await apiRequest('POST', `/api/media-assets/${id}/classify`, { classification, brandData });
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-assets'] });
      if (variables.classification === 'brand') {
        queryClient.invalidateQueries({ queryKey: ['/api/brand-media-library'] });
        toast({ title: 'Asset Classified', description: 'Asset moved to Brand Media tab.' });
      } else {
        toast({ title: 'Asset Classified', description: 'Asset marked as general asset.' });
      }
      setIsClassifying(false);
      setSelectedUnifiedAsset(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to classify asset.', variant: 'destructive' });
    },
  });

  // Delete unified media asset
  const deleteUnifiedAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/media-assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brand-media-library'] });
      toast({ title: 'Asset Deleted', description: 'Asset has been removed.' });
      setSelectedUnifiedAsset(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete asset.', variant: 'destructive' });
    },
  });

  const deleteLibraryAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/asset-library/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/asset-library'] });
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/character-library'] });
      toast({ title: 'Asset Deleted', description: 'Asset has been removed from the library.' });
      setSelectedLibraryAsset(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete asset.', variant: 'destructive' });
    },
  });

  const assets: MediaAsset[] = assetsData?.assets || [];
  const uploads: UserUpload[] = uploadsData?.uploads || [];
  const brandAssets: BrandMedia[] = brandMediaData?.assets || [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

        const response = await fetch('/api/media-assets', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      toast({
        title: 'Upload Complete',
        description: `Successfully uploaded ${files.length} file(s). Click on an asset to classify it.`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/media-assets'] });
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload files',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleNewUpload = async (file: File, metadata: AssetMetadata) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', metadata.name);
      if (metadata.description) formData.append('description', metadata.description);
      formData.append('assetType', metadata.assetType);
      formData.append('tags', JSON.stringify(metadata.tags || []));
      if (metadata.personInfo) formData.append('personInfo', JSON.stringify(metadata.personInfo));
      if (metadata.productInfo) formData.append('productInfo', JSON.stringify(metadata.productInfo));
      
      const uploadResponse = await fetch('/api/videos/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
      
      const uploadResult = await uploadResponse.json();
      const newUrl = uploadResult.upload?.url || uploadResult.url;
      
      if (!newUrl) {
        throw new Error('No URL returned from upload');
      }
      
      const assetCategory = metadata.assetType.split('-')[0];
      let mediaType = 'photo';
      let entityType = 'brand';
      
      if (assetCategory === 'product') {
        mediaType = 'photo';
        entityType = 'product';
      } else if (assetCategory === 'logo') {
        mediaType = 'logo';
        entityType = 'brand';
      } else if (assetCategory === 'location') {
        mediaType = 'photo';
        entityType = 'location';
      } else if (assetCategory === 'people') {
        mediaType = 'photo';
        entityType = 'person';
      } else if (assetCategory === 'creative') {
        if (file.type.startsWith('video/')) {
          mediaType = 'video';
        } else {
          mediaType = 'graphic';
        }
      }
      
      createBrandAssetMutation.mutate({
        name: metadata.name,
        description: metadata.description || '',
        mediaType,
        entityName: metadata.productInfo?.productName || '',
        entityType,
        url: newUrl,
        thumbnailUrl: newUrl,
        matchKeywords: metadata.tags || [],
        usageContexts: [],
        assetType: metadata.assetType,
        personInfo: metadata.personInfo || null,
        productInfo: metadata.productInfo || null,
      });
      
      setIsNewUploadModalOpen(false);
    } catch (error) {
      console.error('Error uploading brand asset:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload brand asset',
        variant: 'destructive',
      });
    }
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'music';
    return 'image';
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAssetTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'music': return <Music className="h-4 w-4" />;
      default: return <FileType className="h-4 w-4" />;
    }
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'stability_ai':
      case 'huggingface':
      case 'runway':
        return 'bg-purple-100 text-purple-800';
      case 'pexels':
      case 'pixabay':
      case 'unsplash':
        return 'bg-blue-100 text-blue-800';
      case 'elevenlabs':
        return 'bg-green-100 text-green-800';
      case 'upload':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Asset Library
              </CardTitle>
              <CardDescription>
                Browse and manage your video production assets including AI-generated images, stock footage, and custom uploads.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsCreatorOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Asset
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                data-testid="view-mode-grid"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                data-testid="view-mode-list"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'library' | 'uploads' | 'brand' | 's3-assets' | 'characters')}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="brand" className="flex items-center gap-2" data-testid="tab-brand-media">
                <Building2 className="h-4 w-4" />
                Brand Media
              </TabsTrigger>
              <TabsTrigger value="library" className="flex items-center gap-2" data-testid="tab-asset-library">
                <Image className="h-4 w-4" />
                Asset Library
              </TabsTrigger>
              <TabsTrigger value="characters" className="flex items-center gap-2" data-testid="tab-characters">
                <Users className="h-4 w-4" />
                Characters
              </TabsTrigger>
              <TabsTrigger value="uploads" className="flex items-center gap-2" data-testid="tab-my-uploads">
                <Upload className="h-4 w-4" />
                My Uploads
              </TabsTrigger>
              <TabsTrigger value="s3-assets" className="flex items-center gap-2" data-testid="tab-s3-assets">
                <HardDrive className="h-4 w-4" />
                S3 Render Assets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search assets..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="asset-search-input"
                    />
                  </div>
                </div>

                <Select value={assetType} onValueChange={(v) => setAssetType(v as AssetType)}>
                  <SelectTrigger className="w-[150px]" data-testid="filter-type">
                    <SelectValue placeholder="Asset Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="music">Music</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="filter-category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={moodFilter} onValueChange={setMoodFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="filter-mood">
                    <SelectValue placeholder="Mood" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOOD_OPTIONS.map((mood) => (
                      <SelectItem key={mood.value} value={mood.value}>{mood.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="filter-source">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((src) => (
                      <SelectItem key={src.value} value={src.value}>{src.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {pendingJobs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                    Active Generations ({pendingJobs.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pendingJobs.map((job: any) => (
                      <div key={job.jobId} className="flex items-center gap-3 p-3 rounded-lg border border-purple-500/30 bg-purple-500/5">
                        <div className="flex-shrink-0">
                          <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{job.prompt?.substring(0, 50)}{job.prompt?.length > 50 ? '...' : ''}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/40 text-purple-300">
                              {(job.i2vSettings as any)?.assetLibraryMode?.toUpperCase() || job.sceneType?.toUpperCase()}
                            </Badge>
                            <span className="text-[10px] text-gray-500">{job.provider}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isLoadingAssets && isLoadingLibraryAssets ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading assets...</p>
                  </div>
                </div>
              ) : (libraryAssets?.length || 0) === 0 && assets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Image className="h-16 w-16 text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-300 mb-1">No assets yet</h3>
                  <p className="text-gray-500 mb-4">
                    Create images and videos with AI, or generate assets during video production.
                  </p>
                  <Button
                    onClick={() => setIsCreatorOpen(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Create Your First Asset
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {(libraryAssets || []).map((la: any) => (
                        <div
                          key={`lib-${la.id}`}
                          className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-700 bg-gray-900 hover:border-purple-500 transition-colors"
                          onClick={() => setSelectedLibraryAsset(la)}
                        >
                          <div className="aspect-video bg-gray-800 relative">
                            {la.assetType === 'image' ? (
                              <img
                                src={la.thumbnailUrl || la.assetUrl}
                                alt={la.prompt?.substring(0, 40) || 'Generated asset'}
                                className="w-full h-full object-cover"
                              />
                            ) : la.assetType === 'video' ? (
                              <video
                                src={la.assetUrl}
                                className="w-full h-full object-cover"
                                muted
                                onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                                onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image className="h-8 w-8 text-gray-600" />
                              </div>
                            )}
                            <div className="absolute top-1.5 left-1.5">
                              <Badge className="text-[10px] px-1.5 py-0 bg-purple-600/90 text-white border-0">
                                {la.contentType?.toUpperCase() || la.assetType?.toUpperCase()}
                              </Badge>
                            </div>
                            {la.isFavorite && (
                              <div className="absolute top-1.5 right-1.5 text-yellow-400 text-xs">★</div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <Button size="sm" variant="secondary">
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Are you sure you want to delete this asset?')) {
                                    deleteLibraryAssetMutation.mutate(la.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-xs text-gray-300 truncate">{la.prompt?.substring(0, 60) || 'Untitled'}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-gray-600 text-gray-400">
                                {la.provider || 'auto'}
                              </Badge>
                              {la.useCount > 1 && (
                                <span className="text-[10px] text-gray-500">Used {la.useCount}x</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-700 bg-gray-900 hover:border-purple-500 transition-colors"
                          onClick={() => setSelectedAsset(asset)}
                          data-testid={`asset-card-${asset.id}`}
                        >
                          <div className="aspect-video bg-gray-800 relative">
                            {asset.type === 'image' && (
                              <img
                                src={asset.thumbnail_url || asset.url}
                                alt={asset.name}
                                className="w-full h-full object-cover"
                              />
                            )}
                            {asset.type === 'video' && (
                              <video
                                src={asset.url}
                                className="w-full h-full object-cover"
                                muted
                                onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                                onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                              />
                            )}
                            {asset.type === 'music' && (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                <Music className="h-8 w-8 text-white" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Button size="sm" variant="secondary">
                                View
                              </Button>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-300 truncate">{asset.name}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-gray-600 text-gray-400">
                                {asset.source}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                          onClick={() => setSelectedAsset(asset)}
                          data-testid={`asset-row-${asset.id}`}
                        >
                          <div className="w-20 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0">
                            {asset.type === 'image' && (
                              <img src={asset.thumbnail_url || asset.url} alt={asset.name} className="w-full h-full object-cover" />
                            )}
                            {asset.type === 'video' && (
                              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                <Video className="h-4 w-4 text-white/70" />
                              </div>
                            )}
                            {asset.type === 'music' && (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                <Music className="h-4 w-4 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{asset.name}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              {getAssetTypeIcon(asset.type)}
                              <span>{asset.type}</span>
                              <span>•</span>
                              <span>{formatFileSize(asset.file_size)}</span>
                              {asset.duration && (
                                <>
                                  <span>•</span>
                                  <span>{formatDuration(asset.duration)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge variant="secondary" className={getSourceBadgeColor(asset.source)}>
                            {asset.source}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="uploads" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    Upload media files here. Click on an asset to classify it as <strong>Brand</strong> (moves to Brand Media) or <strong>General Asset</strong> (stays here for video production).
                  </p>
                </div>
                <Label
                  htmlFor="file-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Upload className="h-4 w-4" />
                  Upload Files
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*"
                    className="hidden"
                    onChange={handleFileUpload}
                    data-testid="file-upload-input"
                  />
                </Label>
              </div>

              {isUploading && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <span className="text-sm font-medium">Uploading files...</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {isLoadingUnified ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading assets...</p>
                  </div>
                </div>
              ) : unifiedAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <Upload className="h-16 w-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No assets yet</h3>
                  <p className="text-gray-500 mb-4 max-w-md">
                    Upload images, videos, and audio files. After uploading, click on each asset to classify it as brand media or a general asset.
                  </p>
                  <Label
                    htmlFor="file-upload-empty"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    Upload Your First File
                    <input
                      id="file-upload-empty"
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </Label>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {unifiedAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`relative group cursor-pointer rounded-lg overflow-hidden border bg-gray-50 hover:border-primary transition-colors ${
                        asset.classification === 'uncategorized' ? 'border-amber-300 border-2' : ''
                      }`}
                      onClick={() => {
                        setSelectedUnifiedAsset(asset);
                        setClassifyForm({
                          classification: asset.classification === 'brand' ? 'brand' : 'general',
                          name: asset.name,
                          description: asset.description || '',
                          mediaType: asset.type === 'video' ? 'video' : 'photo',
                          entityName: '',
                          entityType: 'brand',
                          matchKeywords: asset.keywords?.join(', ') || '',
                          usageContexts: '',
                        });
                      }}
                      data-testid={`unified-asset-card-${asset.id}`}
                    >
                      <div className="aspect-video bg-gray-200 relative">
                        {asset.type === 'image' ? (
                          <img
                            src={asset.url}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                        ) : asset.type === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center bg-gray-900">
                            <Video className="h-8 w-8 text-white/70" />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                            <Music className="h-8 w-8 text-white" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2">
                          {asset.classification === 'uncategorized' && (
                            <Badge className="bg-amber-500 text-white text-xs">
                              Needs Classification
                            </Badge>
                          )}
                          {asset.classification === 'brand' && (
                            <Badge className="bg-purple-600 text-white text-xs">
                              Brand
                            </Badge>
                          )}
                          {asset.classification === 'general' && (
                            <Badge className="bg-blue-600 text-white text-xs">
                              General
                            </Badge>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUnifiedAsset(asset);
                              setIsClassifying(true);
                              setClassifyForm({
                                classification: 'general',
                                name: asset.name,
                                description: asset.description || '',
                                mediaType: asset.type === 'video' ? 'video' : 'photo',
                                entityName: '',
                                entityType: 'brand',
                                matchKeywords: asset.keywords?.join(', ') || '',
                                usageContexts: '',
                              });
                            }}
                          >
                            <Tag className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to delete this asset?')) {
                                deleteUnifiedAssetMutation.mutate(asset.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{asset.name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {asset.type}
                          </Badge>
                          {asset.source && (
                            <Badge variant="outline" className="text-xs">
                              {asset.source}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Brand Media Library Tab */}
            <TabsContent value="brand" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Manage brand assets like logos, store photos, and location images. These are automatically matched during video generation.
                </p>
                <Button 
                  onClick={() => setIsNewUploadModalOpen(true)}
                  data-testid="add-brand-asset-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Brand Asset
                </Button>
              </div>

              {isLoadingBrandMedia ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading brand assets...</p>
                  </div>
                </div>
              ) : brandAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <Building2 className="h-16 w-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No brand assets yet</h3>
                  <p className="text-gray-500 mb-4 max-w-md">
                    Add logos, store photos, and branded imagery to automatically include in video productions.
                  </p>
                  <Button onClick={() => setIsNewUploadModalOpen(true)} data-testid="add-brand-asset-empty">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Brand Asset
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {brandAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="relative group cursor-pointer rounded-lg overflow-hidden border bg-gray-50 hover:border-primary transition-colors"
                      onClick={() => setSelectedBrandAsset(asset)}
                      data-testid={`brand-asset-card-${asset.id}`}
                    >
                      <div className="aspect-video bg-gray-200 relative">
                        {asset.mediaType === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center bg-gray-900">
                            <Video className="h-8 w-8 text-white/70" />
                          </div>
                        ) : (
                          <img
                            src={asset.thumbnailUrl || asset.url}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray"><rect width="24" height="24"/></svg>';
                            }}
                          />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBrandAsset(asset);
                              setIsEditingBrand(true);
                              const assetTypeInfo = asset.assetType ? getAssetType(asset.assetType) : null;
                              setBrandEditForm({
                                name: asset.name,
                                description: asset.description || '',
                                mediaType: asset.mediaType,
                                entityName: asset.entityName || '',
                                entityType: asset.entityType || 'brand',
                                url: asset.url,
                                matchKeywords: asset.matchKeywords?.join(', ') || '',
                                usageContexts: asset.usageContexts?.join(', ') || '',
                                assetCategory: assetTypeInfo?.category || '',
                                assetType: asset.assetType || '',
                                personName: (asset.personInfo as any)?.name || '',
                                personTitle: (asset.personInfo as any)?.title || '',
                                personCredentials: (asset.personInfo as any)?.credentials || '',
                                consentObtained: (asset.personInfo as any)?.consentObtained || false,
                                productName: (asset.productInfo as any)?.productName || '',
                                productSku: (asset.productInfo as any)?.sku || '',
                              });
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to delete this brand asset?')) {
                                deleteBrandAssetMutation.mutate(asset.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{asset.name}</p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {asset.mediaType}
                          </Badge>
                          {asset.entityName && (
                            <Badge variant="outline" className="text-xs">
                              <MapPin className="h-2 w-2 mr-1" />
                              {asset.entityName}
                            </Badge>
                          )}
                          {asset.isDefault && (
                            <Badge className="text-xs bg-green-100 text-green-800">
                              Default
                            </Badge>
                          )}
                        </div>
                        {asset.matchKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {asset.matchKeywords.slice(0, 3).map((kw) => (
                              <span key={kw} className="text-xs text-gray-400">#{kw}</span>
                            ))}
                            {asset.matchKeywords.length > 3 && (
                              <span className="text-xs text-gray-400">+{asset.matchKeywords.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="characters" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  View and manage your saved character profiles. Characters can be created from the Character Profiles panel or the Create Asset dialog.
                </p>
              </div>

              {isLoadingCharacters ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading characters...</p>
                  </div>
                </div>
              ) : characters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <Users className="h-16 w-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No characters yet</h3>
                  <p className="text-gray-500 mb-4 max-w-md">
                    Create characters using the Character Profiles panel in a project, or use the "Create Asset" button with "Character" mode.
                  </p>
                  <Button
                    onClick={() => setIsCreatorOpen(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Character
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {characters.map((character) => (
                    <div
                      key={character.id}
                      className="relative group rounded-lg overflow-hidden border bg-gray-50 hover:border-purple-400 transition-colors"
                      data-testid={`character-card-${character.id}`}
                    >
                      <div className="aspect-square bg-gray-200 relative">
                        {character.referenceImageUrl ? (
                          <img
                            src={character.referenceImageUrl}
                            alt={character.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray"><rect width="24" height="24"/></svg>';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                            <Users className="h-12 w-12 text-purple-300" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2">
                          <Badge className="bg-purple-600 text-white text-xs">
                            Character
                          </Badge>
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          {character.referenceImageUrl && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                const a = document.createElement('a');
                                a.href = character.referenceImageUrl!;
                                a.download = `${character.name}-reference`;
                                a.target = '_blank';
                                a.click();
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to delete "${character.name}"?`)) {
                                deleteCharacterMutation.mutate(character.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{character.name}</p>
                        {character.role && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{character.role}</p>
                        )}
                        {character.physicalDescription && (
                          <p className="text-xs text-gray-400 truncate mt-1">{character.physicalDescription}</p>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {character.referenceImageUrl ? 'Has Reference' : 'No Reference'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="s3-assets" className="space-y-4">
              <S3AssetManager />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Brand Asset Edit Dialog */}
      <Dialog open={isEditingBrand} onOpenChange={(open) => {
        setIsEditingBrand(open);
        if (!open) {
          setReplacementFile(null);
          setReplacementPreview(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Brand Asset</DialogTitle>
            <DialogDescription>
              Update the brand asset details, media file, and matching keywords.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current/New Media Preview */}
            <div>
              <Label>Media File</Label>
              <div className="mt-2 border rounded-lg overflow-hidden bg-gray-100">
                <div className="aspect-video relative flex items-center justify-center">
                  {replacementPreview ? (
                    brandEditForm.mediaType === 'video' ? (
                      <video src={replacementPreview} controls className="w-full h-full object-contain" />
                    ) : (
                      <img src={replacementPreview} alt="New media" className="w-full h-full object-contain" />
                    )
                  ) : brandEditForm.url ? (
                    brandEditForm.mediaType === 'video' ? (
                      <video src={brandEditForm.url} controls className="w-full h-full object-contain" />
                    ) : (
                      <img src={brandEditForm.url} alt="Current media" className="w-full h-full object-contain" />
                    )
                  ) : (
                    <div className="text-gray-400 text-sm">No media</div>
                  )}
                  {replacementPreview && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-green-500">New</Badge>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t bg-white">
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept={brandEditForm.mediaType === 'video' ? 'video/*' : 'image/*'}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setReplacementFile(file);
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setReplacementPreview(ev.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="flex-1"
                      data-testid="brand-edit-file"
                    />
                    {replacementFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplacementFile(null);
                          setReplacementPreview(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {replacementFile && (
                    <p className="text-xs text-green-600 mt-1">
                      New file selected: {replacementFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={brandEditForm.name}
                onChange={(e) => setBrandEditForm({ ...brandEditForm, name: e.target.value })}
                data-testid="brand-edit-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={brandEditForm.description}
                onChange={(e) => setBrandEditForm({ ...brandEditForm, description: e.target.value })}
                data-testid="brand-edit-description"
              />
            </div>
            {/* Legacy Asset Warning - only show if there's legacy keyword/context data without taxonomy classification */}
            {!brandEditForm.assetCategory && !brandEditForm.assetType && (brandEditForm.matchKeywords?.trim() || brandEditForm.usageContexts?.trim()) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Legacy Asset Detected</p>
                    <p className="text-amber-700 mt-1">
                      This asset uses legacy keywords/contexts. Select a Category and Asset Type to migrate it to the new taxonomy for improved AI matching.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Category Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select 
                  value={brandEditForm.assetCategory || ''} 
                  onValueChange={(v) => setBrandEditForm({ 
                    ...brandEditForm, 
                    assetCategory: v,
                    assetType: '',
                  })}
                >
                  <SelectTrigger data-testid="brand-edit-category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TAXONOMY_CATEGORIES.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Asset Type {brandEditForm.assetCategory ? '*' : ''}</Label>
                <Select 
                  value={brandEditForm.assetType || ''} 
                  onValueChange={(v) => setBrandEditForm({ ...brandEditForm, assetType: v })}
                  disabled={!brandEditForm.assetCategory}
                >
                  <SelectTrigger data-testid="brand-edit-asset-type">
                    <SelectValue placeholder={brandEditForm.assetCategory ? 'Select type...' : 'Select category first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {brandEditForm.assetCategory && getTypesByCategory(brandEditForm.assetCategory).map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {brandEditForm.assetType && getAssetType(brandEditForm.assetType) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {getAssetType(brandEditForm.assetType)?.description}
                  </p>
                )}
              </div>
            </div>

            {/* Auto-match Keywords Preview */}
            {brandEditForm.assetType && getAssetType(brandEditForm.assetType) && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
                  <Sparkles className="h-4 w-4" />
                  {getAssetType(brandEditForm.assetType)?.label}
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <span className="text-xs text-blue-600 font-medium">Auto-matches these keywords in visual directions:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(getAssetType(brandEditForm.assetType)?.promptKeywords || []).slice(0, 8).map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                        {kw}
                      </Badge>
                    ))}
                    {(getAssetType(brandEditForm.assetType)?.promptKeywords || []).length > 8 && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                        +{(getAssetType(brandEditForm.assetType)?.promptKeywords || []).length - 8} more
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Conditional Person Info (for People category) */}
            {brandEditForm.assetCategory === 'people' && (
              <div className="space-y-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                <Label className="text-sm font-medium text-blue-800">Person Details</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={brandEditForm.personName}
                      onChange={(e) => setBrandEditForm({ ...brandEditForm, personName: e.target.value })}
                      placeholder="e.g., Dr. Sarah Johnson"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={brandEditForm.personTitle}
                      onChange={(e) => setBrandEditForm({ ...brandEditForm, personTitle: e.target.value })}
                      placeholder="e.g., Wellness Director"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Credentials</Label>
                  <Input
                    value={brandEditForm.personCredentials}
                    onChange={(e) => setBrandEditForm({ ...brandEditForm, personCredentials: e.target.value })}
                    placeholder="e.g., MD, PhD, Certified Nutritionist"
                    className="text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="consent-checkbox"
                    checked={brandEditForm.consentObtained}
                    onChange={(e) => setBrandEditForm({ ...brandEditForm, consentObtained: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="consent-checkbox" className="text-xs font-normal cursor-pointer">
                    Consent obtained for marketing use
                  </Label>
                </div>
              </div>
            )}

            {/* Conditional Product Info (for Products category) */}
            {brandEditForm.assetCategory === 'products' && (
              <div className="space-y-3 p-3 bg-green-50 border border-green-100 rounded-md">
                <Label className="text-sm font-medium text-green-800">Product Details</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Product Name</Label>
                    <Input
                      value={brandEditForm.productName}
                      onChange={(e) => setBrandEditForm({ ...brandEditForm, productName: e.target.value })}
                      placeholder="e.g., CBD Tincture 500mg"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">SKU</Label>
                    <Input
                      value={brandEditForm.productSku}
                      onChange={(e) => setBrandEditForm({ ...brandEditForm, productSku: e.target.value })}
                      placeholder="e.g., PHF-CBD-500"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Entity Name - kept for backwards compatibility */}
            <div>
              <Label>Entity/Location Name</Label>
              <Input
                value={brandEditForm.entityName}
                onChange={(e) => setBrandEditForm({ ...brandEditForm, entityName: e.target.value })}
                placeholder="e.g., Lake Geneva Store, Pine Hill Farm"
                data-testid="brand-edit-entity-name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional - specify which location or entity this asset belongs to
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditingBrand(false);
              setReplacementFile(null);
              setReplacementPreview(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!selectedBrandAsset) return;
                
                setIsUploadingReplacement(true);
                try {
                  let newUrl = brandEditForm.url;
                  
                  // If there's a replacement file, upload it first
                  if (replacementFile) {
                    const formData = new FormData();
                    formData.append('file', replacementFile);
                    formData.append('type', brandEditForm.mediaType === 'video' ? 'video' : 'image');
                    formData.append('name', brandEditForm.name);
                    formData.append('tags', brandEditForm.matchKeywords);
                    
                    const uploadResponse = await fetch('/api/videos/uploads', {
                      method: 'POST',
                      body: formData,
                      credentials: 'include',
                    });
                    
                    if (!uploadResponse.ok) {
                      throw new Error('Failed to upload file');
                    }
                    
                    const uploadResult = await uploadResponse.json();
                    newUrl = uploadResult.upload?.url || uploadResult.url;
                    
                    if (!newUrl) {
                      throw new Error('No URL returned from upload');
                    }
                  }
                  
                  // Now update the brand asset with the new URL
                  // When a file is replaced, update both url and thumbnailUrl to keep them in sync
                  const thumbnailUrl = replacementFile ? newUrl : selectedBrandAsset.thumbnailUrl;
                  
                  const personInfo = brandEditForm.assetCategory === 'people' ? {
                      name: brandEditForm.personName || null,
                      title: brandEditForm.personTitle || null,
                      credentials: brandEditForm.personCredentials || null,
                      consentObtained: brandEditForm.consentObtained,
                    } : null;
                    
                    const productInfo = brandEditForm.assetCategory === 'products' ? {
                      productName: brandEditForm.productName || null,
                      sku: brandEditForm.productSku || null,
                    } : null;

                  updateBrandAssetMutation.mutate({
                    id: selectedBrandAsset.id,
                    data: {
                      name: brandEditForm.name,
                      description: brandEditForm.description,
                      mediaType: brandEditForm.mediaType,
                      entityName: brandEditForm.entityName,
                      entityType: brandEditForm.entityType,
                      url: newUrl,
                      thumbnailUrl: thumbnailUrl,
                      matchKeywords: brandEditForm.matchKeywords ? brandEditForm.matchKeywords.split(',').map(k => k.trim()).filter(Boolean) : [],
                      usageContexts: brandEditForm.usageContexts ? brandEditForm.usageContexts.split(',').map(c => c.trim()).filter(Boolean) : [],
                      assetCategory: brandEditForm.assetCategory || null,
                      assetType: brandEditForm.assetType || null,
                      personInfo,
                      productInfo,
                    }
                  });
                  
                  setReplacementFile(null);
                  setReplacementPreview(null);
                } catch (error) {
                  console.error('Error updating brand asset:', error);
                  toast({
                    title: 'Error',
                    description: error instanceof Error ? error.message : 'Failed to update brand asset',
                    variant: 'destructive',
                  });
                } finally {
                  setIsUploadingReplacement(false);
                }
              }}
              disabled={updateBrandAssetMutation.isPending || isUploadingReplacement}
              data-testid="brand-edit-save"
            >
              {isUploadingReplacement ? 'Uploading...' : updateBrandAssetMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Brand Asset Dialog */}
      <Dialog open={isCreatingBrand} onOpenChange={(open) => {
        setIsCreatingBrand(open);
        if (!open) {
          setNewBrandFile(null);
          setNewBrandPreview(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Brand Asset</DialogTitle>
            <DialogDescription>
              Upload a new brand asset like a logo, store photo, or location image.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Media File *</Label>
              <div className="mt-2 border rounded-lg overflow-hidden bg-gray-100">
                <div className="aspect-video relative flex items-center justify-center">
                  {newBrandPreview ? (
                    newBrandForm.mediaType === 'video' ? (
                      <video src={newBrandPreview} controls className="w-full h-full object-contain" />
                    ) : (
                      <img src={newBrandPreview} alt="New media" className="w-full h-full object-contain" />
                    )
                  ) : (
                    <div className="text-gray-400 text-sm flex flex-col items-center">
                      <Upload className="h-8 w-8 mb-2" />
                      <span>Select a file to upload</span>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t bg-white">
                  <Input
                    type="file"
                    accept={newBrandForm.mediaType === 'video' ? 'video/*' : 'image/*'}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNewBrandFile(file);
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setNewBrandPreview(ev.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                        if (!newBrandForm.name) {
                          setNewBrandForm({ ...newBrandForm, name: file.name.replace(/\.[^/.]+$/, '') });
                        }
                      }
                    }}
                    data-testid="brand-create-file"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <Label>Name *</Label>
              <Input
                value={newBrandForm.name}
                onChange={(e) => setNewBrandForm({ ...newBrandForm, name: e.target.value })}
                placeholder="e.g., Pine Hill Farm Logo"
                data-testid="brand-create-name"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={newBrandForm.description}
                onChange={(e) => setNewBrandForm({ ...newBrandForm, description: e.target.value })}
                placeholder="Describe this asset..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Media Type</Label>
                <Select value={newBrandForm.mediaType} onValueChange={(v) => setNewBrandForm({ ...newBrandForm, mediaType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logo">Logo</SelectItem>
                    <SelectItem value="photo">Photo</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="broll">B-Roll</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entity Type</Label>
                <Select value={newBrandForm.entityType} onValueChange={(v) => setNewBrandForm({ ...newBrandForm, entityType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brand">Brand</SelectItem>
                    <SelectItem value="location">Location</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="person">Person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Entity Name</Label>
              <Input
                value={newBrandForm.entityName}
                onChange={(e) => setNewBrandForm({ ...newBrandForm, entityName: e.target.value })}
                placeholder="e.g., Pine Hill Farm, Lake Geneva Retail"
              />
            </div>

            {/* Category Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select 
                  value={newBrandForm.assetCategory || ''} 
                  onValueChange={(v) => setNewBrandForm({ 
                    ...newBrandForm, 
                    assetCategory: v,
                    assetType: '',
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TAXONOMY_CATEGORIES.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Asset Type {newBrandForm.assetCategory ? '*' : ''}</Label>
                <Select 
                  value={newBrandForm.assetType || ''} 
                  onValueChange={(v) => setNewBrandForm({ ...newBrandForm, assetType: v })}
                  disabled={!newBrandForm.assetCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={newBrandForm.assetCategory ? 'Select type...' : 'Select category first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {newBrandForm.assetCategory && getTypesByCategory(newBrandForm.assetCategory).map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conditional Person Info */}
            {newBrandForm.assetCategory === 'people' && (
              <div className="space-y-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                <Label className="text-sm font-medium text-blue-800">Person Details</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={newBrandForm.personName}
                      onChange={(e) => setNewBrandForm({ ...newBrandForm, personName: e.target.value })}
                      placeholder="e.g., Dr. Sarah Johnson"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={newBrandForm.personTitle}
                      onChange={(e) => setNewBrandForm({ ...newBrandForm, personTitle: e.target.value })}
                      placeholder="e.g., Wellness Director"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Credentials</Label>
                  <Input
                    value={newBrandForm.personCredentials}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, personCredentials: e.target.value })}
                    placeholder="e.g., MD, PhD"
                    className="text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="new-consent-checkbox"
                    checked={newBrandForm.consentObtained}
                    onChange={(e) => setNewBrandForm({ ...newBrandForm, consentObtained: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="new-consent-checkbox" className="text-xs font-normal cursor-pointer">
                    Consent obtained for marketing use
                  </Label>
                </div>
              </div>
            )}

            {/* Conditional Product Info */}
            {newBrandForm.assetCategory === 'products' && (
              <div className="space-y-3 p-3 bg-green-50 border border-green-100 rounded-md">
                <Label className="text-sm font-medium text-green-800">Product Details</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Product Name</Label>
                    <Input
                      value={newBrandForm.productName}
                      onChange={(e) => setNewBrandForm({ ...newBrandForm, productName: e.target.value })}
                      placeholder="e.g., CBD Tincture 500mg"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">SKU</Label>
                    <Input
                      value={newBrandForm.productSku}
                      onChange={(e) => setNewBrandForm({ ...newBrandForm, productSku: e.target.value })}
                      placeholder="e.g., PHF-CBD-500"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreatingBrand(false)}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!newBrandFile) {
                  toast({ title: 'Error', description: 'Please select a file to upload.', variant: 'destructive' });
                  return;
                }
                if (!newBrandForm.name.trim()) {
                  toast({ title: 'Error', description: 'Please enter a name for the asset.', variant: 'destructive' });
                  return;
                }
                
                setIsUploadingReplacement(true);
                try {
                  const formData = new FormData();
                  formData.append('file', newBrandFile);
                  formData.append('type', newBrandForm.mediaType === 'video' ? 'video' : 'image');
                  formData.append('name', newBrandForm.name);
                  formData.append('tags', newBrandForm.assetType || '');
                  
                  const uploadResponse = await fetch('/api/videos/uploads', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                  });
                  
                  if (!uploadResponse.ok) {
                    throw new Error('Failed to upload file');
                  }
                  
                  const uploadResult = await uploadResponse.json();
                  const newUrl = uploadResult.upload?.url || uploadResult.url;
                  
                  if (!newUrl) {
                    throw new Error('No URL returned from upload');
                  }
                  
                  const personInfo = newBrandForm.assetCategory === 'people' ? {
                    name: newBrandForm.personName || null,
                    title: newBrandForm.personTitle || null,
                    credentials: newBrandForm.personCredentials || null,
                    consentObtained: newBrandForm.consentObtained,
                  } : null;
                  
                  const productInfo = newBrandForm.assetCategory === 'products' ? {
                    productName: newBrandForm.productName || null,
                    sku: newBrandForm.productSku || null,
                  } : null;
                  
                  createBrandAssetMutation.mutate({
                    name: newBrandForm.name,
                    description: newBrandForm.description,
                    mediaType: newBrandForm.mediaType,
                    entityName: newBrandForm.entityName,
                    entityType: newBrandForm.entityType,
                    url: newUrl,
                    thumbnailUrl: newUrl,
                    matchKeywords: [],
                    usageContexts: [],
                    assetCategory: newBrandForm.assetCategory || null,
                    assetType: newBrandForm.assetType || null,
                    personInfo,
                    productInfo,
                  });
                } catch (error) {
                  console.error('Error creating brand asset:', error);
                  toast({
                    title: 'Error',
                    description: error instanceof Error ? error.message : 'Failed to create brand asset',
                    variant: 'destructive',
                  });
                } finally {
                  setIsUploadingReplacement(false);
                }
              }}
              disabled={createBrandAssetMutation.isPending || isUploadingReplacement}
              data-testid="brand-create-save"
            >
              {isUploadingReplacement ? 'Uploading...' : createBrandAssetMutation.isPending ? 'Creating...' : 'Create Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Brand Asset Details Dialog */}
      <Dialog open={!!selectedBrandAsset && !isEditingBrand} onOpenChange={() => setSelectedBrandAsset(null)}>
        <DialogContent className="max-w-2xl">
          {selectedBrandAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedBrandAsset.name}
                </DialogTitle>
                <DialogDescription>
                  Brand asset details and matching configuration
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-6">
                <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                  {selectedBrandAsset.mediaType === 'video' ? (
                    <video src={selectedBrandAsset.url} controls className="w-full h-full" />
                  ) : (
                    <img 
                      src={selectedBrandAsset.url} 
                      alt={selectedBrandAsset.name} 
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-gray-500">Media Type</Label>
                    <Badge variant="secondary">{selectedBrandAsset.mediaType}</Badge>
                  </div>
                  {selectedBrandAsset.entityName && (
                    <div>
                      <Label className="text-xs text-gray-500">Entity</Label>
                      <p className="font-medium">{selectedBrandAsset.entityName} ({selectedBrandAsset.entityType})</p>
                    </div>
                  )}
                  {selectedBrandAsset.description && (
                    <div>
                      <Label className="text-xs text-gray-500">Description</Label>
                      <p className="text-sm text-gray-700">{selectedBrandAsset.description}</p>
                    </div>
                  )}
                  {/* Category & Asset Type (New Taxonomy) */}
                  {selectedBrandAsset.assetType && getAssetType(selectedBrandAsset.assetType) && (
                    <div>
                      <Label className="text-xs text-gray-500">Category & Type</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="default" className="text-xs">
                          {TAXONOMY_CATEGORIES.find(c => c.id === getAssetType(selectedBrandAsset.assetType!)?.category)?.label || 'Unknown'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {getAssetType(selectedBrandAsset.assetType!)?.label}
                        </Badge>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsEditingBrand(true);
                        const assetTypeInfo = selectedBrandAsset.assetType ? getAssetType(selectedBrandAsset.assetType) : null;
                        setBrandEditForm({
                          name: selectedBrandAsset.name,
                          description: selectedBrandAsset.description || '',
                          mediaType: selectedBrandAsset.mediaType,
                          entityName: selectedBrandAsset.entityName || '',
                          entityType: selectedBrandAsset.entityType || 'brand',
                          url: selectedBrandAsset.url,
                          matchKeywords: selectedBrandAsset.matchKeywords?.join(', ') || '',
                          usageContexts: selectedBrandAsset.usageContexts?.join(', ') || '',
                          assetCategory: assetTypeInfo?.category || '',
                          assetType: selectedBrandAsset.assetType || '',
                          personName: (selectedBrandAsset.personInfo as any)?.name || '',
                          personTitle: (selectedBrandAsset.personInfo as any)?.title || '',
                          personCredentials: (selectedBrandAsset.personInfo as any)?.credentials || '',
                          consentObtained: (selectedBrandAsset.personInfo as any)?.consentObtained || false,
                          productName: (selectedBrandAsset.productInfo as any)?.productName || '',
                          productSku: (selectedBrandAsset.productInfo as any)?.sku || '',
                        });
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this brand asset?')) {
                          deleteBrandAssetMutation.mutate(selectedBrandAsset.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
        <DialogContent className="max-w-4xl bg-gray-900 border-gray-700 text-white">
          {selectedAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  {getAssetTypeIcon(selectedAsset.type)}
                  {selectedAsset.name}
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Asset details and preview
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                  {selectedAsset.type === 'image' && (
                    <img src={selectedAsset.url} alt={selectedAsset.name} className="max-w-full max-h-[60vh] object-contain" />
                  )}
                  {selectedAsset.type === 'video' && (
                    <video src={selectedAsset.url} controls autoPlay className="max-w-full max-h-[60vh]" />
                  )}
                  {selectedAsset.type === 'music' && (
                    <div className="w-full py-12 flex flex-col items-center justify-center bg-gradient-to-br from-purple-600/30 to-pink-600/30">
                      <Music className="h-16 w-16 text-purple-400 mb-4" />
                      <audio src={selectedAsset.url} controls autoPlay className="w-4/5" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <Label className="text-[10px] uppercase tracking-wider text-gray-500">Source</Label>
                    <Badge className={`mt-1 ${getSourceBadgeColor(selectedAsset.source)}`}>
                      {selectedAsset.source}
                    </Badge>
                  </div>
                  {selectedAsset.width && selectedAsset.height && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Label className="text-[10px] uppercase tracking-wider text-gray-500">Dimensions</Label>
                      <p className="text-sm font-medium text-gray-200 mt-1">{selectedAsset.width} x {selectedAsset.height}</p>
                    </div>
                  )}
                  {selectedAsset.duration && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Label className="text-[10px] uppercase tracking-wider text-gray-500">Duration</Label>
                      <p className="text-sm font-medium text-gray-200 mt-1">{formatDuration(selectedAsset.duration)}</p>
                    </div>
                  )}
                  {selectedAsset.file_size && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Label className="text-[10px] uppercase tracking-wider text-gray-500">File Size</Label>
                      <p className="text-sm font-medium text-gray-200 mt-1">{formatFileSize(selectedAsset.file_size)}</p>
                    </div>
                  )}
                </div>
                {selectedAsset.prompt && (
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <Label className="text-[10px] uppercase tracking-wider text-gray-500">AI Prompt</Label>
                    <p className="text-sm text-gray-300 mt-1">{selectedAsset.prompt}</p>
                  </div>
                )}
                {selectedAsset.tags && selectedAsset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedAsset.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs border-gray-600 text-gray-300">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = selectedAsset.url;
                      a.download = selectedAsset.name || 'asset';
                      a.target = '_blank';
                      a.click();
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLibraryAsset} onOpenChange={() => setSelectedLibraryAsset(null)}>
        <DialogContent className="max-w-4xl bg-gray-900 border-gray-700 text-white">
          {selectedLibraryAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  {selectedLibraryAsset.assetType === 'video' ? <Video className="h-5 w-5 text-purple-400" /> : <Image className="h-5 w-5 text-purple-400" />}
                  {selectedLibraryAsset.prompt?.substring(0, 80) || 'Generated Asset'}
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  AI-generated {selectedLibraryAsset.assetType} preview
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                  {selectedLibraryAsset.assetType === 'image' && (
                    <img
                      src={selectedLibraryAsset.assetUrl}
                      alt={selectedLibraryAsset.prompt?.substring(0, 40) || 'Generated'}
                      className="max-w-full max-h-[60vh] object-contain"
                    />
                  )}
                  {selectedLibraryAsset.assetType === 'video' && (
                    <video
                      src={selectedLibraryAsset.assetUrl}
                      controls
                      autoPlay
                      className="max-w-full max-h-[60vh]"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <Label className="text-[10px] uppercase tracking-wider text-gray-500">Type</Label>
                    <Badge className="mt-1 bg-purple-600/90 text-white border-0">
                      {selectedLibraryAsset.contentType?.toUpperCase() || selectedLibraryAsset.assetType?.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <Label className="text-[10px] uppercase tracking-wider text-gray-500">Provider</Label>
                    <p className="text-sm font-medium text-gray-200 mt-1">{selectedLibraryAsset.provider || 'auto'}</p>
                  </div>
                  {selectedLibraryAsset.width && selectedLibraryAsset.height && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Label className="text-[10px] uppercase tracking-wider text-gray-500">Dimensions</Label>
                      <p className="text-sm font-medium text-gray-200 mt-1">{selectedLibraryAsset.width} x {selectedLibraryAsset.height}</p>
                    </div>
                  )}
                  {selectedLibraryAsset.duration && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Label className="text-[10px] uppercase tracking-wider text-gray-500">Duration</Label>
                      <p className="text-sm font-medium text-gray-200 mt-1">{selectedLibraryAsset.duration}s</p>
                    </div>
                  )}
                </div>
                {selectedLibraryAsset.prompt && (
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <Label className="text-[10px] uppercase tracking-wider text-gray-500">Prompt</Label>
                    <p className="text-sm text-gray-300 mt-1">{selectedLibraryAsset.prompt}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = selectedLibraryAsset.assetUrl;
                      a.download = `asset-${selectedLibraryAsset.id}`;
                      a.target = '_blank';
                      a.click();
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this asset?')) {
                        deleteLibraryAssetMutation.mutate(selectedLibraryAsset.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Unified Media Asset Classification Dialog */}
      <Dialog open={!!selectedUnifiedAsset} onOpenChange={() => {
        setSelectedUnifiedAsset(null);
        setIsClassifying(false);
        setClassifyForm({
          classification: 'general',
          name: '',
          description: '',
          mediaType: 'photo',
          entityName: '',
          entityType: 'brand',
          matchKeywords: '',
          usageContexts: '',
        });
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedUnifiedAsset && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isClassifying ? 'Classify Asset' : selectedUnifiedAsset.name}
                </DialogTitle>
                <DialogDescription>
                  {isClassifying 
                    ? 'Choose how to classify this asset. Brand assets appear in the Brand Media tab.'
                    : 'View and manage this asset'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                  {selectedUnifiedAsset.type === 'image' ? (
                    <img src={selectedUnifiedAsset.url} alt={selectedUnifiedAsset.name} className="w-full h-full object-contain" />
                  ) : selectedUnifiedAsset.type === 'video' ? (
                    <video src={selectedUnifiedAsset.url} controls className="w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                      <Music className="h-16 w-16 mb-4" />
                      <audio src={selectedUnifiedAsset.url} controls className="w-4/5" />
                    </div>
                  )}
                </div>

                {!isClassifying ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{selectedUnifiedAsset.type}</Badge>
                      <Badge className={
                        selectedUnifiedAsset.classification === 'uncategorized' ? 'bg-amber-500' :
                        selectedUnifiedAsset.classification === 'brand' ? 'bg-purple-600' : 'bg-blue-600'
                      }>
                        {selectedUnifiedAsset.classification === 'uncategorized' ? 'Needs Classification' : selectedUnifiedAsset.classification}
                      </Badge>
                    </div>
                    {selectedUnifiedAsset.description && (
                      <p className="text-sm text-gray-600">{selectedUnifiedAsset.description}</p>
                    )}
                    <div className="flex gap-2 pt-4">
                      <Button 
                        className="flex-1" 
                        onClick={() => setIsClassifying(true)}
                        data-testid="classify-asset-btn"
                      >
                        <Tag className="h-4 w-4 mr-2" />
                        Classify Asset
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this asset?')) {
                            deleteUnifiedAssetMutation.mutate(selectedUnifiedAsset.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Classification</Label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <Button
                          variant={classifyForm.classification === 'general' ? 'default' : 'outline'}
                          className="h-auto py-4 flex flex-col items-center gap-2"
                          onClick={() => setClassifyForm({ ...classifyForm, classification: 'general' })}
                          data-testid="classify-general-btn"
                        >
                          <Image className="h-6 w-6" />
                          <span className="font-medium">General Asset</span>
                          <span className="text-xs opacity-70">Stays in Asset Library</span>
                        </Button>
                        <Button
                          variant={classifyForm.classification === 'brand' ? 'default' : 'outline'}
                          className="h-auto py-4 flex flex-col items-center gap-2"
                          onClick={() => setClassifyForm({ ...classifyForm, classification: 'brand' })}
                          data-testid="classify-brand-btn"
                        >
                          <Building2 className="h-6 w-6" />
                          <span className="font-medium">Brand Asset</span>
                          <span className="text-xs opacity-70">Moves to Brand Media</span>
                        </Button>
                      </div>
                    </div>

                    {classifyForm.classification === 'brand' && (
                      <>
                        <div>
                          <Label>Name</Label>
                          <Input
                            value={classifyForm.name}
                            onChange={(e) => setClassifyForm({ ...classifyForm, name: e.target.value })}
                            placeholder="Asset name"
                          />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Textarea
                            value={classifyForm.description}
                            onChange={(e) => setClassifyForm({ ...classifyForm, description: e.target.value })}
                            placeholder="Describe this asset..."
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Media Type</Label>
                            <Select value={classifyForm.mediaType} onValueChange={(v) => setClassifyForm({ ...classifyForm, mediaType: v })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="logo">Logo</SelectItem>
                                <SelectItem value="photo">Photo</SelectItem>
                                <SelectItem value="video">Video</SelectItem>
                                <SelectItem value="broll">B-Roll</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Entity Type</Label>
                            <Select value={classifyForm.entityType} onValueChange={(v) => setClassifyForm({ ...classifyForm, entityType: v })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="brand">Brand</SelectItem>
                                <SelectItem value="location">Location</SelectItem>
                                <SelectItem value="product">Product</SelectItem>
                                <SelectItem value="person">Person</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Entity Name</Label>
                          <Input
                            value={classifyForm.entityName}
                            onChange={(e) => setClassifyForm({ ...classifyForm, entityName: e.target.value })}
                            placeholder="e.g., Pine Hill Farm, Lake Geneva Store"
                          />
                        </div>
                        <div>
                          <Label>Match Keywords (comma-separated)</Label>
                          <Input
                            value={classifyForm.matchKeywords}
                            onChange={(e) => setClassifyForm({ ...classifyForm, matchKeywords: e.target.value })}
                            placeholder="e.g., logo, brand, wellness"
                          />
                        </div>
                        <div>
                          <Label>Usage Contexts (comma-separated)</Label>
                          <Input
                            value={classifyForm.usageContexts}
                            onChange={(e) => setClassifyForm({ ...classifyForm, usageContexts: e.target.value })}
                            placeholder="e.g., intro, outro, overlay"
                          />
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" onClick={() => setIsClassifying(false)} className="flex-1">
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => {
                          const brandData = classifyForm.classification === 'brand' ? {
                            name: classifyForm.name,
                            description: classifyForm.description,
                            mediaType: classifyForm.mediaType,
                            entityName: classifyForm.entityName,
                            entityType: classifyForm.entityType,
                            matchKeywords: classifyForm.matchKeywords.split(',').map(k => k.trim()).filter(Boolean),
                            usageContexts: classifyForm.usageContexts.split(',').map(c => c.trim()).filter(Boolean),
                          } : undefined;
                          
                          classifyAssetMutation.mutate({
                            id: selectedUnifiedAsset.id,
                            classification: classifyForm.classification,
                            brandData,
                          });
                        }}
                        disabled={classifyAssetMutation.isPending}
                        data-testid="save-classification-btn"
                      >
                        {classifyAssetMutation.isPending ? 'Saving...' : 'Save Classification'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* New Structured Asset Upload Modal */}
      <AssetUploadModal
        isOpen={isNewUploadModalOpen}
        onClose={() => setIsNewUploadModalOpen(false)}
        onUpload={handleNewUpload}
      />

      <AssetCreatorDialog
        open={isCreatorOpen}
        onOpenChange={setIsCreatorOpen}
        onJobStarted={handleJobStarted}
      />
    </div>
  );
}
