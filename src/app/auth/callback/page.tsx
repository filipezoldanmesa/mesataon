'use client';

import { useEffect, useRef, useState } from 'react';

import { completeSsoLogin } from '@/lib/auth';
import { consumeNextPath } from '@/lib/auth-next-path';
import { withBasePath } from '@/lib/base-path';
import { redirecionarNoApp } from '@/lib/navegacao-segura';

export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invocation in dev.
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      setFailed(true);
      return;
    }

    // The OAuth `state` parameter carries the mock-profile key when
    // ACCESS_PROFILE_SOURCE=mock with real Entra auth (VBR-463). Entra
    // forwards `state` unchanged — it is not a secret (it's a profile key) and
    // is only trusted by the mock access-profile provider, which refuses to
    // construct in production.
    const mockProfileHint = params.get('state') ?? undefined;

    completeSsoLogin(code, mockProfileHint)
      .then(() => {
        // Return to the page the expired session interrupted, when the login
        // page saved one. Already validated as same-origin before storing.
        redirecionarNoApp(consumeNextPath() ?? '/', { substituir: true });
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      {failed ? (
        <div className="space-y-3">
          <p className="text-(--color-text-muted)">
            Não foi possível concluir o login.
          </p>
          <a
            href={withBasePath('/login')}
            className="font-semibold text-(--secondary-600) hover:underline"
          >
            Voltar ao login
          </a>
        </div>
      ) : (
        <p className="text-(--color-text-muted)">Concluindo o login…</p>
      )}
    </main>
  );
}
