export const ARCHIVE_CATALOG_GRID_CLASS_NAME =
  "grid grid-cols-3 content-start gap-2.5 md:grid-cols-4 xl:grid-cols-6";

export const ARCHIVE_CATALOG_GRID_ROW_COUNT = 5;

export const ARCHIVE_LIST_TILE_GAP = 10;

export const ARCHIVE_LIST_TARGET_TILE_WIDTH = 150;

export const ARCHIVE_LIST_MIN_COLUMN_COUNT = 3;

export const ARCHIVE_LIST_MIN_PAGE_SIZE =
  ARCHIVE_LIST_MIN_COLUMN_COUNT * ARCHIVE_CATALOG_GRID_ROW_COUNT;

export const ARCHIVE_LIST_MAX_PAGE_SIZE = 150;

const ARCHIVE_CATALOG_MD_BREAKPOINT = 768;
const ARCHIVE_CATALOG_XL_BREAKPOINT = 1280;

export function getArchiveListColumnCount(containerWidth: number) {
  return Math.max(
    ARCHIVE_LIST_MIN_COLUMN_COUNT,
    Math.floor(
      (containerWidth + ARCHIVE_LIST_TILE_GAP) /
        (ARCHIVE_LIST_TARGET_TILE_WIDTH + ARCHIVE_LIST_TILE_GAP),
    ),
  );
}

export function getArchiveListPageSize(
  containerWidth: number,
  rowCount = ARCHIVE_CATALOG_GRID_ROW_COUNT,
) {
  return getArchiveListColumnCount(containerWidth) * rowCount;
}

export function parseArchiveListPageSize(value: string | null | undefined) {
  const pageSize = Number(value);

  if (
    Number.isSafeInteger(pageSize) &&
    pageSize >= ARCHIVE_LIST_MIN_PAGE_SIZE &&
    pageSize <= ARCHIVE_LIST_MAX_PAGE_SIZE
  ) {
    return pageSize;
  }

  return ARCHIVE_CATALOG_GRID_ROW_COUNT * 4;
}

export function clampArchiveListPageSize(pageSize: number) {
  return Math.min(
    ARCHIVE_LIST_MAX_PAGE_SIZE,
    Math.max(ARCHIVE_LIST_MIN_PAGE_SIZE, pageSize),
  );
}

export function getArchiveCatalogColumnCount(viewportWidth: number) {
  if (viewportWidth >= ARCHIVE_CATALOG_XL_BREAKPOINT) {
    return 6;
  }

  if (viewportWidth >= ARCHIVE_CATALOG_MD_BREAKPOINT) {
    return 4;
  }

  return 3;
}

export function getArchiveCatalogPageSize(
  viewportWidth: number,
  rowCount = ARCHIVE_CATALOG_GRID_ROW_COUNT,
) {
  return getArchiveCatalogColumnCount(viewportWidth) * rowCount;
}

export function parseArchiveCatalogPageSize(value: string | null | undefined) {
  return parseArchiveListPageSize(value);
}
