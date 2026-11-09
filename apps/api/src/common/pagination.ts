import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}

export const pageSize = (q: PageQueryDto): number => q.limit ?? 25;

/**
 * Cursor pagination over time-ordered UUIDv7 ids. Fetch `limit + 1` rows, pass them here.
 * `direction` is the sort order of the query (asc: next page has id > cursor).
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, meta: { nextCursor: hasMore ? data[data.length - 1]!.id : null } };
}

export const cursorWhere = (cursor: string | undefined, direction: 'asc' | 'desc') =>
  cursor ? { id: direction === 'asc' ? { gt: cursor } : { lt: cursor } } : {};
