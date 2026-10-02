/**
 * The reference this platform addresses a customer by — **Código SAP when the
 * account has one, the CRM record id when it does not** (a prospect,
 * ADR-0055). The backend resolves both, in that order.
 *
 * Exists because the screens used `client.sapCode` directly, which is `""` for
 * a prospect: the "Cliente recebedor" picker then committed an empty value and
 * the receiver silently fell back to the customer.
 */
export function customerReference(client: { id: string; sapCode: string }): string {
  return client.sapCode.trim() || client.id.trim();
}

/**
 * On-screen label of a picked customer: `<name> · SAP <code>` — or just the
 * name for a prospect, whose CRM id is a machine value and not a SAP code.
 */
export function customerReferenceLabel(client: { name: string; sapCode: string }): string {
  const sap = client.sapCode.trim();
  return sap ? `${client.name} · SAP ${sap}` : client.name;
}

/**
 * The customer's Código SAP from a backend opportunity row: the backend's
 * verdict (`clienteCodigoSap`, `null` for a prospect). A backend older than
 * that field does not send it — then the reference is used, which was the
 * previous behaviour (and is right for every registered customer).
 */
export function sapCodeFromBackend(row: {
  customerId: string | null;
  clienteCodigoSap?: string | null;
}): string | null {
  if (row.clienteCodigoSap !== undefined) return row.clienteCodigoSap;
  return row.customerId?.trim() || null;
}

/**
 * What a screen may print after "SAP": the resolved Código SAP, or `null` when
 * the customer has none (prospect). `clientId` is the REFERENCE — a prospect's
 * is the CRM id, which is not a SAP code. `clientSapCode` absent (a fixture or
 * payload that predates it) falls back to `clientId`.
 */
export function shownSapCode(o: { clientId: string; clientSapCode?: string | null }): string | null {
  if (o.clientSapCode !== undefined) return o.clientSapCode;
  return o.clientId.trim() || null;
}

/**
 * The "SAP <code>" tag of a customer line — `Prospect` when there is no code
 * (ADR-0055), instead of a dangling "SAP " followed by nothing.
 */
export function sapOrProspect(sapCode: string | null | undefined): string {
  const sap = sapCode?.trim();
  return sap ? `SAP ${sap}` : 'Prospect';
}

/**
 * "Cliente (SAP + Razão Social)" — `<code> · <name>`, or the name alone for a
 * prospect, whose reference (CRM id) is not a SAP code.
 */
export function sapAndName(o: {
  clientId: string;
  clientSapCode?: string | null;
  clientName: string;
}): string {
  const sap = shownSapCode(o);
  return sap ? `${sap} · ${o.clientName}` : o.clientName;
}
