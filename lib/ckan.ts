/**
 * CKAN API client for fetching datasets and resources
 */

interface CKANResponse<T = any> {
  success: boolean;
  result?: T;
  error?: {
    message?: string;
    __type?: string;
    [key: string]: any;
  };
  help?: string;
}

interface CKANResource {
  id: string;
  name?: string;
  format?: string;
  url?: string;
  download_url?: string;
  size?: number;
  [key: string]: any;
}

interface CKANPackage {
  id: string;
  name: string;
  resources: CKANResource[];
  [key: string]: any;
}

/**
 * Retry configuration for network requests
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  retryableStatuses: [429, 502, 503, 504],
};

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an HTTP status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  return RETRY_CONFIG.retryableStatuses.includes(status);
}

/**
 * Call CKAN Action API with retry logic
 */
export async function ckanGet(
  base: string,
  action: string,
  params: Record<string, string> = {},
  retryCount = 0
): Promise<any> {
  const url = new URL(`${base}/api/3/action/${action}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store', // Prevent Next.js fetch cache (CKAN responses can exceed 2MB limit)
    });

    // Check HTTP status
    if (!response.ok) {
      const status = response.status;
      if (isRetryableStatus(status) && retryCount < RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.initialDelay * Math.pow(2, retryCount),
          RETRY_CONFIG.maxDelay
        );
        console.warn(
          `CKAN API returned ${status}, retrying in ${delay}ms... (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`
        );
        await sleep(delay);
        return ckanGet(base, action, params, retryCount + 1);
      }
      throw new Error(`CKAN API HTTP ${status}: ${response.statusText}`);
    }

    const json: CKANResponse = await response.json();

    // ALWAYS check success field, not just HTTP status
    if (!json.success) {
      const errorMsg = json.error?.message || 'Unknown error';
      const errorType = json.error?.__type || 'Unknown';
      throw new Error(
        `CKAN API error (${errorType}): ${errorMsg}`
      );
    }

    return json.result;
  } catch (error: any) {
    // Retry on network errors
    if (
      (error.name === 'TypeError' || error.message?.includes('fetch')) &&
      retryCount < RETRY_CONFIG.maxRetries
    ) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(2, retryCount),
        RETRY_CONFIG.maxDelay
      );
      console.warn(
        `Network error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`
      );
      await sleep(delay);
      return ckanGet(base, action, params, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Resolve resource URL from a resource ID
 */
export async function resolveResourceUrlFromResourceId(
  base: string,
  resourceId: string
): Promise<string> {
  console.log(`Fetching CKAN resource_show for resource ID: ${resourceId}`);
  const resource = await ckanGet<CKANResource>(base, 'resource_show', {
    id: resourceId,
  });

  const url = resource.download_url || resource.url;
  if (!url) {
    throw new Error(
      `Resource ${resourceId} has no url or download_url field`
    );
  }

  console.log(`Selected resource: ${resource.name || resourceId} (${resource.format || 'unknown format'}) ${url}`);
  return url;
}

/**
 * Resolve resource URL from a dataset/package ID
 */
export async function resolveResourceUrlFromDataset(
  base: string,
  datasetId: string,
  resourceName?: string,
  preferredFormat?: string
): Promise<string> {
  console.log(`Fetching CKAN package_show for dataset ID: ${datasetId}`);
  const package_ = await ckanGet<CKANPackage>(base, 'package_show', {
    id: datasetId,
  });

  if (!package_.resources || package_.resources.length === 0) {
    throw new Error(`Dataset ${datasetId} has no resources`);
  }

  // Filter resources
  let candidates = package_.resources;

  // Filter by resource name if provided
  if (resourceName) {
    candidates = candidates.filter(
      (r) => r.name?.toLowerCase() === resourceName.toLowerCase()
    );
    if (candidates.length === 0) {
      throw new Error(
        `No resource found with name "${resourceName}" in dataset ${datasetId}`
      );
    }
  }

  // Filter by format preference
  if (preferredFormat) {
    const formatLower = preferredFormat.toLowerCase();
    const formatMatches = candidates.filter(
      (r) => r.format?.toLowerCase() === formatLower
    );
    if (formatMatches.length > 0) {
      candidates = formatMatches;
    }
  }

  // Prefer CSV format or .csv/.csv.gz URLs
  const csvCandidates = candidates.filter((r) => {
    const format = r.format?.toLowerCase() || '';
    const url = (r.url || r.download_url || '').toLowerCase();
    return (
      format === 'csv' ||
      url.endsWith('.csv') ||
      url.endsWith('.csv.gz') ||
      url.endsWith('.csv.gz?')
    );
  });

  if (csvCandidates.length > 0) {
    candidates = csvCandidates;
  }

  // Select best candidate: largest by size, or first match
  let selected: CKANResource;
  if (candidates.length === 1) {
    selected = candidates[0];
  } else {
    // Sort by size (descending), then take first
    candidates.sort((a, b) => {
      const sizeA = a.size || 0;
      const sizeB = b.size || 0;
      return sizeB - sizeA;
    });
    selected = candidates[0];
  }

  const url = selected.download_url || selected.url;
  if (!url) {
    throw new Error(
      `Selected resource ${selected.id} has no url or download_url field`
    );
  }

  console.log(
    `Selected resource: ${selected.name || selected.id} (${selected.format || 'unknown format'}) ${url}`
  );

  return url;
}
