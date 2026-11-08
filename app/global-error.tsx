"use client";

import { useEffect } from "react";
import { reportClientError } from "./_lib/report-client-error";

/**
 * What a player sees when a page cannot be rendered at all: in place of the root layout, so without its messages, in
 * both languages, in the game's colours, with a way back. Reports the error (reportClientError), unless the server
 * already did: an error with a digest is a server's, recorded by onRequestError.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (error.digest === undefined) {
      reportClientError("react", error);
    }
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0B1340",
          color: "#FFFFFF",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }} data-testid="global-error">
          <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem" }}>Une erreur est survenue.</p>
          <p lang="en" style={{ margin: "0 0 1.5rem", color: "#8FA0FF" }}>
            Something went wrong.
          </p>
          {/* A full load: the page's own code may be what failed. */}
          <button
            type="button"
            onClick={() => window.location.assign(window.location.origin)}
            style={{
              border: "none",
              cursor: "pointer",
              font: "inherit",
              display: "inline-block",
              minHeight: "2.75rem",
              lineHeight: "2.75rem",
              padding: "0 1.25rem",
              borderRadius: "14px",
              background: "#FF9F1C",
              color: "#0B1340",
              fontWeight: 700,
            }}
          >
            Accueil · Home
          </button>
        </main>
      </body>
    </html>
  );
}
