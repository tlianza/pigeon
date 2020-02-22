export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  withScope
} from "@sentry/core";

import { initAndBind } from "@sentry/core";

type InitOpts = Parameters<typeof initAndBind>[1] & { event: FetchEvent };

export function init(opts: InitOpts): void;
export function flush(timeout?: number): Promise<void>;
export function close(timeout?: number): Promise<void>;
