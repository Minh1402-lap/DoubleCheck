"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteReport({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (response.ok) router.replace("/");
    else setBusy(false);
  }

  return <button className="button secondary" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete report"}</button>;
}
