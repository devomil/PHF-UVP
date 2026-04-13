import { useState, useEffect } from 'react';
import { Link2, Unlink, Loader2, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface CanvaStatus {
  configured: boolean;
  connected: boolean;
  displayName?: string | null;
  connectedAt?: string | null;
  scope?: string | null;
}

export function CanvaConnect() {
  const [status, setStatus] = useState<CanvaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/canva/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ configured: false, connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('canva_connected')) {
      toast({ title: 'Canva connected', description: 'Your Canva account has been linked successfully.' });
      fetchStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
    const canvaError = params.get('canva_error');
    if (canvaError) {
      toast({
        title: 'Canva connection failed',
        description: canvaError === 'invalid_state' ? 'Session expired. Please try again.' : canvaError,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/canva/connect', { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to connect');
      }
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err: any) {
      toast({ title: 'Connection failed', description: err.message, variant: 'destructive' });
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Canva account? Future renders will not sync to Canva.')) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/canva/disconnect', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to disconnect');
      setStatus((prev) => prev ? { ...prev, connected: false, displayName: null, connectedAt: null } : prev);
      toast({ title: 'Canva disconnected', description: 'Your Canva account has been unlinked.' });
    } catch (err: any) {
      toast({ title: 'Disconnect failed', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        className="border rounded-xl p-5"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-purple-500/10 rounded animate-pulse" />
            <div className="h-3 w-48 bg-purple-500/5 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div
        className="border rounded-xl p-5"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: '#7D2AE8' }}
          >
            <CanvaLogo />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Canva</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Integration not configured. Contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border rounded-xl p-5"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: status.connected ? '#7D2AE840' : 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#7D2AE8' }}
          >
            <CanvaLogo />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Canva</p>
              {status.connected && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
                  <CheckCircle className="w-3 h-3" />
                  Connected
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {status.connected ? (
                <>
                  {status.displayName && (
                    <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {status.displayName}
                    </span>
                  )}
                  {status.displayName && ' — '}
                  Renders sync automatically to your Canva workspace
                </>
              ) : (
                'Connect to automatically push rendered videos & key frames to Canva'
              )}
            </p>
          </div>
        </div>

        <div className="shrink-0 ml-4">
          {status.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="text-red-400 hover:text-red-300 hover:border-red-500/30"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              {actionLoading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5 mr-1.5" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={actionLoading}
              className="text-white font-medium shadow-lg hover:shadow-xl transition-all"
              style={{
                backgroundColor: '#7D2AE8',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#6B1FD4')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#7D2AE8')}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CanvaLogoSmall />
              )}
              {actionLoading ? 'Connecting...' : 'Connect with Canva'}
            </Button>
          )}
        </div>
      </div>

      {status.connected && status.connectedAt && (
        <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
          <span>
            Connected {new Date(status.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <a
            href="https://www.canva.com/your-apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-purple-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Manage in Canva
          </a>
        </div>
      )}
    </div>
  );
}

function CanvaLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.223 14.435c-.547.762-1.395 1.2-2.314 1.2-1.544 0-2.473-1.168-2.812-2.177-.295.388-.773.904-1.483.904-.914 0-1.49-.755-1.49-1.792 0-1.867 1.585-4.383 3.752-4.383.725 0 1.324.302 1.696.686l.22-.504h1.363l-1.17 3.883c-.163.547-.105.826.186.826.519 0 1.36-1.012 1.36-2.74 0-2.5-1.812-4.35-4.53-4.35-2.89 0-5.125 2.39-5.125 5.407 0 3.106 2.227 4.83 4.91 4.83.998 0 1.914-.216 2.76-.696l.542.983c-1.022.547-2.187.837-3.39.837C7.18 19.35 4 16.74 4 12.613 4 8.39 7.288 5.42 11.218 5.42c3.558 0 6.12 2.39 6.12 5.7 0 2.73-1.455 4.6-3.115 5.315h.005-.005z"
        fill="white"
      />
    </svg>
  );
}

function CanvaLogoSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.223 14.435c-.547.762-1.395 1.2-2.314 1.2-1.544 0-2.473-1.168-2.812-2.177-.295.388-.773.904-1.483.904-.914 0-1.49-.755-1.49-1.792 0-1.867 1.585-4.383 3.752-4.383.725 0 1.324.302 1.696.686l.22-.504h1.363l-1.17 3.883c-.163.547-.105.826.186.826.519 0 1.36-1.012 1.36-2.74 0-2.5-1.812-4.35-4.53-4.35-2.89 0-5.125 2.39-5.125 5.407 0 3.106 2.227 4.83 4.91 4.83.998 0 1.914-.216 2.76-.696l.542.983c-1.022.547-2.187.837-3.39.837C7.18 19.35 4 16.74 4 12.613 4 8.39 7.288 5.42 11.218 5.42c3.558 0 6.12 2.39 6.12 5.7 0 2.73-1.455 4.6-3.115 5.315h.005-.005z"
        fill="white"
      />
    </svg>
  );
}
