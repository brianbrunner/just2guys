import type { RouterContextProvider } from "react-router";

import { cloudflareContext } from "../../server/context";

export function getRequestEnv(context: Readonly<RouterContextProvider>) {
  return context.get(cloudflareContext).env;
}
