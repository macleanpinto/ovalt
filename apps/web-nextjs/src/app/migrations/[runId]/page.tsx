'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import { useAlert } from '@/lib/alert-context';
import {
  apiClient,
  reconnectGoogleTagManager,
  isGtmSessionApiError,
  GTM_SESSION_STORAGE_KEY,
  Run
} from '@/lib/api-client';
import AppHeader from '@/components/AppHeader';

interface DetectedTag {
  id: string;
  name: string;
  type: string;
  category: string;
  status: 'ready' | 'mapping' | 'needs_review';
  triggerSummary: string;
  parameters?: Record<string, string>;
  firingTriggerIds?: string[];
}

interface ContainerElement {
  id: string;
  name: string;
  type: string;
  elementType: 'tag' | 'trigger' | 'variable';
  details: any;
  status?: 'ready' | 'mapping' | 'needs_review';
}

interface MappingRecord {
  clientTagId: string;
  clientTagName: string;
  clientTagType: string;
  category: string;
  serverRecommendation: string;
  confidence: number;
  provisional: boolean;
  manualActions: string[];
  evidence?: {
    type: 'docs' | 'agent_web';
    ref: string;
    sources?: Array<{ title: string; url: string }>;
    searchQuery?: string;
  };
}

interface MigrationReport {
  runId: string;
  confidenceScore: number;
  summaryCounts: {
    mappings: number;
    warnings: number;
    manualActions: number;
    highRisk: number;
  };
  detectedTags: DetectedTag[];
  mappings: MappingRecord[];
  executiveSummary: string;
  containerSummary?: {
    totalTags: number;
    totalTriggers: number;
    totalVariables: number;
  };
  containerElements?: {
    triggers: Array<any>;
    variables: Array<any>;
  };
}

