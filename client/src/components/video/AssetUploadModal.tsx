import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ASSET_CATEGORIES, getTypesByCategory } from '@shared/brand-asset-types';
import { Upload, X } from 'lucide-react';

export interface AssetMetadata {
  name: string;
  description?: string;
  assetType: string;
  tags?: string[];
  personInfo?: { name?: string; title?: string; credentials?: string; consentObtained: boolean } | null;
  productInfo?: { productName?: string; sku?: string } | null;
}

interface AssetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, metadata: AssetMetadata) => void;
}

export function AssetUploadModal({ isOpen, onClose, onUpload }: AssetUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [assetType, setAssetType] = useState('');
  const [tags, setTags] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoryTypes = selectedCategory ? getTypesByCategory(selectedCategory) : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    if (!name) {
      setName(selected.name.replace(/\.[^/.]+$/, ''));
    }
    if (preview) URL.revokeObjectURL(preview);
    if (selected.type.startsWith('image/') || selected.type.startsWith('video/')) {
      setPreview(URL.createObjectURL(selected));
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = () => {
    if (!file || !name.trim() || !assetType) return;
    const metadata: AssetMetadata = {
      name: name.trim(),
      description: description.trim() || undefined,
      assetType,
      tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      personInfo: null,
      productInfo: null,
    };
    onUpload(file, metadata);
    resetForm();
  };

  const resetForm = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setName('');
    setDescription('');
    setSelectedCategory('');
    setAssetType('');
    setTags('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Brand Asset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          {preview && file && (
            <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              {file.type.startsWith('image/') ? (
                <img src={preview} alt="Preview" className="w-full max-h-48 object-contain bg-gray-50 dark:bg-gray-900" />
              ) : file.type.startsWith('video/') ? (
                <video src={preview} controls className="w-full max-h-48 bg-gray-50 dark:bg-gray-900" />
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 text-white hover:bg-black/70"
                onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="asset-name">Name</Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Asset name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-description">Description</Label>
            <Textarea
              id="asset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setAssetType(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CATEGORIES.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCategory && categoryTypes.length > 0 && (
            <div className="space-y-2">
              <Label>Asset Type</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select asset type" />
                </SelectTrigger>
                <SelectContent>
                  {categoryTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="asset-tags">Tags (comma-separated)</Label>
            <Input
              id="asset-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. product, hero, lifestyle"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !name.trim() || !assetType}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssetUploadModal;
