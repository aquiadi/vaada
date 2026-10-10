import "./styles/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { lazy, StrictMode, Suspense, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Shell } from "./app/Shell";
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

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: page(() => import("./routes/Home")) },
      { path: "/login", element: page(() => import("./routes/Login")) },
      { path: "/payouts", element: page(() => import("./routes/Payouts")) },
      { path: "/new", element: page(() => import("./routes/NewDeed")) },
      { path: "/new/:id", element: page(() => import("./routes/NewDeed")) },
      { path: "/deeds", element: page(() => import("./routes/Deeds")) },
      { path: "/d/:id", element: page(() => import("./routes/DealRoom")) },
      { path: "/a/:slug", element: page(() => import("./routes/ClientDeed")) },
      { path: "/ledger", element: page(() => import("./routes/Ledger")) },
      { path: "/m/:handle", element: page(() => import("./routes/Maker")) },
      { path: "/admin", element: page(() => import("./routes/Admin")) },
      { path: "/legal/:doc", element: page(() => import("./routes/Legal")) },
      { path: "/pricing", element: page(() => import("./routes/Legal")) },
      { path: "/styleguide", element: page(() => import("./routes/Styleguide")) },
      { path: "/dev/outbox", element: page(() => import("./routes/DevOutbox")) },
      { path: "*", element: page(() => import("./routes/NotFound")) },
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
