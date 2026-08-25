import type { PaginatedResult } from "./adapter.js";

/**
 * Drain a paginated listing into a single array.
 *
 * `listTags` and `listConstraints` default to 50 items per page. A caller that
 * needs the complete set, such as verifying a prompt against the whole approved
 * vocabulary, cannot read the first page and hope: with a 51st tag the check
 * would silently stop recognising it, and nothing would fail loudly.
 *
 * The page size here is a request, not an assumption. The loop stops when it has
 * as many items as the source reported, or when a page comes back empty, so an
 * adapter that caps the limit lower than asked still terminates.
 */
export async function collectAll<T>(
  fetchPage: (page: number, limit: number) => Promise<PaginatedResult<T>>,
  pageSize = 200,
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page, pageSize);
    all.push(...result.items);

    if (result.items.length === 0 || all.length >= result.total) {
      return all;
    }
  }
}
