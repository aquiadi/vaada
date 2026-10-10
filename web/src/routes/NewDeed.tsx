import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Notice, Waiting } from "../components/ui";
import { DeedEditor } from "../editor/DeedEditor";
import { ApiError, api } from "../lib/api";
import { useConfig } from "../lib/config";
import { useMe } from "../lib/session";
import type { Room } from "../lib/types";

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
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Couldn't start a draft. Try again."));
  }, [navigate]);
  return error ? (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Notice tone="error">{error}</Notice>
    </div>
  ) : (
    <Waiting>Laying out a fresh sheet.</Waiting>
  );
}

export default function NewDeed() {
  const { id } = useParams();
  const { data: me, isLoading: loadingMe } = useMe();
  const { data: config } = useConfig();
  const room = useQuery({ queryKey: ["deal", id], queryFn: () => api.get<Room>(`/deals/${id}`), enabled: !!id && !!me, staleTime: Infinity });

  if (loadingMe) return <Waiting />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(id ? `/new/${id}` : "/new")}`} replace />;
  if (!id) return <StartDraft />;
  if (room.error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <Notice tone="error">{room.error instanceof ApiError ? room.error.message : "Couldn't open this draft."}</Notice>
      </div>
    );
  }
  if (!room.data || !config) return <Waiting>Fetching the draft.</Waiting>;
  if (room.data.status !== "draft" || !room.data.draft) return <Navigate to={`/d/${id}`} replace />;
  return <DeedEditor key={room.data.id} room={room.data} config={config} />;
}
