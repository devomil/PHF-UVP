import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QrCode, Download, Copy, ExternalLink, Zap, History, Plus, ArrowLeft, Image, FlaskConical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import AdminLayout from '@/components/admin-layout';
import QrCodeHistory from '@/components/qr-code-history';
import UniversalVideoProducer from '@/components/universal-video-producer';
import AssetLibrary from '@/components/asset-library';
import ProviderTestingPlayground from '@/components/provider-testing-playground';
import { useLocation } from 'wouter';
import { Wand2 } from 'lucide-react';

export default function MarketingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [saveToHistory, setSaveToHistory] = useState(false);

  // Generate QR code mutation
  const generateQrCodeMutation = useMutation({
    mutationFn: async (data: {
      url: string;
      title?: string;
      description?: string;
      category?: string;
      saveToHistory?: boolean;
    }) => {
      const response = await apiRequest('POST', '/api/marketing/generate-qr', data);
      return response.json();
    },
    onSuccess: (data) => {
      setQrCodeDataUrl(data.qrCodeDataUrl);
      if (data.savedQrCode) {
        queryClient.invalidateQueries({ queryKey: ['/api/marketing/qr-codes'] });
        toast({
          title: "QR Code Generated & Saved",
          description: "Your QR code has been created and saved to history!",
        });
      } else {
        toast({
          title: "QR Code Generated",
          description: "Your QR code has been successfully created!",
        });
      }
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate QR code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateQRCode = async () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a URL to generate a QR code.",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://example.com)",
        variant: "destructive",
      });
      return;
    }

    if (saveToHistory && !title.trim()) {
      toast({
        title: "Title Required",
        description: "Please enter a title when saving to history.",
        variant: "destructive",
      });
      return;
    }

    generateQrCodeMutation.mutate({
      url,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      saveToHistory,
    });
  };

  const downloadQRCode = () => {
    if (!qrCodeDataUrl) return;

    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    const filename = title.trim() 
      ? `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qr_code.png`
      : `qr-code-${Date.now()}.png`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Download Started",
      description: "Your QR code is being downloaded.",
    });
  };

  const copyToClipboard = async () => {
    if (!qrCodeDataUrl) return;

    try {
      // Convert data URL to blob and copy to clipboard
      const response = await fetch(qrCodeDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      toast({
        title: "Copied to Clipboard",
        description: "QR code image has been copied to your clipboard.",
      });
    } catch (error) {
      console.error('Failed to copy image, copying URL instead:', error);
      // Fallback: copy the original URL
      navigator.clipboard.writeText(url);
      toast({
        title: "URL Copied",
        description: "QR code URL has been copied to your clipboard.",
      });
    }
  };

  const clearForm = () => {
    setUrl('');
    setTitle('');
    setDescription('');
    setCategory('');
    setSaveToHistory(false);
    setQrCodeDataUrl('');
  };

  const handleSelectQrCode = (qrCode: any) => {
    setUrl(qrCode.url);
    setTitle(qrCode.title);
    setDescription(qrCode.description || '');
    setCategory(qrCode.category || '');
    setQrCodeDataUrl(qrCode.qrCodeData);
    setSaveToHistory(false); // Don't auto-save when loading from history
  };

  return (
    <AdminLayout currentTab="marketing">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Marketing Tools
            </h1>
            <p className="text-gray-600">
              Generate QR codes for marketing campaigns and track their usage
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation('/admin')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        <Tabs defaultValue="universal-producer" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="universal-producer" className="flex items-center gap-2" data-testid="tab-universal-producer">
              <Wand2 className="h-4 w-4" />
              Video Studio
            </TabsTrigger>
            <TabsTrigger value="api-playground" className="flex items-center gap-2" data-testid="tab-api-playground">
              <FlaskConical className="h-4 w-4" />
              API Playground
            </TabsTrigger>
            <TabsTrigger value="asset-library" className="flex items-center gap-2" data-testid="tab-asset-library">
              <Image className="h-4 w-4" />
              Assets
            </TabsTrigger>
            <TabsTrigger value="generator" className="flex items-center gap-2" data-testid="tab-qr-generator">
              <Plus className="h-4 w-4" />
              QR Codes
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2" data-testid="tab-qr-history">
              <History className="h-4 w-4" />
              QR History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="universal-producer" className="space-y-6">
            <UniversalVideoProducer />
          </TabsContent>

          <TabsContent value="api-playground" className="space-y-6">
            <ProviderTestingPlayground />
          </TabsContent>

          <TabsContent value="asset-library" className="space-y-6">
            <AssetLibrary />
          </TabsContent>

          <TabsContent value="generator" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* QR Code Generator Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="h-5 w-5" />
                    Generate QR Code
                  </CardTitle>
                  <CardDescription>
                    Create QR codes for websites, social media, or any URL
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="url">URL *</Label>
                    <Input
                      id="url"
                      type="url"
                      placeholder="https://pinehillfarm.co"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* Save to History Section */}
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="saveToHistory"
                        checked={saveToHistory}
                        onCheckedChange={(checked) => setSaveToHistory(!!checked)}
                      />
                      <Label htmlFor="saveToHistory" className="text-sm font-medium">
                        Save to history for future management
                      </Label>
                    </div>

                    {saveToHistory && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="title">Title *</Label>
                          <Input
                            id="title"
                            placeholder="Pine Hill Farm Website"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            placeholder="Main website QR code for marketing materials"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="category">Category</Label>
                          <Input
                            id="category"
                            placeholder="Website, Social Media, Products, etc."
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={generateQRCode} 
                      disabled={generateQrCodeMutation.isPending}
                      className="flex-1"
                    >
                      {generateQrCodeMutation.isPending ? (
                        <>
                          <Zap className="h-4 w-4 mr-2 animate-pulse" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Generate QR Code
                        </>
                      )}
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      onClick={clearForm}
                      disabled={generateQrCodeMutation.isPending}
                    >
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* QR Code Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>QR Code Preview</CardTitle>
                  <CardDescription>
                    Your generated QR code will appear here
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {qrCodeDataUrl ? (
                    <div className="space-y-4">
                      <div className="flex justify-center p-4 bg-gray-50 rounded-lg">
                        <img 
                          src={qrCodeDataUrl} 
                          alt="Generated QR Code" 
                          className="w-48 h-48 border-2 border-gray-200 rounded"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          <strong>Target URL:</strong>
                        </p>
                        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                          <a 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline break-all"
                          >
                            {url}
                          </a>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={downloadQRCode} className="flex-1">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button variant="outline" onClick={copyToClipboard} className="flex-1">
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                      <QrCode className="h-16 w-16 mb-4" />
                      <p className="text-lg font-medium">No QR Code Generated</p>
                      <p className="text-sm">Enter a URL and click "Generate QR Code" to get started</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Marketing Tips */}
            <Card>
              <CardHeader>
                <CardTitle>Marketing Tips</CardTitle>
                <CardDescription>Best practices for using QR codes in your marketing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Badge variant="outline">Print Quality</Badge>
                    <p className="text-sm text-gray-600">
                      Use high-contrast colors and ensure QR codes are at least 1 inch (2.5cm) square when printed
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Badge variant="outline">Testing</Badge>
                    <p className="text-sm text-gray-600">
                      Always test your QR codes before printing by scanning them with multiple devices
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Badge variant="outline">Call to Action</Badge>
                    <p className="text-sm text-gray-600">
                      Include clear instructions like "Scan for menu" or "Scan to visit our website"
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <QrCodeHistory onSelectQrCode={handleSelectQrCode} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}