import { createRequestHandler, RouterContextProvider } from "react-router";

import { cloudflareContext } from "../server/context";
import { runScheduledSync } from "../server/sync/scheduled";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledSync(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
