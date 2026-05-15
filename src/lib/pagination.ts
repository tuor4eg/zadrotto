const DEFAULT_PAGE = 1;

export function parsePage(value: string | null | undefined) {
  const page = Number(value);

  return Number.isSafeInteger(page) && page > 0 ? page : DEFAULT_PAGE;
}

export function parsePageSize(
  value: string | null | undefined,
  allowedPageSizes: readonly number[],
  defaultPageSize: number,
) {
  const pageSize = Number(value);

  return allowedPageSizes.includes(pageSize) ? pageSize : defaultPageSize;
}

export function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, DEFAULT_PAGE), Math.max(totalPages, DEFAULT_PAGE));
}

export function getTotalPages(totalCount: number, pageSize: number) {
  return Math.max(Math.ceil(totalCount / pageSize), DEFAULT_PAGE);
}

export function getOffset(page: number, pageSize: number) {
  return (page - 1) * pageSize;
}
