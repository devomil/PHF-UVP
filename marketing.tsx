import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, FileText, BarChart3 } from "lucide-react";

export default function Marketing() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-farm-green"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Marketing</h1>
        <p className="text-slate-500 mt-1">
          Manage marketing materials and campaigns
        </p>
      </div>

      {/* Marketing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Megaphone className="w-5 h-5 mr-2 text-farm-green" />
              Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">
              Marketing campaign management functionality will be implemented here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="w-5 h-5 mr-2 text-farm-blue" />
              Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">
              Marketing materials and asset management will be implemented here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-farm-brown" />
              Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">
              Campaign analytics and performance tracking will be implemented here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
