import { Link, useLocation } from "react-router";
import { ButtonLink, DoubleRule, Mono } from "../components/ui";

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <article className="measure">
        <p className="label m-0 mb-2">Not found</p>
        <h1 className="font-display text-h2 leading-tight text-ink sm:text-h1">There is no page at this address.</h1>
        <p className="mt-4 mb-0 text-lede text-ink-soft">
          Nothing is filed under <Mono className="text-ink">{pathname}</Mono>. The link may be missing a character, or the page may have
          moved.
        </p>
        <DoubleRule className="my-8 max-w-48" />
        <p className="m-0 text-body text-ink">
          If someone sent you a deed, open the link in their message again; deed links are long and easy to clip when copied. Your own deeds
          are in your{" "}
          <Link to="/deeds" className="underline">
            index
          </Link>
          .
        </p>
        <p className="mt-8 mb-0">
          <ButtonLink to="/">Back to the first page</ButtonLink>
        </p>
      </article>
    </div>
  );
}
