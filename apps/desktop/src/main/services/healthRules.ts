import type {
  AppSettings,
  MetricStatus,
  NetworkThresholds,
  PercentThresholds,
  ResourceAdvice,
  SystemHealthSummary
} from '@shared/models';

type ResourceKind = 'cpu' | 'memory' | 'disk' | 'network';

const RESOURCE_COPY: Record<ResourceKind, Record<MetricStatus, ResourceAdvice>> = {
  cpu: {
    healthy: {
      headline: 'Compute headroom is available',
      details: 'The processor is running within an expected desktop range.',
      action: 'No action needed unless the spike is sustained.'
    },
    elevated: {
      headline: 'Compute pressure is rising',
      details: 'Short bursts are usually normal while apps launch or update.',
      action: 'Review the top processes table if the load stays elevated.'
    },
    stressed: {
      headline: 'CPU demand is sustained',
      details: 'The device may feel sluggish while heavy work continues.',
      action: 'Inspect the busiest processes and close anything unexpected.'
    }
  },
  memory: {
    healthy: {
      headline: 'Memory usage is balanced',
      details: 'Active memory demand still leaves comfortable headroom.',
      action: 'Use this as your normal baseline for the device.'
    },
    elevated: {
      headline: 'Memory demand is building',
      details: 'Open applications or background services are consuming more RAM.',
      action: 'Check the process table for large memory consumers.'
    },
    stressed: {
      headline: 'Memory pressure is high',
      details: 'The system may begin swapping data to disk under sustained load.',
      action: 'Close unused applications before the device slows further.'
    }
  },
  disk: {
    healthy: {
      headline: 'Storage capacity looks comfortable',
      details: 'Available disk space is still within a healthy operating range.',
      action: 'No cleanup is required right now.'
    },
    elevated: {
      headline: 'Disk headroom is tightening',
      details: 'Limited free space can affect updates, temp files, and caches.',
      action: 'Plan a cleanup pass before free space drops further.'
    },
    stressed: {
      headline: 'Disk space is constrained',
      details: 'The device is approaching a level where repairs and updates get harder.',
      action: 'Prioritize cleanup or remove non-essential files before updates start failing.'
    }
  },
  network: {
    healthy: {
      headline: 'Traffic is steady',
      details: 'Current network throughput looks light or expected for desktop use.',
      action: 'No action needed unless you expected the device to be idle.'
    },
    elevated: {
      headline: 'Transfer activity is noticeable',
      details: 'Large downloads, sync jobs, or updates may be in progress.',
      action: 'Validate whether current transfers match what you are doing.'
    },
    stressed: {
      headline: 'Heavy network traffic detected',
      details: 'The device is pushing or receiving substantial traffic right now.',
      action: 'Confirm that the activity is expected and check which apps are busy.'
    }
  }
};

const STATUS_WEIGHT: Record<MetricStatus, number> = {
  healthy: 0,
  elevated: 1,
  stressed: 2
};

export const getPercentStatus = (
  value: number,
  thresholds: PercentThresholds
): MetricStatus => {
  if (value >= thresholds.stressed) {
    return 'stressed';
  }

  if (value >= thresholds.elevated) {
    return 'elevated';
  }

  return 'healthy';
};

export const getNetworkStatus = (
  valueBytesPerSec: number,
  thresholds: NetworkThresholds
): MetricStatus => {
  if (valueBytesPerSec >= thresholds.stressedBytesPerSec) {
    return 'stressed';
  }

  if (valueBytesPerSec >= thresholds.elevatedBytesPerSec) {
    return 'elevated';
  }

  return 'healthy';
};

export const getResourceAdvice = (
  resource: ResourceKind,
  status: MetricStatus
): ResourceAdvice => RESOURCE_COPY[resource][status];

export const getHealthRules = (
  settings: AppSettings
): AppSettings['thresholds'] => settings.thresholds;

const highestStatus = (statuses: MetricStatus[]): MetricStatus =>
  statuses.reduce<MetricStatus>((current, candidate) => {
    if (STATUS_WEIGHT[candidate] > STATUS_WEIGHT[current]) {
      return candidate;
    }

    return current;
  }, 'healthy');

export const buildSystemHealthSummary = (statuses: {
  cpu: MetricStatus;
  memory: MetricStatus;
  disk: MetricStatus;
  network: MetricStatus;
}): SystemHealthSummary => {
  const overallStatus = highestStatus(Object.values(statuses));
  const actions: string[] = [];

  if (statuses.cpu !== 'healthy' || statuses.memory !== 'healthy') {
    actions.push('Review the top processes list to confirm the busiest apps are expected.');
  }

  if (statuses.disk !== 'healthy') {
    actions.push('Plan storage cleanup before free space becomes a repair blocker.');
  }

  if (statuses.network !== 'healthy') {
    actions.push('Validate whether the current transfer activity matches active user tasks.');
  }

  if (actions.length === 0) {
    actions.push('Use this dashboard as a baseline for what normal activity looks like.');
  }

  if (overallStatus === 'stressed') {
    return {
      status: overallStatus,
      headline: 'Sustained pressure needs attention',
      summary:
        'At least one major resource is under heavy load. The system is still visible and transparent, but it may feel less responsive.',
      actions
    };
  }

  if (overallStatus === 'elevated') {
    return {
      status: overallStatus,
      headline: 'The system is active but still manageable',
      summary:
        'One or more resources are elevated. That can be normal during installs, sync jobs, or large app launches.',
      actions
    };
  }

  return {
    status: overallStatus,
    headline: 'The system looks stable',
    summary:
      'Current activity sits in a healthy range for a desktop workload. Use this snapshot as a clean baseline.',
    actions
  };
};
