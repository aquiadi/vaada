import { useConfig, type AppConfig } from "../lib/config";
import { Placeholder } from "./PolicySheet";

/** The owner's details from /config, so the policies can be completed without a code change; each is empty until set. */
export function usePublishedContact(): AppConfig["contact"] {
  const contact = useConfig().data?.contact;
  const text = (value: string | undefined) => value?.trim() ?? "";
  return {
    address: text(contact?.address),
    phone: text(contact?.phone),
    email: text(contact?.email),
    legal_entity: text(contact?.legal_entity),
    grievance_officer: text(contact?.grievance_officer),
    jurisdiction_city: text(contact?.jurisdiction_city),
  };
}

export function OwnerDetail({ value, missing }: { value: string; missing: string }) {
  return value ? <>{value}</> : <Placeholder>{missing}</Placeholder>;
}

export function LegalEntity() {
  return <OwnerDetail value={usePublishedContact().legal_entity} missing="Legal entity name to be added" />;
}
