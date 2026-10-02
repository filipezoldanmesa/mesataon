/** Payload of the backend `GET /v1/auth/login-options`. */
export type BackendLoginOptions = {
  mockEnabled: boolean;
  /**
   * `true` when ACCESS_PROFILE_SOURCE=mock — roles come from the picker even
   * when the identity is real (transitional state while ISC/groups are not yet
   * available, VBR-463).
   */
  mockProfileEnabled: boolean;
  profiles: {
    key: string;
    label: string;
    description: string;
    entraGroup: string;
    roles: string[];
    userName: string;
  }[];
};

/** A profile the login screen may offer while the access-profile provider is mocked. */
export type MockLoginProfile = {
  /**
   * Sent back as the OAuth `code` (mock auth) or as `mockProfileHint` alongside
   * the real Entra code (real auth + mock profile) — the shape is identical.
   */
  key: string;
  label: string;
  description: string;
  entraGroup: string;
  roles: string[];
  userName: string;
};

export type LoginOptions = {
  /** Backend owns the mock decision; the UI only reacts to these flags. */
  mockEnabled: boolean;
  /**
   * `true` when the access profile (roles) still comes from the mock picker,
   * even if the identity is real (Entra configured). When `true` and
   * `mockEnabled` is `false`, the picker is shown alongside the real SSO button
   * so the user can select which profile to assume.
   */
  mockProfileEnabled: boolean;
  profiles: MockLoginProfile[];
};

/**
 * Map the backend payload to the frontend type. Explicit (no passthrough) so a
 * renamed field breaks here, in a test, instead of silently rendering an empty
 * profile picker — see CLAUDE.md, "BFF nunca faz passthrough cru".
 *
 * Defensive on shape rather than on content: an unreachable/older backend that
 * omits `profiles` yields "no mock", which is the safe reading (the login screen
 * just shows the plain SSO button).
 */
export function mapLoginOptions(payload: BackendLoginOptions): LoginOptions {
  const profiles = (payload.profiles ?? []).map((profile) => ({
    key: profile.key,
    label: profile.label,
    description: profile.description,
    entraGroup: profile.entraGroup,
    roles: profile.roles ?? [],
    userName: profile.userName,
  }));

  return {
    mockEnabled: payload.mockEnabled === true,
    mockProfileEnabled: payload.mockProfileEnabled === true,
    profiles,
  };
}
