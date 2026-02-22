import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiClient } from '../lib/api';
import usePermissions from '../hooks/usePermissions';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import SiteLocationsManager from '../components/sites/SiteLocationsManager';
import SiteCableTypesManager from '../components/sites/SiteCableTypesManager';

type CableAdminTab = 'locations' | 'cableTypes';

const getTabFromSearch = (value: string | null): CableAdminTab => {
  if (value === 'cableTypes') return 'cableTypes';
  return 'locations';
};

const SiteCableAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const siteId = Number(params.siteId);
  const { canAdministerSite } = usePermissions();
  const canManageSite = Number.isFinite(siteId) ? canAdministerSite(siteId) : false;

  const [siteName, setSiteName] = React.useState<string | null>(null);
  const [siteCode, setSiteCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const tab: CableAdminTab = React.useMemo(() => getTabFromSearch(searchParams.get('tab')), [searchParams]);

  React.useEffect(() => {
    const load = async () => {
      if (!Number.isFinite(siteId) || siteId <= 0) {
        setError('Invalid site');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const resp = await apiClient.getSite(siteId);
        if (!resp.success || !resp.data?.site) {
          throw new Error(resp.error || 'Failed to load site');
        }
        setSiteName(resp.data.site.name ?? null);
        setSiteCode(resp.data.site.code ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load site');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [siteId]);

  const setTab = (next: CableAdminTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true }
    );
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate(`/sites/${siteId}/cable`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Cable Index
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/sites/${siteId}/cable`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold truncate">Cable Admin{siteName ? ` — ${siteName}` : ''}</h1>
          </div>
          <div className="text-sm text-muted-foreground">Manage shared cable site data for this site.</div>
        </div>
      </div>

      {!canManageSite ? (
        <Alert variant="destructive">
          <AlertDescription>Site admin access required.</AlertDescription>
        </Alert>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as CableAdminTab)}>
          <TabsList>
            <TabsTrigger value="locations">Site Locations</TabsTrigger>
            <TabsTrigger value="cableTypes">Cable Types</TabsTrigger>
          </TabsList>

          <TabsContent value="locations">
            <Card>
              <CardHeader>
                <CardTitle>Site Locations</CardTitle>
              </CardHeader>
              <CardContent>
                <SiteLocationsManager
                  siteId={siteId}
                  siteCode={siteCode ?? ''}
                  siteName={siteName ?? ''}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cableTypes">
            <Card>
              <CardHeader>
                <CardTitle>Cable Types</CardTitle>
              </CardHeader>
              <CardContent>
                <SiteCableTypesManager
                  siteId={siteId}
                  siteCode={siteCode ?? ''}
                  siteName={siteName ?? ''}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default SiteCableAdminPage;
