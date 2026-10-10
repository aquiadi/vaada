import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, Notice } from "../components/ui";
import { ApiError, api, download } from "../lib/api";
import { signOut } from "../lib/auth";
import { useMe } from "../lib/session";

const SIGN_IN_HERE = `/login?next=${encodeURIComponent("/legal/privacy#your-data")}`;

function DeletionEffect() {
  return (
    <div className="space-y-3">
      <p>
        Your email address, phone number, name and handle are removed, your maker id is unlinked from you, and your unsent drafts and
        dictations are deleted. You are signed out. This can’t be undone.
      </p>
      <p className="text-note text-ink-soft">
        What stays: deeds you sent or accepted, exactly as they were written; the record of each acceptance; and the ledger and
        payment records the law makes us keep. If money is still held on any of your deeds, nothing is deleted.
      </p>
    </div>
  );
}

/** The two things a signed-in person can do about their data without writing to us. */
export function YourData() {
  const me = useMe();
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (me.isPending) return <p className="italic text-ink-soft">Checking whether you’re signed in.</p>;
  if (me.isError) {
    return <Notice tone="error">We couldn’t check whether you’re signed in. Reload the page in a moment to try again.</Notice>;
  }
  if (!me.data) {
    return (
      <p>
        <Link to={SIGN_IN_HERE}>Sign in</Link> to download everything we hold about you, or to delete your account.
      </p>
    );
  }

  async function exportData() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await download("/me/export", "vaada-export.json");
    } catch (error) {
      console.warn("export download failed", error);
      setDownloadError(error instanceof ApiError ? error.message : "That download didn’t work. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function deleteAccount() {
    await api.delete("/me");
    try {
      await signOut();
    } catch (error) {
      console.warn("sign-out after account deletion failed", error);
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="space-y-4">
      {me.data.email ? (
        <p>
          You are signed in as <span className="break-all">{me.data.email}</span>.
        </p>
      ) : null}
      <div className="no-print flex flex-wrap gap-3">
        <Button tone="plain" busy={downloading} onClick={() => void exportData()}>
          Download everything we hold about you
        </Button>
        <ConfirmDialog
          trigger={<Button tone="danger">Delete my account</Button>}
          title="Delete your account"
          effect={<DeletionEffect />}
          confirmLabel="Delete my account"
          tone="danger"
          onConfirm={deleteAccount}
        />
      </div>
      {downloadError ? <Notice tone="error">{downloadError}</Notice> : null}
      <p className="text-note text-ink-soft">The download is a JSON file: your profile, deeds, acceptances, ledger, register and dictations.</p>
    </div>
  );
}
