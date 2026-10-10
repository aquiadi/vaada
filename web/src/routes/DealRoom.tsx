import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Navigate, useParams } from "react-router";
import { Button, ButtonLink, Notice, PageHeader, Waiting } from "../components/ui";
import { PublishedDeed } from "../deed/PublishedDeed";
import { deedNumber } from "../design/DeedSheet";
import { Seal } from "../design/Seal";
import { ApiError, api } from "../lib/api";
import type { Room } from "../lib/types";
import { MilestoneLedger } from "../room/MilestoneLedger";
import { MoneyAccount } from "../room/MoneyAccount";
import { Proposals } from "../room/Proposals";
import { Register } from "../room/Register";
import { RoomAction } from "../room/RoomAction";
import { VoiceUpdates } from "../room/VoiceUpdates";
import { dealStanding, firstName, otherParty, stillSettling } from "../room/words";

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6";

function Unavailable({ id, error, retry }: { id: string; error: Error; retry: () => void }) {
  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className={PAGE}>
        <PageHeader kicker="Deal room" title="Sign in to see this deal room" lede="A deal room opens only for the two people on the deed." />
        <ButtonLink to={`/login?next=/d/${id}`}>Sign in</ButtonLink>
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className={PAGE}>
        <PageHeader
          kicker="Deal room"
          title="This deal room isn’t here"
          lede="Either the link is wrong, or you’re signed in as someone who isn’t on this deed. A deal room opens only for its Maker and its Client."
        />
        <ButtonLink to="/deeds" tone="plain">
          Your deeds
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className={PAGE}>
      <Notice tone="error">{error instanceof ApiError ? error.message : "We couldn’t open this deal room. Try again in a moment."}</Notice>
      <Button tone="plain" className="mt-4" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

function RoomPage({ room, refresh }: { room: Room; refresh: () => Promise<unknown> }) {
  const captured = room.payment?.status === "captured";
  const [capturedBefore, setCapturedBefore] = useState(captured);
  const [stampNow, setStampNow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (captured !== capturedBefore) {
    setCapturedBefore(captured);
    if (captured) setStampNow(true);
  }

  const dealActions = room.actions.filter((a) => a.action !== "propose_cancellation");
  const cancelAction = room.actions.find((a) => a.action === "propose_cancellation");
  const organisation = room.agreement?.client.organisation;
  const client = organisation ? `${room.client.name} of ${organisation}` : room.client.name;
  const parties =
    room.role === "maker"
      ? `You are the Maker here, and ${client} is the Client.`
      : room.role === "client"
        ? `You are the Client here, and ${room.maker.name} is the Maker.`
        : `Between ${room.maker.name}, the Maker, and ${client}, the Client.`;
  const afterAction = async (message: string | null) => {
    setNotice(message);
    await refresh();
  };
  const contents: Array<[string, string]> = [
    ["#deed", "The deed"],
    ["#milestones", "The milestones"],
    ["#money", "The money"],
    ["#register", "The register"],
    ["#today", "What happened today"],
  ];

  return (
    <div className={PAGE}>
      <header>
        <p className="label m-0 mb-2">
          Deed No. <span className="figures">{deedNumber(room.deed_no)}</span> · Deal room
        </p>
        <h1 className="font-display text-h3 leading-tight text-ink sm:text-h2">{room.title}</h1>
        <p className="measure m-0 mt-3 text-lede text-ink-soft">{parties}</p>
        <p className="measure m-0 mt-4 text-body text-ink" aria-live="polite">
          <span className="label mr-2">Standing</span>
          {dealStanding(room)}
        </p>
      </header>

      {dealActions.length ? (
        <div className="no-print mt-6 flex flex-wrap items-start gap-3">
          {dealActions.map((a) => (
            <RoomAction key={a.action} action={a} room={room} onDone={afterAction} />
          ))}
        </div>
      ) : null}
      {notice ? <Notice className="mt-4">{notice}</Notice> : null}

      <Proposals room={room} refresh={refresh} />

      <nav aria-label="On this page" className="no-print mt-8 flex flex-wrap gap-x-5 gap-y-1 border-y hairline py-2">
        {contents.map(([href, label]) => (
          <a key={href} href={href} className="smallcaps text-ui text-ink-soft no-underline hover:text-ink hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <section id="deed" aria-label="The deed" className="mt-8 scroll-mt-6">
        {room.agreement && room.agreement_hash ? (
          <PublishedDeed
            agreement={room.agreement}
            hash={room.agreement_hash}
            struck={room.struck_clauses}
            accepted={room.accepted}
            registry={room.registry}
            seal={captured ? <Seal hash={room.agreement_hash} caption="Funded" animate={stampNow} /> : undefined}
          />
        ) : (
          <Notice tone="error">The frozen text of this deed couldn’t be loaded. Reload the page; if it stays missing, write to us.</Notice>
        )}
      </section>

      <div className="mt-14 grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <MilestoneLedger room={room} onChanged={refresh} />
          <MoneyAccount room={room} />
          {cancelAction ? (
            <div className="no-print mt-8 flex flex-col items-start gap-3">
              <p className="measure m-0 text-note text-ink-soft">
                If the work has to stop, either of you can propose cancelling what isn’t done yet. Nothing changes unless{" "}
                {firstName(otherParty(room))} agrees.
              </p>
              <RoomAction action={cancelAction} room={room} onDone={afterAction} />
            </div>
          ) : null}
        </div>
        <Register events={room.events} />
      </div>

      <div id="today" className="no-print mt-14 scroll-mt-6">
        <VoiceUpdates room={room} onChanged={() => void refresh()} />
      </div>
    </div>
  );
}

export default function DealRoom() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["room", id],
    queryFn: () => api.get<Room>(`/deals/${id}`),
    refetchInterval: (q) => (q.state.data && stillSettling(q.state.data) ? 4000 : false),
  });
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["room", id] }), [queryClient, id]);

  if (query.isPending) return <Waiting>Opening the deal room.</Waiting>;
  if (query.isError) return <Unavailable id={id} error={query.error} retry={() => void query.refetch()} />;
  if (query.data.status === "draft") return <Navigate to={`/new/${query.data.id}`} replace />;
  return <RoomPage room={query.data} refresh={refresh} />;
}
