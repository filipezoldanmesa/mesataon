/**
 * Data source for the user directory search. Always the real API via the BFF
 * (`/api/directory/users`) — the in-memory mock was removed as part of moving
 * all mock data to the backend (dev/test data comes from the backend's
 * seed-user directory). Components import from here; tests inject their own
 * function via prop.
 */
export {
  searchDirectory,
  searchLtCandidates,
  searchSnegAnalysts,
  searchCcobAnalysts,
  searchTeamCandidates,
  isTeamScopedRole,
} from './directory.api';
