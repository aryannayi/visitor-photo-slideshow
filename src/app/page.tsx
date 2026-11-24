"use client";

import { useState } from "react";

interface UploadResponse {
  success: boolean;
  isReturningVisitor?: boolean;
  visitor?: {
    id: string;
    name: string;
    contact: string;
    createdAt: string;
  };
  queuedPhotosCount?: number;
  error?: string;
}

export default function Home() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("contact", contact);
      formData.append("consent", consent ? "true" : "false");

      if (files) {
        Array.from(files).forEach((file) => {
          formData.append("photos", file);
        });
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "600px" }}>
      <h1>Backend Test Form: Visitor Photo Upload</h1>
      <p style={{ color: "#666" }}>
        Minimal test interface to verify <code>/api/upload</code>, SQLite persistence, and returning visitor logic.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
        <div>
          <label style={{ display: "block", fontWeight: "bold" }}>Visitor Name:</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontWeight: "bold" }}>Contact (Email or Phone):</label>
          <input
            type="text"
            required
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="john@example.com or +1 555-123-4567"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>I give consent for my photos to be displayed (consent = true)</span>
          </label>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: "bold" }}>Upload Photos (1 to 3 images, JPEG/PNG/WebP, max 5MB each):</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            style={{ marginTop: "0.5rem" }}
          />
          {files && (
            <p style={{ fontSize: "0.85rem", color: "#555" }}>
              Selected {files.length} file(s)
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.75rem",
            backgroundColor: loading ? "#999" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: "bold",
          }}
        >
          {loading ? "Uploading..." : "Submit to /api/upload"}
        </button>
      </form>

      {result && (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem",
            backgroundColor: result.success ? "#e6f4ea" : "#fce8e6",
            border: `1px solid ${result.success ? "#137333" : "#c5221f"}`,
            borderRadius: "6px",
          }}
        >
          <h3>Response Status: {result.success ? "Success (201)" : "Failed"}</h3>
          {result.error && <p style={{ color: "#c5221f" }}><strong>Error:</strong> {result.error}</p>}
          {result.success && (
            <div>
              <p>
                <strong>Returning Visitor:</strong> {result.isReturningVisitor ? "Yes" : "No (New Visitor)"}
              </p>
              <p>
                <strong>Queued Photos Count:</strong> {result.queuedPhotosCount}
              </p>
              <pre style={{ backgroundColor: "#fff", padding: "0.5rem", borderRadius: "4px", overflowX: "auto" }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
