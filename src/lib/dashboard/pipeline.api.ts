import { withBasePath } from '@/lib/base-path';
import type { PipelineData } from './pipeline-types';

/**
 * Fetches the pipeline phase data for the Kanban board column headers from the
 * BFF (`/api/dashboard/pipeline`), which injects the session Bearer server-side.
 *
 * Throws on any non-2xx response so callers can handle degraded state.
 * The `KanbanBoard` treats this as non-fatal: if the fetch fails the board
 * renders without column-level avg permanence (CA-4).
 *
 * (DASH-F2 / VBR-427)
 */
export async function getDashboardPipeline(): Promise<PipelineData> {
  const url = withBasePath('/api/dashboard/pipeline');
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`Falha ao carregar pipeline (${res.status}).`);
  }

  return (await res.json()) as PipelineData;
}
