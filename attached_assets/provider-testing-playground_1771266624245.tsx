import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Video, 
  Image as ImageIcon, 
  Play, 
  RotateCcw, 
  Upload, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Clock,
  ChevronRight,
  Settings2
} from 'lucide-react';

interface VideoProvider {
  id: string;
  name: string;
  category: 'video';
  capabilities: {
    t2v: boolean;
    i2v: boolean;
    v2v: boolean;
  };
  supportedAspectRatios: string[];
  maxDuration: number;
  costPerSecond: number;
}

interface ImageProviderInfo {
  id: string;
  name: string;
  category: 'image';
  capabilities: {
    t2i: boolean;
    i2i: boolean;
  };
  supportedAspectRatios: string[];
  costPerImage: number;
}

interface TaskResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  provider: string;
  taskType: string;
  prompt: string;
  startTime: number;
  result?: {
    url?: string;
    thumbnailUrl?: string;
    duration?: number;
    cost?: number;
  };
  error?: string | { code?: string; raw_message?: string; message?: string; detail?: string };
  logs: string[];
}

export default function ProviderTestingPlayground() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<'video' | 'image'>('video');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [taskType, setTaskType] = useState<string>('t2v');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState('720p');
  const [generateAudio, setGenerateAudio] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-object', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload file');
      }
      
      return response.json();
    },
  });

  const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    
    try {
      const result = await uploadFileMutation.mutateAsync(file);
      
      if (result.url && typeof result.url === 'string' && (result.url.startsWith('http') || result.url.startsWith('/'))) {
        setImageUrl(result.url);
        toast({
          title: "Image Uploaded",
          description: "Image ready to use for generation",
        });
      } else {
        toast({
          title: "Upload Failed",
          description: "Server did not return a valid image URL",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [uploadFileMutation, toast]);

  const { data: providers, isLoading: loadingProviders } = useQuery<{
    video: VideoProvider[];
    image: ImageProviderInfo[];
  }>({
    queryKey: ['/api/provider-test/providers'],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/provider-test/generate', data);
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentTaskId(data.taskId);
      toast({
        title: 'Task Created',
        description: `Task ${data.taskId} is now processing...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!currentTaskId) return;

    let pollErrorCount = 0;
    const maxPollErrors = 3;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/provider-test/task/${currentTaskId}`, {
          credentials: 'include',
        });
        
        if (!response.ok) {
          pollErrorCount++;
          console.error(`Error polling task (${pollErrorCount}/${maxPollErrors}):`, response.status);
          
          if (pollErrorCount >= maxPollErrors) {
            clearInterval(pollInterval);
            setTaskResult(prev => prev ? {
              ...prev,
              status: 'failed',
              error: `Failed to fetch task status (${response.status})`,
            } : null);
          }
          return;
        }
        
        pollErrorCount = 0;
        const task = await response.json();
        setTaskResult(task);

        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(pollInterval);
        }
      } catch (error) {
        pollErrorCount++;
        console.error(`Error polling task (${pollErrorCount}/${maxPollErrors}):`, error);
        
        if (pollErrorCount >= maxPollErrors) {
          clearInterval(pollInterval);
          setTaskResult(prev => prev ? {
            ...prev,
            status: 'failed',
            error: 'Network error while fetching task status',
          } : null);
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentTaskId]);

  const handleGenerate = () => {
    if (!selectedProvider) {
      toast({
        title: 'Select Provider',
        description: 'Please select a provider first',
        variant: 'destructive',
      });
      return;
    }

    if (!prompt.trim()) {
      toast({
        title: 'Enter Prompt',
        description: 'Please enter a prompt',
        variant: 'destructive',
      });
      return;
    }

    if ((taskType === 'i2v' || taskType === 'i2i') && !imageUrl.trim()) {
      toast({
        title: 'Enter Image URL',
        description: `Image URL is required for ${taskType === 'i2v' ? 'Image-to-Video' : 'Image-to-Image'}`,
        variant: 'destructive',
      });
      return;
    }

    generateMutation.mutate({
      provider: selectedProvider,
      taskType,
      prompt,
      imageUrl: (taskType === 'i2v' || taskType === 'i2i') ? imageUrl : undefined,
      aspectRatio,
      duration,
      resolution,
      generateAudio,
    });
  };

  const handleReset = () => {
    setPrompt('');
    setImageUrl('');
    setCurrentTaskId(null);
    setTaskResult(null);
  };

  const selectedProviderInfo = selectedCategory === 'video'
    ? providers?.video.find(p => p.id === selectedProvider)
    : providers?.image.find(p => p.id === selectedProvider);

  const getAvailableTaskTypes = () => {
    if (selectedCategory === 'image') {
      return [
        { value: 't2i', label: 'Text-to-Image' },
        { value: 'i2i', label: 'Image-to-Image' },
      ];
    }
    
    const videoProvider = selectedProviderInfo as VideoProvider | undefined;
    const types = [];
    if (videoProvider?.capabilities.t2v) types.push({ value: 't2v', label: 'Text-to-Video' });
    if (videoProvider?.capabilities.i2v) types.push({ value: 'i2v', label: 'Image-to-Video' });
    if (videoProvider?.capabilities.v2v) types.push({ value: 'v2v', label: 'Video-to-Video' });
    return types.length ? types : [{ value: 't2v', label: 'Text-to-Video' }];
  };

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4">
      <div className="w-64 flex-shrink-0 border rounded-lg overflow-hidden bg-slate-950">
        <div className="p-3 border-b border-slate-800">
          <h3 className="font-medium text-white">Providers</h3>
        </div>
        <ScrollArea className="h-[calc(100%-60px)]">
          <div className="p-2 space-y-4">
            <div>
              <button
                onClick={() => {
                  setSelectedCategory('image');
                  setSelectedProvider('');
                  setTaskType('t2i');
                }}
                className={`flex items-center gap-2 w-full p-2 rounded text-left text-sm font-medium transition-colors ${
                  selectedCategory === 'image' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ImageIcon className="h-4 w-4" />
                Image Models
              </button>
              {selectedCategory === 'image' && providers?.image && (
                <div className="ml-4 mt-1 space-y-1">
                  {providers.image.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={`flex items-center gap-2 w-full p-2 rounded text-left text-sm transition-colors ${
                        selectedProvider === provider.id
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <ChevronRight className="h-3 w-3" />
                      {provider.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <button
                onClick={() => {
                  setSelectedCategory('video');
                  setSelectedProvider('');
                  setTaskType('t2v');
                }}
                className={`flex items-center gap-2 w-full p-2 rounded text-left text-sm font-medium transition-colors ${
                  selectedCategory === 'video' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Video className="h-4 w-4" />
                Video Models
              </button>
              {selectedCategory === 'video' && providers?.video && (
                <div className="ml-4 mt-1 space-y-1">
                  {providers.video.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={`flex items-center gap-2 w-full p-2 rounded text-left text-sm transition-colors ${
                        selectedProvider === provider.id
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <ChevronRight className="h-3 w-3" />
                      {provider.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex gap-4 min-w-0">
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {selectedProvider ? (
                  <>
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                      {selectedCategory === 'video' ? 'Video' : 'Image'}
                    </Badge>
                    {selectedProviderInfo?.name || selectedProvider}
                  </>
                ) : (
                  'Select a Provider'
                )}
              </CardTitle>
              {selectedProvider && (
                <div className="flex gap-2">
                  <Badge variant="outline">
                    {selectedCategory === 'video' 
                      ? `${(selectedProviderInfo as VideoProvider)?.maxDuration}s max`
                      : `$${(selectedProviderInfo as ImageProviderInfo)?.costPerImage}/img`
                    }
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedProvider && (
              <>
                <div className="space-y-2">
                  <Label>Task Type</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableTaskTypes().map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Prompt *</Label>
                  <Textarea
                    placeholder="Describe the video/image you want to generate..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>

                {(taskType === 'i2v' || taskType === 'i2i') && (
                  <div className="space-y-2">
                    <Label>Image URL *</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="flex-1"
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {imageUrl && (
                      <div className="mt-2 relative w-full h-32 rounded-lg overflow-hidden border border-gray-200">
                        <img 
                          src={imageUrl} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced">
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Advanced Settings
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      {selectedCategory === 'video' && (
                        <div className="flex items-center justify-between">
                          <Label>Generate Audio</Label>
                          <Switch
                            checked={generateAudio}
                            onCheckedChange={setGenerateAudio}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Aspect Ratio</Label>
                        <Select value={aspectRatio} onValueChange={setAspectRatio}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                            <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                            <SelectItem value="1:1">1:1 (Square)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedCategory === 'video' && (
                        <>
                          <div className="space-y-2">
                            <Label>Duration (seconds)</Label>
                            <Input
                              type="number"
                              value={duration}
                              onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
                              min={1}
                              max={(selectedProviderInfo as VideoProvider)?.maxDuration || 10}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Resolution</Label>
                            <Select value={resolution} onValueChange={setResolution}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="720p">720p</SelectItem>
                                <SelectItem value="1080p">1080p</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending || (taskResult?.status === 'processing')}
                    className="flex-1"
                  >
                    {generateMutation.isPending || taskResult?.status === 'processing' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </>
            )}

            {!selectedProvider && (
              <div className="text-center py-12 text-muted-foreground">
                <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a provider from the sidebar to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-96 flex-shrink-0 overflow-hidden flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              Task Result
              {taskResult && (
                <Badge
                  variant={
                    taskResult.status === 'completed' ? 'default' :
                    taskResult.status === 'failed' ? 'destructive' :
                    taskResult.status === 'processing' ? 'secondary' : 'outline'
                  }
                >
                  {taskResult.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {taskResult.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                  {taskResult.status === 'processing' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {taskResult.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                  {taskResult.status}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
            {taskResult?.status === 'processing' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground py-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm">Processing your request...</p>
                <p className="text-xs text-muted-foreground">This may take 1-3 minutes</p>
              </div>
            )}

            {taskResult?.result?.url && (
              <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                {selectedCategory === 'video' ? (
                  <video
                    src={taskResult.result.url}
                    controls
                    className="w-full aspect-video object-contain bg-black"
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    src={taskResult.result.url}
                    alt="Generated"
                    className="w-full aspect-video object-contain bg-black"
                  />
                )}
                {taskResult.result.cost && (
                  <div className="p-2 bg-slate-800 text-xs text-slate-400 flex justify-between">
                    <span>Generation cost: ${taskResult.result.cost.toFixed(4)}</span>
                    {taskResult.result.duration && <span>Duration: {taskResult.result.duration}s</span>}
                  </div>
                )}
              </div>
            )}

            {taskResult?.error && (
              <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                <p className="text-sm text-destructive font-medium">
                  {typeof taskResult.error === 'string' 
                    ? taskResult.error 
                    : (taskResult.error as any)?.message || (taskResult.error as any)?.detail || JSON.stringify(taskResult.error)}
                </p>
              </div>
            )}

            {!taskResult && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>No result yet...</p>
              </div>
            )}
            
            {taskResult?.status === 'pending' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground py-8">
                <Clock className="h-10 w-10 text-amber-500" />
                <p className="text-sm">Task queued, starting soon...</p>
              </div>
            )}

            {taskResult?.logs && taskResult.logs.length > 0 && (
              <div className="flex-1 min-h-0">
                <Label className="mb-2 block">Task Logs</Label>
                <ScrollArea className="h-40 rounded border bg-slate-950 p-3">
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                    {taskResult.logs.join('\n')}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
