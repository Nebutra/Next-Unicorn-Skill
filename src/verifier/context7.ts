// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * Result of verifying a single library recommendation against Context7 MCP.
 */
export interface VerificationResult {
  status: 'verified' | 'unverified' | 'unavailable';
  libraryId?: string;
  documentationUrl?: string;
  version?: string;
  note?: string;
}

/**
 * Client interface for Context7 MCP integration.
 * Designed for easy mocking in tests — the real implementation calls
 * Context7 MCP tools (`resolve-library-id` and `query-docs`).
 *
 * Per Context7 best practices:
 * - resolveLibraryId accepts both query (for ranking) and libraryName
 * - getLibraryDocs accepts libraryId and query
 * - Implementations should handle 202 (processing), 301 (redirect), 429 (rate limit)
 */
export interface Context7Client {
  /**
   * Resolve a library name to a Context7-compatible library ID.
   * @param libraryName — the library to search for
   * @param query — the user's question/task (used by Context7 to rank results)
   * @returns library ID string, or null if not found
   */
  resolveLibraryId(libraryName: string, query?: string): Promise<string | null>;

  /**
   * Fetch documentation for a library by its Context7 ID.
   * @param libraryId — Context7-compatible library ID (e.g., "/vercel/next.js")
   * @param query — the question/task to get relevant docs for
   */
  getLibraryDocs(
    libraryId: string,
    query: string,
  ): Promise<{ url: string; version: string } | null>;
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

/** Maximum retry attempts (Context7 best practice: 3) */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in ms */
const BASE_DELAY_MS = 1000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Single recommendation verification (with exponential backoff retry)
// ---------------------------------------------------------------------------

/**
 * Verify a single library recommendation against Context7 MCP.
 *
 * Flow:
 * 1. Call `resolveLibraryId` to get the canonical library ID.
 *    - If it returns `null` → status "unverified" (library not found / 404).
 *    - If it throws → retry with exponential backoff (handles 429, 202, 5xx).
 *    - After max retries → status "unavailable".
 * 2. Call `getLibraryDocs` with the library ID and use case.
 *    - If it returns docs → status "verified" with URL and version.
 *    - If it returns `null` → status "unverified" (use case not confirmed).
 *    - If it throws → retry with exponential backoff.
 *    - After max retries → status "unavailable".
 */
export async function verifyRecommendation(
  client: Context7Client,
  libraryName: string,
  useCase: string,
): Promise<VerificationResult> {
  // Step 1: Resolve library ID (with exponential backoff)
  let libraryId: string | null;
  try {
    libraryId = await retryWithBackoff(
      () => client.resolveLibraryId(libraryName, useCase),
    );
  } catch {
    return {
      status: 'unavailable',
      note: `Context7 service error resolving library "${libraryName}" after ${MAX_RETRIES} retries`,
    };
  }

  // Library not found in Context7
  if (libraryId === null) {
    return {
      status: 'unverified',
      note: `Library "${libraryName}" not found in Context7`,
    };
  }

  // Step 2: Get library docs (with exponential backoff)
  let docs: { url: string; version: string } | null;
  try {
    docs = await retryWithBackoff(
      () => client.getLibraryDocs(libraryId!, useCase),
    );
  } catch {
    return {
      status: 'unavailable',
      libraryId,
      note: `Context7 service error fetching docs for "${libraryName}" after ${MAX_RETRIES} retries`,
    };
  }

  // Use case not confirmed by documentation
  if (docs === null) {
    return {
      status: 'unverified',
      libraryId,
      note: `Documentation for "${libraryName}" does not confirm use case "${useCase}"`,
    };
  }

  // Fully verified
  return {
    status: 'verified',
    libraryId,
    documentationUrl: docs.url,
    version: docs.version,
  };
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

/**
 * Retry a function with exponential backoff.
 * Delay: BASE_DELAY_MS * 2^attempt (1s, 2s, 4s for 3 attempts).
 *
 * Per Context7 best practices:
 * - 429 (rate limit): exponential backoff
 * - 202 (processing): wait and retry
 * - 5xx (server error): retry with backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Batch verification for all detections
// ---------------------------------------------------------------------------

/**
 * Item describing a library recommendation to verify.
 * The libraryName and useCase come from the AI agent's recommendation,
 * NOT from hardcoded catalog data.
 */
export interface VerificationItem {
  libraryName: string;
  useCase: string;
}

/**
 * Verify all library recommendations provided by the AI agent (or caller).
 *
 * Each item in the array corresponds to a detection by index. Items that are
 * `null` are skipped (detection had no recommendation from the agent).
 *
 * Processes each item independently — a failure for one library does
 * not affect others. Returns a Map keyed by detection index.
 */
export async function verifyAllRecommendations(
  client: Context7Client,
  items: Array<VerificationItem | null>,
): Promise<Map<number, VerificationResult>> {
  const results = new Map<number, VerificationResult>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const result = await verifyRecommendation(
      client,
      item.libraryName,
      item.useCase,
    );
    results.set(i, result);
  }

  return results;
}
