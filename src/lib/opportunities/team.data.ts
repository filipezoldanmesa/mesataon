/**
 * Data source for opportunity team operations. Always the real API via the BFF
 * — the in-memory mock was removed as part of moving all mock data to the
 * backend. Components import from here; tests inject their own functions via
 * props/hooks.
 */
export {
  getTeam,
  addMember,
  removeMember,
  changePrincipal,
} from './team.api';
