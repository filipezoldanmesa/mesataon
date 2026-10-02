'use client';

import { useEffect, useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Select } from '@/components/ui/select';
import { fetchLoginOptions } from '@/lib/auth';
import type { LoginOptions, MockLoginProfile } from '@/lib/auth-login-options-mapping';

type MockProfilePickerProps = {
  /** Selected profile key (`null` until the options resolve). */
  value: string | null;
  onChange: (profileKey: string) => void;
  /** Injectable for tests; defaults to the BFF call. */
  loadOptions?: () => Promise<LoginOptions>;
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; profiles: MockLoginProfile[]; authMocked: boolean }
  | { status: 'unavailable' };

/**
 * Access-profile selector shown on the login screen when the access-profile
 * provider is mock (`GET /api/auth/login-options` → `mockProfileEnabled`).
 *
 * Two modes:
 * - **Auth + profile mocked** (`mockEnabled && mockProfileEnabled`): the chosen
 *   key travels as the OAuth `code`; the identity is fake. Login screen only.
 * - **Auth real, profile mocked** (`!mockEnabled && mockProfileEnabled`): auth
 *   goes to the real Entra ID; the chosen key travels as OAuth `state` and is
 *   forwarded as `mockProfileHint` in `POST /v1/auth/login`. This is the
 *   transitional state while ISC/groups are not yet available in the tenant
 *   (VBR-463).
 *
 * The decision is the backend's — this component renders nothing when both
 * flags are off (production), when the profile list is empty, or when the
 * lookup fails. Removing this component is deleting it, not reworking auth.
 */
export function MockProfilePicker({
  value,
  onChange,
  loadOptions = fetchLoginOptions,
}: MockProfilePickerProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    loadOptions()
      .then((options) => {
        if (!active) return;

        // Either axis mocked shows the picker: with auth mocked the key IS the
        // OAuth code (even when the profile source is real, e.g. entra-groups
        // locally — the mock identity carries the chosen profile's group); with
        // profile mocked the key travels as OAuth `state` → `mockProfileHint`.
        const anyMock = options.mockEnabled || options.mockProfileEnabled;
        if (!anyMock || options.profiles.length === 0) {
          setState({ status: 'unavailable' });
          return;
        }

        setState({
          status: 'ready',
          profiles: options.profiles,
          authMocked: options.mockEnabled,
        });
        onChange(options.profiles[0].key);
      })
      .catch(() => {
        if (active) setState({ status: 'unavailable' });
      });

    return () => {
      active = false;
    };
    // `onChange`/`loadOptions` are stable for the lifetime of the screen; the
    // lookup must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="mb-4 flex justify-center">
        <Spinner size="sm" label="Carregando perfis de acesso…" />
      </div>
    );
  }

  if (state.status === 'unavailable') return null;

  const selected =
    state.profiles.find((profile) => profile.key === value) ?? state.profiles[0];

  return (
    <div className="mb-4 text-left" data-testid="mock-profile-picker">
      <label
        htmlFor="mock-profile"
        className="block text-(length:--t-caption) font-bold text-(--neutral-800)"
      >
        Perfil de acesso
      </label>

      <Select
        id="mock-profile"
        value={selected.key}
        onChange={(v) => onChange(v)}
        options={state.profiles.map((profile) => ({
          value: profile.key,
          label: state.authMocked
            ? `${profile.label} · ${profile.userName}`
            : profile.label,
        }))}
        variant="boxed"
        className="mt-1"
      />

      <p className="mt-1.5 text-(length:--t-small) text-(--color-text-muted)">
        {selected.description}
      </p>
      <p className="mt-1 text-(length:--t-small) text-(--color-text-muted)">
        {state.authMocked
          ? `Grupo ${selected.entraGroup} · login temporário enquanto as credenciais do Entra ID não estão disponíveis.`
          : `Grupo ${selected.entraGroup} · perfil de acesso temporário enquanto os grupos do Entra ID não estão configurados.`}
      </p>
    </div>
  );
}
