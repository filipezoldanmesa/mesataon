"use client";

import { useEffect, useState } from "react";

import { MockProfilePicker } from "@/components/auth/mock-profile-picker";
import { Button } from "@/components/button";
import { VibraLogo } from "@/components/vibra-logo";
import { useAuth } from "@/hooks/use-auth";
import { saveNextPath } from "@/lib/auth-next-path";

export default function LoginPage() {
  // No session on the login screen — skip the /me lookup, keep only the action.
  const { login } = useAuth({ loadUser: false });
  // Access profile chosen in the temporary mock login. `null` with real SSO
  // configured (the picker renders nothing and the key is never sent).
  const [profileKey, setProfileKey] = useState<string | null>(null);

  // Persist `?next=` so the OAuth callback can return the user to the page the
  // expired session interrupted. Only same-origin paths are kept (CWE-601):
  // a full or protocol-relative URL is silently dropped.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    // `saveNextPath` valida e so grava o que for caminho interno.
    if (next) saveNextPath(next);
  }, []);

  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -10%, var(--primary-400), transparent 60%), linear-gradient(160deg, var(--primary-700) 0%, var(--primary-600) 45%, var(--neutral-900) 100%)",
      }}
    >
      <div className="w-full max-w-110 rounded-md border border-white/60 bg-white px-10 pt-11 pb-7 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <VibraLogo className="mx-auto mb-5.5 h-11 w-auto text-(--primary-500)" />

        <h1 className="text-(length:--t-h2) font-bold leading-tight tracking-[-0.4px] text-(--neutral-900)">
          Gestor de Oportunidades
        </h1>
        <p className="mb-4.5 text-(length:--t-caption) text-(--color-text-muted)">
          Use sua conta corporativa Vibra para acessar
        </p>

        <MockProfilePicker value={profileKey} onChange={setProfileKey} />

        <Button onClick={() => login(profileKey ?? undefined)}>
          Entrar com SSO
        </Button>

        {/* SEAM (to be wired): access-help destination still to be defined. */}
        <a
          href="#"
          className="mt-4.5 mb-1 inline-block text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          Precisa de ajuda com o acesso?
        </a>

        <p className="mt-5.5 text-(length:--t-small) text-(--color-text-muted)">
          © {new Date().getFullYear()} Vibra Energia · Mesa
        </p>
      </div>
    </main>
  );
}
