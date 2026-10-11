import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button, Notice, Waiting } from "../components/ui";
import { DeedEditor } from "../editor/DeedEditor";
import { api } from "../lib/api";
import { useConfig } from "../lib/config";
import { explain } from "../lib/errors";
import { useMe } from "../lib/session";
import type { Room } from "../lib/types";

function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <title>New deed · Vaada</title>
      {children}
    </>
  );
}

function Trouble({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Page>
      <div className="mx-auto max-w-xl px-4 py-16">
        <Notice tone="error">{message}</Notice>
        {retry ? (
          <Button tone="plain" className="mt-4" onClick={retry}>
            Try again
          </Button>
        ) : null}
      </div>
    </Page>
  );
}

function StartDraft() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post<Room>("/deals")
      .then((room) => navigate(`/new/${room.id}`, { replace: true }))
      .catch((caught: unknown) => setError(explain(caught, "Couldn't start a draft. Reload the page to try again.")));
  }, [navigate]);
  return error ? (
    <Trouble message={error} />
  ) : (
    <Page>
      <Waiting>Laying out a fresh sheet.</Waiting>
    </Page>
  );
}

export default function NewDeed() {
  const { id } = useParams();
  const me = useMe();
  const { data: config } = useConfig();
  const room = useQuery({
    queryKey: ["deal", id],
    queryFn: () => api.get<Room>(`/deals/${id}`),
    enabled: !!id && !!me.data,
    // The editor takes its draft and version once, when it mounts, so it always mounts from the server's copy:
    // a cached one would undo edits made since and send a version the server has moved past.
    gcTime: 0,
  });

  if (me.isPending) {
    return (
      <Page>
        <Waiting />
      </Page>
    );
  }
  if (!me.data) {
    if (me.isError) {
      return <Trouble message={explain(me.error, "We couldn't check who's signed in just now.")} retry={() => void me.refetch()} />;
    }
    return <Navigate to={`/login?next=${encodeURIComponent(id ? `/new/${id}` : "/new")}`} replace />;
  }
  if (!id) return <StartDraft />;
  if (room.error) return <Trouble message={explain(room.error, "Couldn't open this draft.")} retry={() => void room.refetch()} />;
  if (!room.data || !config) {
    return (
      <Page>
        <Waiting>Fetching the draft.</Waiting>
      </Page>
    );
  }
  if (room.data.status !== "draft" || !room.data.draft) return <Navigate to={`/d/${id}`} replace />;
  return <DeedEditor key={room.data.id} room={room.data} config={config} />;
}
