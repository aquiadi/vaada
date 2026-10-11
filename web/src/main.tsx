import "./styles/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { lazy, StrictMode, Suspense, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Shell, type RouteHandle } from "./app/Shell";
import { Waiting } from "./components/ui";
import { ApiError } from "./lib/api";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0 });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function page(load: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(load);
  return (
    <Suspense fallback={<Waiting />}>
      <Component />
    </Suspense>
  );
}

const named = (title: string): RouteHandle => ({ title });

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: page(() => import("./routes/Home")) },
      { path: "/login", element: page(() => import("./routes/Login")), handle: named("Sign in") },
      { path: "/payouts", element: page(() => import("./routes/Payouts")), handle: named("Payouts") },
      { path: "/new", element: page(() => import("./routes/NewDeed")), handle: named("New deed") },
      { path: "/new/:id", element: page(() => import("./routes/NewDeed")), handle: named("New deed") },
      { path: "/deeds", element: page(() => import("./routes/Deeds")), handle: named("Your deeds") },
      { path: "/d/:id", element: page(() => import("./routes/DealRoom")), handle: named("Deal room") },
      { path: "/a/:slug", element: page(() => import("./routes/ClientDeed")), handle: named("A deed") },
      { path: "/ledger", element: page(() => import("./routes/Ledger")), handle: named("Your ledger") },
      { path: "/m/:handle", element: page(() => import("./routes/Maker")), handle: named("Certificate") },
      { path: "/admin", element: page(() => import("./routes/Admin")), handle: named("The desk") },
      { path: "/legal/:doc", element: page(() => import("./routes/Legal")), handle: named("Policies") },
      { path: "/pricing", element: page(() => import("./routes/Legal")), handle: named("Pricing") },
      { path: "/styleguide", element: page(() => import("./routes/Styleguide")), handle: named("Styleguide") },
      { path: "/dev/outbox", element: page(() => import("./routes/DevOutbox")), handle: named("Outbox") },
      { path: "*", element: page(() => import("./routes/NotFound")), handle: named("Not found") },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
