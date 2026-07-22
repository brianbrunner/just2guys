import { createContext } from "react-router";

export interface CloudflareRequestContext {
  env: Env;
  ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareRequestContext>();
