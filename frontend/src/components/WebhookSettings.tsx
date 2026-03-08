import { useState, useEffect, useCallback } from 'react';
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  PauseCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Send,
  RotateCcw,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { webhooksApi, type Webhook, type WebhookDelivery } from '../lib/api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

const ALL_EVENTS = [
  { value: 'task.created', label: 'Task created' },
  { value: 'task.updated', label: 'Task updated' },
  { value: 'task.completed', label: 'Task completed' },
  { value: 'task.uncompleted', label: 'Task uncompleted' },
  { value: 'task.deleted', label: 'Task deleted' },
  { value: 'note.created', label: 'Note created' },
  { value: 'note.updated', label: 'Note updated' },
  { value: 'note.deleted', label: 'Note deleted' },
  { value: 'folder.created', label: 'Folder created' },
  { value: 'folder.updated', label: 'Folder updated' },
  { value: 'folder.deleted', label: 'Folder deleted' },
];

function generateSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return 'whsec_' + Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    paused: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    disabled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    pending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  };
  const icons: Record<string, React.ReactNode> = {
    active: <CheckCircle className="w-3 h-3" />,
    paused: <PauseCircle className="w-3 h-3" />,
    disabled: <XCircle className="w-3 h-3" />,
    success: <CheckCircle className="w-3 h-3" />,
    failed: <XCircle className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
    cancelled: <XCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? ''}`}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Create form ─────────────────────────────────────────────────────────────

function CreateWebhookForm({ onCreated }: { onCreated: () => void }) {
  const { showToast } = useToast();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['task.created', 'task.updated', 'task.completed', 'task.deleted']);
  const [secret, setSecret] = useState(() => generateSecret());
  const [secretCopied, setSecretCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [useWildcard, setUseWildcard] = useState(false);

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedEvents = useWildcard ? ['*'] : events;
    if (selectedEvents.length === 0) {
      showToast('Select at least one event', 'error');
      return;
    }
    setIsCreating(true);
    try {
      await webhooksApi.create({ url, events: selectedEvents, secret });
      showToast('Webhook registered', 'success');
      onCreated();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to create webhook', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      {/* URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Endpoint URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-relay.example.com/webhook"
          required
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Events */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Events
        </label>
        <div className="mb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useWildcard}
              onChange={(e) => setUseWildcard(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium">Subscribe to all events (<code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">*</code>)</span>
          </label>
        </div>
        {!useWildcard && (
          <div className="grid grid-cols-2 gap-1">
            {ALL_EVENTS.map((ev) => (
              <label
                key={ev.value}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={events.includes(ev.value)}
                  onChange={() => toggleEvent(ev.value)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <code className="text-xs">{ev.value}</code>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Secret */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Signing Secret
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={copySecret}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {secretCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setSecret(generateSecret())}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Generate new secret"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Copy this secret now — it won't be shown again. Used to verify <code>X-Notez-Signature</code> headers.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={isCreating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Register Webhook
        </button>
      </div>
    </form>
  );
}

// ─── Delivery row ─────────────────────────────────────────────────────────────

function DeliveryRow({ delivery, webhookId, onReplay }: {
  delivery: WebhookDelivery;
  webhookId: string;
  onReplay: () => void;
}) {
  const { showToast } = useToast();
  const [isReplaying, setIsReplaying] = useState(false);

  const handleReplay = async () => {
    setIsReplaying(true);
    try {
      await webhooksApi.replayDelivery(webhookId, delivery.id);
      showToast('Delivery queued for replay', 'success');
      onReplay();
    } catch {
      showToast('Failed to replay delivery', 'error');
    } finally {
      setIsReplaying(false);
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <StatusBadge status={delivery.status} />
      <code className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
        {delivery.event?.eventType ?? '—'}
      </code>
      <span className="text-xs text-gray-400">
        {delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : delivery.status === 'pending' ? 'pending' : 'timeout'}
      </span>
      <span className="text-xs text-gray-400">
        {delivery.responseTimeMs != null ? `${delivery.responseTimeMs}ms` : ''}
      </span>
      <span className="text-xs text-gray-400 w-32 shrink-0">
        {new Date(delivery.createdAt).toLocaleString()}
      </span>
      {(delivery.status === 'failed' || delivery.status === 'success') && (
        <button
          onClick={handleReplay}
          disabled={isReplaying}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50"
          title="Replay delivery"
        >
          {isReplaying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

// ─── Webhook card ─────────────────────────────────────────────────────────────

function WebhookCard({ webhook, onUpdate, onDelete }: {
  webhook: Webhook;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      const res = await webhooksApi.listDeliveries(webhook.id, { limit: 20 });
      setDeliveries(res.data.deliveries);
      setDeliveryTotal(res.data.total);
    } catch {
      // silent
    } finally {
      setLoadingDeliveries(false);
    }
  }, [webhook.id]);

  useEffect(() => {
    if (expanded) loadDeliveries();
  }, [expanded, loadDeliveries]);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await webhooksApi.test(webhook.id);
      showToast('Test event sent — check the delivery log below', 'success');
      setTimeout(loadDeliveries, 1000);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Failed to send test event', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = webhook.status === 'active' ? 'paused' : 'active';
    setIsUpdatingStatus(true);
    try {
      await webhooksApi.update(webhook.id, { status: newStatus });
      showToast(`Webhook ${newStatus}`, 'success');
      onUpdate();
    } catch {
      showToast('Failed to update webhook', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Webhook',
      message: 'This will remove the webhook and cancel all pending deliveries. This cannot be undone.',
      confirmText: 'Delete',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    try {
      await webhooksApi.delete(webhook.id);
      showToast('Webhook deleted', 'success');
      onDelete();
    } catch {
      showToast('Failed to delete webhook', 'error');
    }
  };

  const successCount = deliveries.filter((d) => d.status === 'success').length;
  const failedCount = deliveries.filter((d) => d.status === 'failed').length;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <WebhookIcon className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">
              {webhook.url}
            </code>
            <StatusBadge status={webhook.status} />
            {webhook.consecutiveFailures >= 10 && (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="w-3 h-3" />
                {webhook.consecutiveFailures} failures
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {webhook.events.map((ev) => (
              <span
                key={ev}
                className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs font-mono"
              >
                {ev}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleTest}
            disabled={isTesting || webhook.status !== 'active'}
            title="Send test event"
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40 transition-colors"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
          <button
            onClick={handleToggleStatus}
            disabled={isUpdatingStatus || webhook.status === 'disabled'}
            title={webhook.status === 'active' ? 'Pause' : 'Resume'}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-yellow-600 dark:hover:text-yellow-400 disabled:opacity-40 transition-colors"
          >
            {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDelete}
            title="Delete webhook"
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            title="Show delivery log"
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Delivery log */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Recent Deliveries
              {deliveryTotal > 0 && (
                <span className="ml-2 text-xs text-gray-500">
                  ({successCount} success, {failedCount} failed of {deliveries.length} shown)
                </span>
              )}
            </h4>
            <button
              onClick={loadDeliveries}
              disabled={loadingDeliveries}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingDeliveries ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {loadingDeliveries ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No deliveries yet. Use the test button to verify your endpoint.
            </p>
          ) : (
            <div>
              {deliveries.map((d) => (
                <DeliveryRow
                  key={d.id}
                  delivery={d}
                  webhookId={webhook.id}
                  onReplay={loadDeliveries}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WebhookSettings() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadWebhooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await webhooksApi.list();
      setWebhooks(res.data.webhooks);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleCreated = () => {
    setShowCreateForm(false);
    loadWebhooks();
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Receive HTTP POST notifications when notes, tasks, or folders change.
            Each delivery is signed with HMAC-SHA256.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Max 10 webhooks per account.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Webhook
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="border border-blue-200 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Register New Webhook</h3>
            <button
              onClick={() => setShowCreateForm(false)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
          <CreateWebhookForm onCreated={handleCreated} />
        </div>
      )}

      {/* Webhook list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
          <WebhookIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No webhooks registered yet.</p>
          <p className="text-xs mt-1">Add a webhook to start receiving push notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookCard
              key={wh.id}
              webhook={wh}
              onUpdate={loadWebhooks}
              onDelete={loadWebhooks}
            />
          ))}
        </div>
      )}

      {/* HMAC verification guide */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Verifying Webhook Signatures
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Every delivery includes an <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">X-Notez-Signature</code> header.
          Verify it on your receiver before processing the event.
        </p>
        <pre className="text-xs bg-gray-900 text-green-400 rounded-md p-3 overflow-x-auto">
{`// Node.js verification example
const crypto = require('crypto');

function verifyWebhook(req, secret) {
  const signature = req.headers['x-notez-signature'];
  const timestamp  = req.headers['x-notez-timestamp'];

  // 1. Reject stale events (> 5 min old)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp too old — possible replay attack');
  }

  // 2. Verify HMAC-SHA256 (timestamp is part of signed payload)
  const payload  = \`v0:\${timestamp}:\${req.rawBody}\`;
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret)
          .update(payload)
          .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error('Invalid signature');
  }
}

// Use X-Notez-Delivery for idempotency (retries reuse the same ID)
const deliveryId = req.headers['x-notez-delivery'];`}
        </pre>
      </div>
    </div>
  );
}
