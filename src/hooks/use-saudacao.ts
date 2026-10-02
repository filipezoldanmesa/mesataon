'use client';

import { useSyncExternalStore } from 'react';

import { horaEmBrasilia, saudacaoPorHora, type Saudacao } from '@/lib/saudacao';

/** Reavalia a cada minuto: a home costuma ficar aberta o dia inteiro. */
const INTERVALO_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const id = setInterval(onChange, INTERVALO_MS);
  return () => clearInterval(id);
}

function getSnapshot(): Saudacao {
  return saudacaoPorHora(new Date().getHours());
}

function getServerSnapshot(): Saudacao {
  return saudacaoPorHora(horaEmBrasilia(new Date()));
}

/**
 * "Bom dia" / "Boa tarde" / "Boa noite" pelo relógio de quem está usando.
 *
 * ⚠️ `useSyncExternalStore`, e não `new Date()` direto no render: o servidor
 * roda em UTC e o browser no fuso do usuário, então calcular no render daria
 * texto diferente entre SSR e hidratação (às 21h de Brasília o servidor
 * diria "Bom dia" para a meia-noite UTC). O servidor responde pelo fuso de
 * Brasília; na hidratação o React troca pelo valor do browser sem erro de
 * hidratação. O snapshot é a STRING (primitivo), então só re-renderiza
 * quando o período de fato muda.
 */
export function useSaudacao(): Saudacao {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