export default function MigrationWorkspace() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, organization } = useAuth();
  const alert = useAlert();
  const runId = params.runId as string;

  const [run, setRun] = useState<Run | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<ContainerElement | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<MappingRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [showGuide, setShowGuide] = useState(true);
  const [elementTypeFilter, setElementTypeFilter] = useState<'all' | 'tag' | 'trigger' | 'variable'>('tag');
  const [deploymentFilter, setDeploymentFilter] = useState<'active' | 'deployed'>('active');
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecommendation, setEditedRecommendation] = useState('');
  const [skippedTags, setSkippedTags] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [approvedTags, setApprovedTags] = useState<Set<string>>(new Set());
  const [deployedTags, setDeployedTags] = useState<Set<string>>(new Set());

  // Structured editing fields
  const [editServerTagName, setEditServerTagName] = useState('');
  const [editConfigSteps, setEditConfigSteps] = useState<string[]>([]);
  const [editValidationNotes, setEditValidationNotes] = useState<string[]>([]);

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<any>(null);
  const [clientContainerPath, setClientContainerPath] = useState('');
  const [clientWorkspacePath, setClientWorkspacePath] = useState('');
  const [serverContainerPath, setServerContainerPath] = useState('');
  const [transport_url, settransport_url] = useState('');
  const [serverContainers, setServerContainers] = useState<any[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [containerMode, setContainerMode] = useState<'existing' | 'create' | null>(null);
  const [gtmAccounts, setGtmAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [newContainerName, setNewContainerName] = useState('');
  const [isCreatingContainer, setIsCreatingContainer] = useState(false);
  const [needsGtmReconnect, setNeedsGtmReconnect] = useState(false);

  // Tag grouping state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all'])); // Start with all groups expanded
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set()); // Track expanded individual tag cards
  const [activeGroupKey, setActiveGroupKey] = useState<string>('all');
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  /** Main workspace area: tag review vs deployment log / progress */
  const [workspaceTab, setWorkspaceTab] = useState<'review' | 'deployment'>('review');
  const deploymentLogRef = useRef<HTMLDivElement>(null);

  // Meta Pixel Access Token state
  const [metaAccessToken, setMetaAccessToken] = useState('');

  // Deployment rules state
  const [deploymentRules, setDeploymentRules] = useState({
    debugMode: false,
    stagingFirst: true,
    piiSanitization: true,
    backupFirst: true
  });

  // Helper to get GTM session
  const getGtmSession = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(GTM_SESSION_STORAGE_KEY);
  };

  const handleGtmReconnect = () => {
    reconnectGoogleTagManager(`/migrations/${runId}`).catch(() =>
      alert.error('Could not start GTM OAuth. Check you are logged in.')
    );
  };

  const loadGtmAccounts = async (): Promise<any[]> => {
    const gtmSessionId = getGtmSession();
    if (!gtmSessionId) {
      setNeedsGtmReconnect(true);
      addLog('❌ No GTM session saved. Click "Reconnect GTM" in the deployment dialog (or under the header), then try again.');
      return [];
    }
    try {
      const accountsRes = await apiClient.getGtmAccounts(gtmSessionId);
      const accounts = accountsRes.accounts || [];
      setGtmAccounts(accounts);
      return accounts;
    } catch (e) {
      if (isGtmSessionApiError(e)) setNeedsGtmReconnect(true);
      throw e;
    }
  };

  const loadServerContainers = async () => {
    setLoadingContainers(true);
    try {
      const gtmSessionId = getGtmSession();
      if (!gtmSessionId) {
        setNeedsGtmReconnect(true);
        alert.warning(
          'No Google Tag Manager session saved. Click "Reconnect GTM" to authenticate.'
        );
        return;
      }

      const accounts = (gtmAccounts.length > 0 ? gtmAccounts : await loadGtmAccounts()) || [];
      const byPath = new Map<string, any>();

      for (const account of accounts) {
        const accountPath = account?.path || (account?.accountId ? `accounts/${account.accountId}` : null);
        if (!accountPath) continue;

        try {
          const containersRes = await apiClient.getGtmContainers(gtmSessionId, accountPath);
          const containers = containersRes.containers || [];
          for (const c of containers) {
            const usage = Array.isArray(c?.usageContext) ? c.usageContext.map((x: any) => String(x).toLowerCase()) : [];
            const isServer = usage.includes('server');
            if (!isServer) continue;
            if (c?.path && !byPath.has(c.path)) byPath.set(c.path, c);
          }
        } catch (err: any) {
          addLog(`⚠️ Could not list containers for ${accountPath}: ${err?.message || 'unknown error'}`);
        }
      }

      const all = Array.from(byPath.values()).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
      setServerContainers(all);
      addLog(`Found ${all.length} server container(s)`);
    } catch (err: any) {
      if (isGtmSessionApiError(err)) setNeedsGtmReconnect(true);
      addLog(`❌ Failed to load server containers: ${err?.message || 'unknown error'}`);
      alert.error(`Failed to load server containers: ${err?.message || 'unknown error'}`);
    } finally {
      setLoadingContainers(false);
    }
  };

  // Map client tag types to server destination types (simplified client-side version)
  const getServerType = (clientType: string): string | null => {
    const mapping: Record<string, string | null> = {
      'googtag': 'sgtmgaaw',
      'gaawe': 'sgtmgaaw',
      'gaawc': 'sgtmgaaw',
      'awct': 'sgtmgads',
      'sp': 'sgtmgads',
      'fls': 'sgtmflood',
      'flc': 'sgtmflood',
      'html': null, // Custom HTML can't be directly migrated
      'img': null, // Image tag typically can't migrate
    };
    return mapping[clientType] || 'unknown';
  };

  // Get human-readable label for server type (legacy / family)
  const getDestinationLabel = (serverType: string | null): string => {
    if (!serverType) return 'Not Supported';
    const labels: Record<string, string> = {
      'sgtmgaaw': 'GA4 Events',
      'sgtmgads': 'Google Ads',
      'sgtmflood': 'Floodlight',
      'sgtmmeta': 'Meta Pixel',
      'unknown': 'Other Platforms'
    };
    return labels[serverType] || serverType;
  };

  /** Sidebar / headers: label by client GTM tag type id (e.g. gaawe, googtag). */
  const getClientTagTypeLabel = (clientTagType: string | null | undefined): string => {
    if (!clientTagType) return 'Unknown type';
    const labels: Record<string, string> = {
      googtag: 'Google tag',
      gaawe: 'GA4 Event',
      gaawc: 'GA4 Configuration',
      awct: 'Google Ads conversion',
      sp: 'Google Ads remarketing',
      fls: 'Floodlight (sales)',
      flc: 'Floodlight (counter)',
      html: 'Custom HTML',
      img: 'Custom Image',
      gclidw: 'Conversion Linker'
    };
    return labels[clientTagType] || clientTagType;
  };

  // Get icon for destination type
  const getDestinationIcon = (serverType: string | null): string => {
    if (!serverType) return 'block';
    const icons: Record<string, string> = {
      'sgtmgaaw': 'analytics',
      'sgtmgads': 'ads_click',
      'sgtmflood': 'campaign',
      'sgtmmeta': 'share',
      'unknown': 'category'
    };
    return icons[serverType] || 'sell';
  };

  // Get color for destination type
  const getDestinationColor = (serverType: string | null): string => {
    if (!serverType) return 'bg-error/20 text-error border-error/30';
    const colors: Record<string, string> = {
      'sgtmgaaw': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'sgtmgads': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'sgtmflood': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'sgtmmeta': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'unknown': 'bg-green-500/20 text-green-400 border-green-500/30'
    };
    return colors[serverType] || 'bg-surface-variant/20 text-on-surface-variant border-surface-variant/30';
  };

  // Group tags by client GTM tag type (one server tag will be created per type on deploy)
  const groupTagsByClientType = (mappings: MappingRecord[]) => {
    const grouped = new Map<string, MappingRecord[]>();

    for (const mapping of mappings) {
      const key = mapping.clientTagType || 'unknown';

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(mapping);
    }

    return grouped;
  };

  // Toggle group expansion
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Approve all tags in a group
  const approveAllInGroup = (groupTags: MappingRecord[]) => {
    setApprovedTags(prev => {
      const next = new Set(prev);
      groupTags.forEach(tag => next.add(tag.clientTagId));
      return next;
    });
    addLog(`✅ Approved ${groupTags.length} tag(s) in group`);
  };

  // Helper to process deployment results and update deployed tags
  const processDeploymentResult = (result: any) => {
    setDeploymentResult(result);

    // Mark successfully deployed tags
    if (result.deployedTags && Array.isArray(result.deployedTags)) {
      const successfullyDeployed = result.deployedTags
        .filter((tag: any) => tag.status === 'deployed')
        .map((tag: any) => tag.clientTagId);

      if (successfullyDeployed.length > 0) {
        setDeployedTags(prev => {
          const next = new Set(prev);
          successfullyDeployed.forEach((id: string) => next.add(id));
          return next;
        });

        // Remove from approved tags (they're now deployed)
        setApprovedTags(prev => {
          const next = new Set(prev);
          successfullyDeployed.forEach((id: string) => next.delete(id));
          return next;
        });

        addLog(`✅ Moved ${successfullyDeployed.length} tag(s) to deployed list`);
      }
    }

    const failed =
      typeof result.failed === 'number'
        ? result.failed
        : Array.isArray(result.errors)
          ? result.errors.length
          : 0;
    addLog(
      `✅ Deployment finished: ${result.deployed ?? 0} tag(s) deployed, ${failed} failed`
    );

    if (result.workspacePath) {
      addLog(`📂 Server workspace: ${result.workspacePath}`);
    }
    if (Array.isArray(result.serverClients) && result.serverClients.length > 0) {
      addLog(
        `🔌 Server client(s) created: ${result.serverClients.map((c: any) => c.name).join(', ')}`
      );
    }
    if (Array.isArray(result.nextSteps)) {
      result.nextSteps.forEach((line: string) => {
        const s = String(line);
        if (s.trim()) addLog(s);
      });
    }
    if (Array.isArray(result.errors)) {
      result.errors.forEach((e: any) => {
        const msg = e?.error || e?.message || JSON.stringify(e);
        const who = e?.clientTagName || e?.clientTagId || e?.clientType || 'Error';
        addLog(`❌ ${who}: ${msg}`);
      });
    }
  };

  useEffect(() => {
    if (workspaceTab !== 'deployment' || !deploymentLogRef.current) return;
    deploymentLogRef.current.scrollTop = deploymentLogRef.current.scrollHeight;
  }, [logs, workspaceTab, isDeploying]);

  // Handle GTM session from OAuth callback
  useEffect(() => {
    const gtmSession = searchParams.get('gtmSession');
    if (gtmSession) {
      localStorage.setItem('gtm_session', gtmSession);
      setNeedsGtmReconnect(false);
      // Remove the query parameter from the URL
      const url = new URL(window.location.href);
      url.searchParams.delete('gtmSession');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  useEffect(() => {
    const onLost = () => setNeedsGtmReconnect(true);
    window.addEventListener('tagrelay:gtm-session-lost', onLost);
    return () => window.removeEventListener('tagrelay:gtm-session-lost', onLost);
  }, []);

  // Track polling state to avoid duplicate logs
  const pollingStateRef = useRef({
    isInitialLoad: true,
    previousStatus: '',
    previousDeploymentStatus: ''
  });

  useEffect(() => {
    // Reset polling state when runId changes
    pollingStateRef.current = {
      isInitialLoad: true,
      previousStatus: '',
      previousDeploymentStatus: ''
    };

    let isCancelled = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const loadRunData = async () => {
      if (!runId || isCancelled) return;

      try {
        // Only show loading spinner on initial load, not on subsequent polls
        if (pollingStateRef.current.isInitialLoad) {
          setIsLoading(true);
        }
        const runData = await apiClient.getRun(runId);
        if (isCancelled) return;

        setRun(runData);

        // Only log on initial load or status changes
        if (pollingStateRef.current.isInitialLoad) {
          addLog(`Connected to migration ${runId.slice(0, 8)}...`);
          addLog(`Status: ${runData.status.toUpperCase()}`);
        } else if (pollingStateRef.current.previousStatus !== runData.status) {
          addLog(`Status changed: ${runData.status.toUpperCase()}`);
        }
        pollingStateRef.current.previousStatus = runData.status;

        // Load client container info from import (only on initial load)
        if (pollingStateRef.current.isInitialLoad && runData.importId) {
          try {
            const importData = await apiClient.getImport(runData.importId);
            if (isCancelled) return;

            if (importData.gtm?.containerPath && importData.gtm?.workspacePath) {
              setClientContainerPath(importData.gtm.containerPath);
              setClientWorkspacePath(importData.gtm.workspacePath);
              addLog(`✅ Client container: ${importData.gtm.containerPath}`);
            }
          } catch (err: any) {
            addLog(`⚠️ Could not load client container info: ${err.message}`);
          }
        }

        // Load previously deployed tags from deployment history (only on initial load)
        if (pollingStateRef.current.isInitialLoad && runData.deploymentHistory && runData.deploymentHistory.length > 0) {
          const allDeployedTagIds = new Set<string>();
          runData.deploymentHistory.forEach(deployment => {
            deployment.deployedTagIds?.forEach(tagId => allDeployedTagIds.add(tagId));
          });

          if (allDeployedTagIds.size > 0) {
            setDeployedTags(allDeployedTagIds);
            addLog(`✅ Loaded ${allDeployedTagIds.size} previously deployed tags`);
          }
        }

        // Try to load report if available
        if (runData.status === 'completed' || runData.status === 'needs_review') {
          try {
            const reportData = await apiClient.getRunReport(runId);
            if (isCancelled) return;

            setReport(reportData);

            // Only log on initial load
            if (pollingStateRef.current.isInitialLoad) {
              addLog(`Migration report loaded: ${reportData.detectedTags?.length || 0} tags detected`);
            }

            // Expand all tag groups by default (only on initial load)
            if (pollingStateRef.current.isInitialLoad && reportData.mappings && reportData.mappings.length > 0) {
              const allClientTypes = new Set<string>(
                reportData.mappings.map((m: MappingRecord) => m.clientTagType || 'unknown')
              );
              setExpandedGroups(allClientTypes);
            }

            // Select first tag by default (only on initial load)
            if (pollingStateRef.current.isInitialLoad && reportData.detectedTags && reportData.detectedTags.length > 0) {
              const firstTag = reportData.detectedTags[0];
              setSelectedElement({
                id: firstTag.id,
                name: firstTag.name,
                type: firstTag.type,
                elementType: 'tag',
                details: firstTag,
                status: firstTag.status
              });

              // Find corresponding mapping
              const mapping = reportData.mappings?.find((m: MappingRecord) => m.clientTagId === firstTag.id);
              if (mapping) {
                setSelectedMapping(mapping);
              }
            }
          } catch (err: any) {
            if (pollingStateRef.current.isInitialLoad) {
              addLog('Report not available yet');
            }
          }
        } else if (pollingStateRef.current.isInitialLoad) {
          addLog(`Migration is ${runData.status}. Report will be available when completed.`);
        }

        // Handle deployment status updates - only log when status changes
        const currentDeploymentStatus = (runData as any).deploymentStatus || '';
        if (currentDeploymentStatus && currentDeploymentStatus !== pollingStateRef.current.previousDeploymentStatus) {
          if (currentDeploymentStatus === 'completed') {
            // Always clear deploying UI when API says completed (also fixes fast deploys where we never polled "deploying")
            if (pollingStateRef.current.previousDeploymentStatus === 'deploying') {
              addLog('✅ Deployment completed successfully');
              if ((runData as any).deploymentHistory && (runData as any).deploymentHistory.length > 0) {
                const lastDep = (runData as any).deploymentHistory[(runData as any).deploymentHistory.length - 1];
                if (lastDep.tagsModified) {
                  addLog(`✅ ${lastDep.tagsModified} tags modified in client workspace`);
                }
                if (lastDep.deployed) {
                  addLog(`✅ ${lastDep.deployed} server-side tags created`);
                }
                if (lastDep.clientWorkspacePath) {
                  addLog(`📦 Client workspace: ${lastDep.clientWorkspaceName || 'Migration Workspace'}`);
                }
                if (lastDep.serverWorkspacePath) {
                  addLog(`📦 Server workspace: ${lastDep.serverWorkspaceName || 'Migration Workspace'}`);
                }
              }
            }
            setIsDeploying(false);
          } else if (currentDeploymentStatus === 'failed') {
            const errorMsg = (runData as any).deploymentError || 'Unknown error';
            if (pollingStateRef.current.previousDeploymentStatus === 'deploying') {
              addLog(`❌ Deployment failed: ${errorMsg}`);
            }
            setIsDeploying(false);
          } else if (currentDeploymentStatus === 'deploying' && pollingStateRef.current.previousDeploymentStatus !== 'deploying') {
            addLog('⏳ Deployment in progress...');
            setIsDeploying(true);
          }
        }
        pollingStateRef.current.previousDeploymentStatus = currentDeploymentStatus;

        // Stop polling only when the migration run is in a terminal workflow state AND no deploy is running.
        // IMPORTANT: do not stop while status is needs_review — user can start Deploy from this screen; we must
        // keep polling so deploymentStatus (deploying → completed) is observed; otherwise isDeploying stays true forever.
        const hasActiveDeployment = (runData as any).deploymentStatus === 'deploying';
        const isActiveMigrationPhase =
          runData.status === 'queued' || runData.status === 'running' || runData.status === 'needs_review';
        if (!isActiveMigrationPhase && !hasActiveDeployment) {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load migration');
        if (pollingStateRef.current.isInitialLoad) {
          addLog(`ERROR: ${err.message || 'Failed to load migration'}`);
        }
      } finally {
        setIsLoading(false);
        pollingStateRef.current.isInitialLoad = false;
      }
    };

    loadRunData();

    // Poll for updates every 5 seconds - always check fresh status from API
    pollInterval = setInterval(() => {
      loadRunData();
    }, 5000);

    return () => {
      isCancelled = true;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [runId]);

  // Reset edit mode when selected element changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedElement]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Parse recommendation into structured fields
  const parseRecommendation = (text: string) => {
    const lines = text.split('\n');
    const tagName = lines[0] || '';

    const configSteps: string[] = [];
    const validationNotes: string[] = [];

    let currentSection = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('Configuration:')) {
        currentSection = 'config';
      } else if (line.startsWith('Validation Notes:')) {
        currentSection = 'validation';
      } else if (line.startsWith('•') || line.startsWith('-')) {
        const item = line.replace(/^[•\-]\s*/, '').trim();
        if (item) {
          if (currentSection === 'config') {
            configSteps.push(item);
          } else if (currentSection === 'validation') {
            validationNotes.push(item);
          }
        }
      } else if (line.startsWith('⚠') || line.startsWith('✓') || line.startsWith('ℹ')) {
        if (currentSection === 'validation') {
          validationNotes.push(line);
        }
      }
    }

    return { tagName, configSteps, validationNotes };
  };

  // Rebuild recommendation from structured fields
  const buildRecommendation = (tagName: string, configSteps: string[], validationNotes: string[]) => {
    let text = tagName;

    if (configSteps.length > 0) {
      text += '\n\nConfiguration:';
      configSteps.forEach(step => {
        text += `\n• ${step}`;
      });
    }

    if (validationNotes.length > 0) {
      text += '\n\nValidation Notes:';
      validationNotes.forEach(note => {
        text += `\n${note}`;
      });
    }

    return text;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-secondary/10 text-secondary border-secondary/20';
      case 'mapping':
        return 'bg-[#F63A22]/10 text-[#F63A22] border-[#F63A22]/20';
      case 'needs_review':
        return 'bg-[#ffb4a7]/10 text-[#ffb4a7] border-[#ffb4a7]/20';
      default:
        return 'bg-surface-container text-on-surface border-outline-variant';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready':
        return 'READY';
      case 'mapping':
        return 'MAPPING';
      case 'needs_review':
        return 'REVIEW';
      default:
        return 'UNKNOWN';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return 'check_circle';
      case 'mapping':
        return 'error';
      case 'needs_review':
        return 'warning';
      default:
        return 'help';
    }
  };

  const getIconForTagType = (type: string): string => {
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes('analytics') || normalizedType.includes('ga')) return 'analytics';
    if (normalizedType.includes('pixel') || normalizedType.includes('fb') || normalizedType.includes('meta')) return 'ads_click';
    if (normalizedType.includes('variable')) return 'data_object';
    if (normalizedType.includes('trigger')) return 'bolt';
    if (normalizedType.includes('html') || normalizedType.includes('script')) return 'code';
    return 'sell'; // default tag icon
  };

  // Build combined list of all container elements
  const allElements: ContainerElement[] = [
    // Tags
    ...(report?.detectedTags || []).map(tag => ({
      id: tag.id,
      name: tag.name,
      type: tag.type,
      elementType: 'tag' as const,
      details: tag,
      status: tag.status
    })),
    // Triggers
    ...(report?.containerElements?.triggers || []).map((trigger: any) => ({
      id: trigger.triggerId || trigger.name,
      name: trigger.name || 'Unnamed Trigger',
      type: trigger.type || 'Unknown',
      elementType: 'trigger' as const,
      details: trigger
    })),
    // Variables
    ...(report?.containerElements?.variables || []).map((variable: any) => ({
      id: variable.variableId || variable.name,
      name: variable.name || 'Unnamed Variable',
      type: variable.type || 'Unknown',
      elementType: 'variable' as const,
      details: variable
    }))
  ];

  const filteredElements = allElements.filter(element => {
    // Filter by deployment status
    if (deploymentFilter === 'active' && deployedTags.has(element.id)) {
      return false; // Hide deployed tags in active view
    }
    if (deploymentFilter === 'deployed' && !deployedTags.has(element.id)) {
      return false; // Hide non-deployed tags in deployed view
    }
    // Filter out skipped tags unless showSkipped is true
    if (!showSkipped && skippedTags.has(element.id)) {
      return false;
    }
    // Filter by type
    if (elementTypeFilter !== 'all' && element.elementType !== elementTypeFilter) {
      return false;
    }
    // Filter by search text
    if (filterText) {
      return element.name.toLowerCase().includes(filterText.toLowerCase()) ||
             element.type.toLowerCase().includes(filterText.toLowerCase());
    }
    return true;
  });

  const completedCount = (report?.detectedTags || []).filter(tag => tag.status === 'ready').length;
  const detectedTagCount = report?.detectedTags?.length || 0;
  /** Footer bar + confidence: resolved = deployed to server or explicitly skipped */
  const deploymentResolvedCount = deployedTags.size + skippedTags.size;
  const deploymentProgressPercent =
    detectedTagCount > 0 ? (deploymentResolvedCount / detectedTagCount) * 100 : 0;
  const deploymentConfidenceScore =
    detectedTagCount > 0
      ? Number(((deploymentResolvedCount / detectedTagCount) * 10).toFixed(1))
      : 0;

  if (isLoading) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-on-surface-variant">Loading migration workspace...</p>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  if (error || !run) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen p-8 bg-background">
          <div className="max-w-7xl mx-auto">
            <div className="p-6 bg-error-container/20 border border-error/20 rounded-xl">
              <h2 className="text-lg font-semibold text-error mb-2 headline-font">
                Failed to load migration
              </h2>
              <p className="text-error mb-4">{error || 'Migration not found'}</p>
              <Link
                href="/migrations"
                className="px-6 py-3 bg-primary text-on-primary rounded-xl font-semibold hover:brightness-110 transition-all inline-block"
              >
                Back to Migrations
              </Link>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  // Show processing state if migration is not yet complete
  if (run.status === 'queued' || run.status === 'running') {
    return (
      <ProtectedRoute>
        <main className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="bg-surface-container rounded-xl p-12 border border-outline-variant/10">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold text-white mb-2 headline-font">
                {run.status === 'queued' ? 'Migration Queued' : 'Processing Migration'}
              </h2>
              <p className="text-on-surface-variant mb-6">
                {run.status === 'queued'
                  ? 'Your migration is in the queue and will begin processing shortly.'
                  : 'Analyzing your GTM container and generating server-side configuration...'}
              </p>
              <div className="bg-surface-container-low rounded-lg p-4 text-left space-y-2">
                <p className="text-xs font-label text-on-surface-variant uppercase tracking-widest">Live Status</p>
                {logs.slice(-5).map((log, index) => (
                  <p key={index} className="text-xs font-mono text-on-surface-variant">
                    {log}
                  </p>
                ))}
              </div>
              <div className="mt-6">
                <Link
                  href="/migrations"
                  className="px-6 py-3 border border-outline-variant/30 text-white rounded-xl hover:bg-white/5 transition-colors inline-block"
                >
                  Back to Migrations
                </Link>
              </div>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  // Show error if migration failed
  if (run.status === 'failed') {
    return (
      <ProtectedRoute>
        <main className="min-h-screen bg-background p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-error-container/20 border border-error/20 rounded-xl p-8">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-4xl text-error">error</span>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-error mb-2 headline-font">
                    Migration Failed
                  </h2>
                  <p className="text-error mb-4">
                    The migration process encountered an error and could not complete.
                  </p>
                  <div className="bg-surface-container-lowest rounded-lg p-4 mb-6">
                    <p className="text-xs font-label text-on-surface-variant uppercase tracking-widest mb-2">Error Logs</p>
                    <div className="space-y-1">
                      {logs.map((log, index) => (
                        <p key={index} className="text-xs font-mono text-on-surface-variant">
                          {log}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href="/migrations"
                      className="px-6 py-3 bg-primary text-on-primary rounded-xl font-semibold hover:brightness-110 transition-all"
                    >
                      Back to Migrations
                    </Link>
                    <Link
                      href="/import"
                      className="px-6 py-3 border border-outline-variant/30 text-white rounded-xl hover:bg-white/5 transition-colors"
                    >
                      Start New Import
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  // ===========================
  // Redesigned Workspace (2026)
  // ===========================
  const tagMappings = report?.mappings ?? [];
  const grouped = groupTagsByClientType(tagMappings);
  const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  const groups = [['all', tagMappings] as const, ...sortedGroups] as Array<
    readonly [string, MappingRecord[]]
  >;
  const active = groups.find(([k]) => k === activeGroupKey) ?? groups[0];
  const activeTags = active?.[1] ?? [];

  const approvedCount = tagMappings.filter((m) => approvedTags.has(m.clientTagId)).length;
  const approvalTotalCount = tagMappings.length || 1;
  const progressPct = Math.round((approvedCount / approvalTotalCount) * 100);
  const approvedMappingsList = tagMappings.filter((m) => approvedTags.has(m.clientTagId));
  const serverTagsToCreate = new Set(approvedMappingsList.map((m) => m.clientTagType || 'unknown')).size;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
        <AppHeader />

        {/* Page Sub-Navigation */}
        <div className="bg-[#1A1A1A]/60 border-b border-white/5 px-8 py-3">
          <div className="flex items-center justify-between">
            <nav className="flex gap-6 items-center">
              <button
                type="button"
                onClick={() => setWorkspaceTab('review')}
                className={`font-medium pb-1 border-b-2 transition-colors ${
                  workspaceTab === 'review'
                    ? 'text-[#41ffaf] font-semibold border-[#41ffaf]'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                Tag Review
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('deployment')}
                className={`font-medium pb-1 border-b-2 transition-colors flex items-center gap-2 ${
                  workspaceTab === 'deployment'
                    ? 'text-[#41ffaf] font-semibold border-[#41ffaf]'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                Deployment Log
                {(isDeploying || deploymentResult) && (
                  <span className="h-2 w-2 rounded-full bg-[#41ffaf] animate-pulse" aria-hidden />
                )}
              </button>
            </nav>
            <button
              className="bg-[#41ffaf] text-[#003822] px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-all active:scale-95"
              onClick={() => setShowDeploymentModal(true)}
            >
              Deploy Changes
            </button>
          </div>
        </div>

        {needsGtmReconnect && (
          <div className="bg-orange-950/80 border-b border-orange-500/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-orange-100">
              <span className="font-semibold text-white">Google Tag Manager disconnected.</span> Your saved session is no
              longer valid on the API (common after restarting the server). Reconnect to load accounts and deploy.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGtmReconnect}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-[#41ffaf] text-[#003822] hover:opacity-90"
              >
                Reconnect GTM
              </button>
              <button
                type="button"
                onClick={() => setNeedsGtmReconnect(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-orange-200 hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="flex md:hidden border-b border-white/5 bg-[#1A1A1A] px-3 py-2 gap-2">
          <button
            type="button"
            onClick={() => setWorkspaceTab('review')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
              workspaceTab === 'review' ? 'bg-[#353535] text-white' : 'text-gray-400'
            }`}
          >
            Tag review
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab('deployment')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
              workspaceTab === 'deployment' ? 'bg-[#353535] text-white' : 'text-gray-400'
            }`}
          >
            Deployment log
          </button>
        </div>

        <main className="flex bg-[#131313] overflow-hidden min-h-0 h-[calc(100dvh-8.5rem)] md:h-[calc(100dvh-7.5rem)]">
          {workspaceTab === 'deployment' ? (
            <div className="flex-1 flex flex-col min-h-0 p-6 md:p-8 overflow-hidden">
              <div className="max-w-4xl mx-auto w-full flex flex-col min-h-0 flex-1">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Deployment log</h2>
                    <p className="text-sm text-[#bacbbe] mt-1">
                      Live output and results from GTM deploy. The API runs as one request; progress appears when it
                      completes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('review')}
                    className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#353535] text-white hover:bg-[#404040] border border-white/10 transition-colors"
                  >
                    ← Back to tag review
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div
                    className={`rounded-lg p-4 border ${
                      isDeploying ? 'border-[#41ffaf]/40 bg-[#41ffaf]/5' : 'border-white/10 bg-[#20201f]'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-[#bacbbe] mb-1">Status</p>
                    <p className="text-sm font-semibold text-white flex items-center gap-2">
                      {isDeploying ? (
                        <>
                          <span className="inline-block h-3 w-3 rounded-full border-2 border-[#41ffaf] border-t-transparent animate-spin" />
                          Deploying…
                        </>
                      ) : deploymentResult ? (
                        deploymentResult.failed > 0 ? (
                          <span className="text-orange-300">Completed with errors</span>
                        ) : (
                          <span className="text-[#41ffaf]">Completed</span>
                        )
                      ) : (
                        <span className="text-[#bacbbe]">Idle</span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg p-4 border border-white/10 bg-[#20201f]">
                    <p className="text-[10px] uppercase tracking-wider text-[#bacbbe] mb-1">Deployed</p>
                    <p className="text-xl font-mono font-bold text-[#41ffaf]">
                      {deploymentResult?.deployed ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg p-4 border border-white/10 bg-[#20201f]">
                    <p className="text-[10px] uppercase tracking-wider text-[#bacbbe] mb-1">Failed</p>
                    <p className="text-xl font-mono font-bold text-orange-300">
                      {deploymentResult != null
                        ? deploymentResult.failed ??
                          (Array.isArray(deploymentResult.errors) ? deploymentResult.errors.length : 0)
                        : '—'}
                    </p>
                  </div>
                </div>

                {deploymentResult?.workspacePath && (
                  <p className="text-xs font-mono text-[#b6c4ff] mb-3 break-all">
                    Workspace: {deploymentResult.workspacePath}
                  </p>
                )}

                <div className="flex-1 min-h-[200px] flex flex-col rounded-xl border border-white/10 bg-[#0e0e0e] overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/10 flex justify-between items-center bg-[#1c1b1b]">
                    <span className="text-[10px] uppercase tracking-widest text-[#bacbbe] font-semibold">Console</span>
                    <span className="text-[10px] text-gray-500">{logs.length} line(s)</span>
                  </div>
                  <div
                    ref={deploymentLogRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-xs text-[#e5e2e1] space-y-1 leading-relaxed"
                  >
                    {logs.length === 0 ? (
                      <p className="text-[#bacbbe]">
                        No log lines yet. Open <strong className="text-white">Deploy Changes</strong>, run a deployment,
                        or switch back to tag review.
                      </p>
                    ) : (
                      logs.map((line, i) => (
                        <div key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('review')}
                    className="px-6 py-3 rounded-lg text-sm font-bold bg-[#353535] text-white hover:bg-[#404040] transition-colors"
                  >
                    Back to tag review
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeploymentModal(true)}
                    disabled={isDeploying}
                    className="px-6 py-3 rounded-lg text-sm font-bold bg-[#41ffaf] text-[#003822] hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Deploy again
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
          <aside className="w-72 bg-[#1c1b1b] overflow-y-auto px-4 py-6 flex flex-col gap-2 border-r border-white/5">
            <div className="px-2 mb-4">
              <h2 className="text-xs uppercase tracking-widest text-[#bacbbe] font-semibold">By tag type</h2>
            </div>

            {groups.map(([groupKey, groupTags]) => {
              const serverFamily = groupKey === 'all' ? null : getServerType(groupKey);
              const label = groupKey === 'all' ? 'All' : getClientTagTypeLabel(groupKey);
              const icon = groupKey === 'all' ? 'category' : getDestinationIcon(serverFamily);
              const approved = groupTags.filter((t) => approvedTags.has(t.clientTagId)).length;
              const total = groupTags.length || 1;
              const pct = Math.round((approved / total) * 100);
              const isActive = activeGroupKey === groupKey;

              return (
                <button
                  key={groupKey}
                  onClick={() => setActiveGroupKey(groupKey)}
                  className={`flex flex-col gap-1 w-full p-3 rounded-lg transition-all ${
                    isActive ? 'bg-[#353535]' : 'hover:bg-white/5 text-[#bacbbe]'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined ${isActive ? 'text-[#41ffaf]' : 'text-[#bacbbe]'}`}>
                        {icon}
                      </span>
                      <span className="font-medium text-sm">{label}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#41ffaf]">
                      {approved}/{groupTags.length} Approved
                    </span>
                  </div>
                  <div className="w-full bg-[#20201f] h-1 rounded-full overflow-hidden mt-2">
                    <div className="bg-[#41ffaf] h-full" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </aside>

          <section className="flex-grow p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <header className="mb-8 flex justify-between items-end">
                <div>
                  <div className="flex items-center gap-2 text-[#41ffaf] mb-2">
                    <span className="material-symbols-outlined text-sm">terminal</span>
                    <span className="font-mono text-xs tracking-tight">RUN_ID: {runId.slice(0, 12)}</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Reviewing {active?.[0] === 'all' ? 'Tags' : getClientTagTypeLabel(active?.[0])}
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  {active?.[0] === 'all' ? (
                    <button
                      onClick={() => {
                        setApprovedTags(new Set(tagMappings.map((m) => m.clientTagId)));
                        addLog(`✅ Approved all ${tagMappings.length} tag(s)`);
                      }}
                      className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#41ffaf] text-[#003822] hover:opacity-90 transition-all flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      Approve All
                    </button>
                  ) : (
                    <button
                      onClick={() => approveAllInGroup(activeTags)}
                      className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#41ffaf] text-[#003822] hover:opacity-90 transition-all flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      Approve All {getClientTagTypeLabel(active?.[0])}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setApprovedTags(new Set());
                      addLog(`🔄 Cleared all approvals`);
                    }}
                    className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#353535] text-gray-300 hover:bg-[#404040] transition-all"
                  >
                    Clear All
                  </button>
                </div>
              </header>

              <div className="space-y-4">
                {activeTags.map((m) => {
                  const isApproved = approvedTags.has(m.clientTagId);
                  const isExpanded = expandedTags.has(m.clientTagId);
                  const detected = report?.detectedTags?.find((t) => t.id === m.clientTagId);
                  const status = detected?.status ?? 'ready';
                  const badge =
                    status === 'ready'
                      ? 'bg-green-500/10 text-green-400'
                      : status === 'needs_review'
                        ? 'bg-orange-500/10 text-orange-400'
                        : 'bg-white/10 text-[#bacbbe]';

                  return (
                    <div
                      key={m.clientTagId}
                      className={`bg-[#20201f] rounded-lg overflow-hidden transition-all border ${
                        isExpanded
                          ? 'border-[#41ffaf]/20 shadow-lg shadow-[#41ffaf]/5'
                          : 'border-transparent hover:border-white/5'
                      }`}
                    >
                      <div className={`p-5 flex items-center justify-between ${isExpanded ? 'border-b border-white/5' : ''}`}>
                        <div className="flex items-center gap-4">
                          <div className="bg-[#41ffaf]/10 p-2 rounded-lg">
                            <span className="material-symbols-outlined text-[#41ffaf]">
                              {getIconForTagType(m.clientTagType)}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-white">{m.clientTagName}</h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badge}`}>
                                {status === 'needs_review' ? 'Needs Review' : 'Ready'}
                              </span>
                              <span className="text-xs text-gray-500 font-mono">Trigger: {detected?.triggerSummary || '—'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-medium">Approved</span>
                            <button
                              onClick={() => {
                                const next = new Set(approvedTags);
                                if (isApproved) next.delete(m.clientTagId);
                                else next.add(m.clientTagId);
                                setApprovedTags(next);
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                isApproved ? 'bg-[#41ffaf]' : 'bg-white/10'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full transition ${
                                  isApproved ? 'translate-x-6 bg-[#003822]' : 'translate-x-1 bg-gray-500'
                                }`}
                              />
                            </button>
                          </div>

                          <button
                            onClick={() => {
                              const next = new Set(expandedTags);
                              if (isExpanded) next.delete(m.clientTagId);
                              else next.add(m.clientTagId);
                              setExpandedTags(next);
                            }}
                            className="material-symbols-outlined text-gray-500 hover:text-white transition-all"
                          >
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-6 bg-[#1c1b1b]">
                          <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-4 font-bold">
                            Detailed Mapping
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-[#20201f] p-4 rounded-lg">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-mono text-gray-400">Client-Side</span>
                                <span className="material-symbols-outlined text-xs text-gray-500">input</span>
                              </div>
                              <div className="font-mono text-xs text-gray-300">Type: {m.clientTagType}</div>
                            </div>
                            <div className="bg-[#20201f] p-4 rounded-lg border-l-2 border-[#41ffaf]">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-mono text-[#41ffaf]">Server-Side</span>
                                <span className="material-symbols-outlined text-xs text-[#41ffaf]">dns</span>
                              </div>
                              <div className="font-mono text-xs text-gray-300">
                                Recommendation: {m.serverRecommendation || '—'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-6 flex justify-end gap-3">
                            <button className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 transition-all">
                              Manual Edit
                            </button>
                            <button
                              onClick={() => setApprovedTags((prev) => new Set(prev).add(m.clientTagId))}
                              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#41ffaf] text-[#003822]"
                            >
                              Approve Mapping
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
            </>
          )}
        </main>

        <footer className="bg-[#0e0e0e] min-h-16 px-4 md:px-8 py-3 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-t border-white/5 fixed bottom-0 left-0 right-0 z-50">
          {workspaceTab === 'deployment' ? (
            <>
              <div className="flex items-center gap-3 text-xs text-[#bacbbe]">
                <span className="material-symbols-outlined text-base text-[#41ffaf]">terminal</span>
                <span>
                  {isDeploying ? 'Deployment in progress…' : 'View full output above.'}{' '}
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('review')}
                    className="text-[#41ffaf] font-semibold hover:underline ml-1"
                  >
                    Back to tag review
                  </button>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDeploymentModal(true)}
                disabled={isDeploying}
                className="px-6 py-2 rounded-lg text-sm font-bold bg-[#41ffaf] text-[#003822] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Deploy again
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-8 flex-grow max-w-2xl min-w-0">
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-tighter hidden sm:inline">
                    Migration
                  </span>
                  <span className="font-mono text-xs text-[#41ffaf]">
                    {approvedCount} / {tagMappings.length} Approved
                  </span>
                </div>
                <div className="flex-grow h-2 bg-[#20201f] rounded-full overflow-hidden min-w-[80px]">
                  <div className="bg-[#41ffaf] h-full" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setWorkspaceTab('deployment')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10"
                >
                  Deployment log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (approvedCount === 0) {
                      alert.warning('Approve at least one tag before opening deployment.');
                      return;
                    }
                    setShowDeploymentModal(true);
                  }}
                  disabled={approvedCount === 0}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-colors ${
                    approvedCount === 0
                      ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                      : 'bg-[#41ffaf] text-[#003822] hover:opacity-90'
                  }`}
                >
                  Proceed to deployment
                </button>
              </div>
            </>
          )}
        </footer>

        {/* Deployment screen (modal) */}
        {showDeploymentModal && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 backdrop-blur-sm">
            {needsGtmReconnect && (
              <div className="shrink-0 border-b border-orange-500/40 bg-orange-950/95 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-orange-100">
                  <span className="font-semibold text-white">Google Tag Manager disconnected.</span> Reconnect to load
                  accounts and deploy. After Google sign-in you will return to this migration.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleGtmReconnect}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-[#41ffaf] text-[#003822] hover:opacity-90"
                  >
                    Reconnect GTM
                  </button>
                  <button
                    type="button"
                    onClick={() => setNeedsGtmReconnect(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-orange-200 hover:bg-white/10"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
              <div className="w-full max-w-4xl bg-[#20201f] rounded-xl overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[600px] border border-white/5">
              {/* Left Panel */}
              <div className="w-full md:w-1/3 bg-[#1c1b1b] p-8 border-r border-white/5 flex flex-col">
                <div className="mb-8">
                  <h2 className="text-xs uppercase tracking-widest text-[#41ffaf] mb-2">Stage 04</h2>
                  <h3 className="text-2xl font-bold leading-tight">Final Deployment Setup</h3>
                </div>

                <div className="bg-[#20201f] rounded-lg p-6 mb-8 border border-white/5">
                  <p className="text-sm text-[#bacbbe] mb-4">Deployment Summary</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-[#41ffaf]">{approvedTags.size}</span>
                    <span className="text-sm text-[#bacbbe] font-medium">Approved Tags</span>
                  </div>
                  <p className="text-[10px] text-[#bacbbe]/90 leading-relaxed">
                    Approved tags are deployed as <span className="text-white font-semibold">one server tag per client tag type</span>
                    {approvedTags.size > 0 ? ` (≈${serverTagsToCreate} server tag${serverTagsToCreate === 1 ? '' : 's'} for this approval).` : '.'}
                  </p>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#bacbbe]">Run</span>
                      <span className="font-mono text-[#b6c4ff]">{runId.slice(0, 12)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#bacbbe]">Mode</span>
                      <span className="font-mono text-[#b6c4ff]">{containerMode || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex gap-3">
                  <button
                    onClick={() => setShowDeploymentModal(false)}
                    className="flex-1 text-sm font-medium text-[#bacbbe] hover:text-white transition-colors"
                  >
                    Cancel Session
                  </button>
                </div>
              </div>

              {/* Right Panel */}
              <div className="w-full md:w-2/3 p-8 flex flex-col gap-10 overflow-y-auto max-h-[800px]">
                {/* Target Container */}
                <section>
                  <h3 className="text-sm text-[#bacbbe] mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs">database</span> Target Container
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="relative cursor-pointer">
                      <input
                        className="peer sr-only"
                        name="container_mode"
                        type="radio"
                        checked={containerMode === 'existing'}
                        onChange={() => {
                          setContainerMode('existing');
                          void loadServerContainers();
                        }}
                      />
                      <div className="p-4 rounded-lg bg-[#1c1b1b] border border-transparent peer-checked:border-[#41ffaf] peer-checked:bg-[#41ffaf]/5 transition-all">
                        <p className="text-sm font-semibold mb-1">Use Existing Container</p>
                        <p className="text-xs text-[#bacbbe] leading-relaxed">Deploy to an existing provisioned environment.</p>
                      </div>
                    </label>

                    <label className="relative cursor-pointer">
                      <input
                        className="peer sr-only"
                        name="container_mode"
                        type="radio"
                        checked={containerMode === 'create'}
                        onChange={() => {
                          setContainerMode('create');
                          if (gtmAccounts.length === 0) {
                            void loadGtmAccounts().catch(() => {});
                          }
                        }}
                      />
                      <div className="p-4 rounded-lg bg-[#1c1b1b] border border-transparent peer-checked:border-[#41ffaf] peer-checked:bg-[#41ffaf]/5 transition-all">
                        <p className="text-sm font-semibold mb-1">Create New Container</p>
                        <p className="text-xs text-[#bacbbe] leading-relaxed">Initialize a new server-side instance.</p>
                      </div>
                    </label>
                  </div>

                  {/* Existing container */}
                  {containerMode === 'existing' && (
                    <div className="mt-6 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-[10px] uppercase tracking-wider text-[#bacbbe]">Server Container</label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleGtmReconnect}
                            className="text-[10px] font-semibold text-orange-300 hover:underline"
                          >
                            Reconnect GTM
                          </button>
                          <button
                            type="button"
                            onClick={() => void loadServerContainers()}
                            className="text-[10px] font-semibold text-[#41ffaf] hover:underline"
                          >
                            {loadingContainers ? 'Loading…' : 'Load containers'}
                          </button>
                        </div>
                      </div>

                      <select
                        value={serverContainerPath}
                        onChange={(e) => {
                          const selectedPath = e.target.value;
                          setServerContainerPath(selectedPath);
                          const selectedContainer = serverContainers.find((c) => c.path === selectedPath);
                          const url = selectedContainer?.taggingServerUrls?.[0] || '';
                          settransport_url(url);
                          if (url) addLog(`✅ Server container URL: ${url}`);
                          else addLog('⚠️ No tagging URL found for this container.');
                        }}
                        className="w-full bg-[#353535] border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#41ffaf]/40 transition-all"
                      >
                        <option value="">Choose a server container...</option>
                        {serverContainers.map((c) => (
                          <option key={c.path} value={c.path}>
                            {c.name} ({c.publicId})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Create new container */}
                  {containerMode === 'create' && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-[10px] uppercase tracking-wider text-[#bacbbe]">GTM Account</label>
                          <button
                            type="button"
                            onClick={handleGtmReconnect}
                            className="text-[10px] font-semibold text-orange-300 hover:underline"
                          >
                            Reconnect GTM
                          </button>
                        </div>
                        <select
                          value={selectedAccount}
                          onChange={(e) => setSelectedAccount(e.target.value)}
                          className="w-full bg-[#353535] border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#41ffaf]/40 transition-all"
                        >
                          <option value="">Select account...</option>
                          {gtmAccounts.map((a) => (
                            <option key={a.path} value={a.path}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-[#bacbbe]">Container Name</label>
                        <input
                          className="w-full bg-[#353535] border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#41ffaf]/40 transition-all font-mono"
                          placeholder="e.g. production-main-ss"
                          type="text"
                          value={newContainerName}
                          onChange={(e) => setNewContainerName(e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <button
                          onClick={async () => {
                            if (!selectedAccount || !newContainerName) return;
                            setIsCreatingContainer(true);
                            try {
                              const gtmSessionId = getGtmSession();
                              if (!gtmSessionId) {
                                setNeedsGtmReconnect(true);
                                throw new Error(
                                  'No GTM session saved. Click "Reconnect GTM" in this dialog, then try again.'
                                );
                              }
                              const result = await apiClient.createGtmServerContainer(gtmSessionId, {
                                accountPath: selectedAccount,
                                name: newContainerName,
                                importId: run?.importId
                              });
                              setServerContainerPath(result.path);
                              addLog(`✅ Created server container: ${result.publicId}`);
                            } catch (err: any) {
                              if (isGtmSessionApiError(err)) setNeedsGtmReconnect(true);
                              alert.error(`Failed to create container: ${err.message}`);
                            } finally {
                              setIsCreatingContainer(false);
                            }
                          }}
                          disabled={isCreatingContainer || !selectedAccount || !newContainerName}
                          className={`w-full px-6 py-3 rounded-lg text-sm font-bold transition-all ${
                            isCreatingContainer || !selectedAccount || !newContainerName
                              ? 'bg-white/5 text-gray-400 cursor-not-allowed'
                              : 'bg-[#41ffaf] text-[#003822] hover:opacity-90'
                          }`}
                        >
                          {isCreatingContainer ? 'Creating…' : 'Create Server Container'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* Meta Pixel Access Token */}
                {(() => {
                  const hasMetaPixelTags = approvedMappingsList.some((m) =>
                    m.category?.toLowerCase() === 'meta' ||
                    m.clientTagType?.toLowerCase().includes('meta') ||
                    m.clientTagType?.toLowerCase().includes('facebook') ||
                    m.clientTagName?.toLowerCase().includes('meta') ||
                    m.clientTagName?.toLowerCase().includes('facebook')
                  );

                  if (!hasMetaPixelTags) return null;

                  return (
                    <section>
                      <h3 className="text-sm text-[#bacbbe] mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-xs">key</span> Meta Pixel Configuration
                      </h3>
                      <div className="bg-[#1c1b1b] rounded-lg p-4 border border-white/5">
                        <p className="text-xs text-[#bacbbe] mb-3">
                          You have Meta Pixel tags in this deployment. Please provide your Meta Conversions API Access Token.
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-[#bacbbe]">
                            Meta Access Token
                          </label>
                          <input
                            className="w-full bg-[#353535] border-none rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-[#41ffaf]/40 transition-all font-mono"
                            placeholder="Enter your Meta Conversions API access token"
                            type="password"
                            value={metaAccessToken}
                            onChange={(e) => setMetaAccessToken(e.target.value)}
                          />
                          <p className="text-[10px] text-[#bacbbe]/80 mt-2">
                            <span className="text-yellow-400">Optional:</span> If not provided, a placeholder will be used and you&apos;ll need to update it in GTM.
                          </p>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {/* Deployment Rules */}
                <section>
                  <h3 className="text-sm text-[#bacbbe] mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs">rule</span> Deployment Rules
                  </h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-4 p-4 rounded-lg bg-[#1c1b1b] hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-white/5">
                      <input
                        className="w-5 h-5 rounded bg-[#353535] text-[#41ffaf] focus:ring-offset-0 focus:ring-1 focus:ring-[#41ffaf]"
                        type="checkbox"
                        checked={deploymentRules.debugMode}
                        onChange={(e) => setDeploymentRules((prev) => ({ ...prev, debugMode: e.target.checked }))}
                      />
                      <div className="flex-grow">
                        <p className="text-sm font-medium">Enable Debug Mode</p>
                        <p className="text-xs text-[#bacbbe]">Log detailed events for troubleshooting.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-4 p-4 rounded-lg bg-[#1c1b1b] hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-white/5">
                      <input
                        className="w-5 h-5 rounded bg-[#353535] text-[#41ffaf] focus:ring-offset-0 focus:ring-1 focus:ring-[#41ffaf]"
                        type="checkbox"
                        checked={deploymentRules.stagingFirst}
                        onChange={(e) => setDeploymentRules((prev) => ({ ...prev, stagingFirst: e.target.checked }))}
                      />
                      <div className="flex-grow">
                        <p className="text-sm font-medium">Publish to Staging First</p>
                        <p className="text-xs text-[#bacbbe]">Test in a workspace before final production cutover.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-4 p-4 rounded-lg bg-[#1c1b1b] hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-white/5">
                      <input
                        className="w-5 h-5 rounded bg-[#353535] text-[#41ffaf] focus:ring-offset-0 focus:ring-1 focus:ring-[#41ffaf]"
                        type="checkbox"
                        checked={deploymentRules.piiSanitization}
                        onChange={(e) => setDeploymentRules((prev) => ({ ...prev, piiSanitization: e.target.checked }))}
                      />
                      <div className="flex-grow">
                        <p className="text-sm font-medium">Sanitize PII Data</p>
                        <p className="text-xs text-[#bacbbe]">Scrub sensitive strings from logs.</p>
                      </div>
                    </label>
                  </div>
                </section>

                {/* Footer action */}
                <div className="mt-auto pt-6 flex flex-col gap-4 border-t border-white/5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      onClick={() => setShowDeploymentModal(false)}
                      className="text-sm font-medium text-[#bacbbe] hover:text-white transition-colors"
                    >
                      Cancel Session
                    </button>
                    <button
                      type="button"
                      onClick={handleGtmReconnect}
                      className="text-sm font-semibold text-[#41ffaf] hover:underline"
                    >
                      Reconnect GTM
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (approvedTags.size === 0) {
                        alert.warning('Please approve at least one tag before deploying');
                        return;
                      }
                      if (!serverContainerPath) {
                        alert.warning('Select or create a server container first.');
                        return;
                      }
                      if (!clientContainerPath || !clientWorkspacePath) {
                        alert.error('Client container info not available. Please re-import your container.');
                        return;
                      }
                      setWorkspaceTab('deployment');
                      setIsDeploying(true);
                      setShowDeploymentModal(false);
                      addLog(`🚀 Starting deployment of ${approvedTags.size} approved tag(s)...`);
                      addLog(`📦 Client container: ${clientContainerPath}`);
                      addLog(`📦 Server container: ${serverContainerPath}`);
                      if (transport_url) addLog(`🌐 Server URL: ${transport_url}`);
                      try {
                        const gtmSessionId = getGtmSession();
                        if (!gtmSessionId) {
                          setNeedsGtmReconnect(true);
                          throw new Error(
                            'No GTM session saved. Click "Reconnect GTM" in this dialog, then deploy again.'
                          );
                        }
                        addLog('⏳ Sending deploy request to API...');
                        if (metaAccessToken) {
                          addLog('🔑 Using provided Meta Access Token');
                        }
                        const result = await apiClient.deployApprovedTags(
                          runId,
                          Array.from(approvedTags),
                          clientContainerPath,
                          clientWorkspacePath,
                          serverContainerPath,
                          transport_url,
                          gtmSessionId,
                          metaAccessToken || undefined
                        );

                        // Check if deployment is async (202) or sync (200)
                        if (result.status === 'deploying') {
                          addLog('✅ Deployment started successfully');
                          addLog('⏳ Processing in background (this may take 1-2 minutes)...');
                          addLog('📊 Poll status will update automatically');
                          // Keep isDeploying true so UI shows deployment in progress
                          // Polling will pick up deploymentStatus and update UI
                        } else {
                          // Legacy sync response (200) - process immediately
                          processDeploymentResult(result);
                          setIsDeploying(false);
                        }

                        try {
                          const refreshed = await apiClient.getRun(runId);
                          setRun(refreshed);
                        } catch {
                          /* non-fatal */
                        }
                      } catch (error: any) {
                        if (isGtmSessionApiError(error)) setNeedsGtmReconnect(true);
                        addLog(`❌ Deployment failed: ${error.message}`);
                        alert.error(`Deployment failed: ${error.message}`);
                        setIsDeploying(false);
                      }
                    }}
                    className="bg-[#41ffaf] text-[#003822] font-bold px-8 py-3.5 rounded-lg flex items-center gap-3 active:scale-95 transition-all"
                    disabled={isDeploying}
                  >
                    <span>Deploy Now</span>
                    <span className="material-symbols-outlined text-xl">rocket_launch</span>
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );

}
