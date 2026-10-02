/**
 * Data module for the picklist catalog. Components import from HERE, never from
 * `picklists.api.ts` directly — the indirection is what lets a test inject a
 * stub without stubbing `fetch`.
 */
export { getPicklistOptions } from './picklists.api';
