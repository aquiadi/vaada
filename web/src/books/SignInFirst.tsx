import { ButtonLink, PageHeader } from "../components/ui";

export function SignInFirst({ kicker, title, lede, next }: { kicker: string; title: string; lede: string; next: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader kicker={kicker} title={title} lede={lede} />
      <ButtonLink to={`/login?next=${encodeURIComponent(next)}`}>Sign in</ButtonLink>
    </div>
  );
}
