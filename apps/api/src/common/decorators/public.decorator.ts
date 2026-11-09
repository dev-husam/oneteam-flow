import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without an access token. Everything else requires one (deny by default). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
