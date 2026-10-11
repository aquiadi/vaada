import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { personaSession, setPersonaSession, supabase } from "./auth";
import type { Me } from "./types";

/** Bumps whenever the person signed in changes: a persona switch, a Supabase sign-in, a sign-out. */
export function useAuthVersion(): number {
  const [version, setVersion] = useState(0);
  const client = useQueryClient();
  useEffect(() => {
    const bump = () => {
      setVersion((v) => v + 1);
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "config" });
    };
    window.addEventListener("vaada:auth", bump);
    let unsubscribe: (() => void) | undefined;
    void supabase().then((sb) => {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") bump();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      window.removeEventListener("vaada:auth", bump);
      unsubscribe?.();
    };
  }, [client]);
  return version;
}

/** The signed-in person, or null when nobody is. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api.get<Me>("/me");
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error;
        // An expired persona token would otherwise be sent with every request from now on.
        if (error.status === 401 && personaSession()) setPersonaSession(null);
        return null;
      }
    },
    staleTime: 15_000,
  });
}
