"use client";

import { useEffect } from "react";
import { reportClientError } from "../_lib/report-client-error";

/**
 * Listens to the page's uncaught errors and unhandled rejections and reports them to the server
 * (reportClientError): mounted once, in the root layout, on every page. Renders nothing.
 */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError("error", event.error ?? event.message, event.filename);
    const onRejection = (event: PromiseRejectionEvent) => reportClientError("rejection", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
