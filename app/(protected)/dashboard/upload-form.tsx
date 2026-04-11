"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadInvoice, type UploadInvoiceState } from "@/lib/actions/invoices";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Processing…" : "Upload & parse"}
    </Button>
  );
}

const initial: UploadInvoiceState = {};

export function DashboardUpload({ disabled }: { disabled: boolean }) {
  const [state, formAction] = useActionState(uploadInvoice, initial);
  const shown = useRef(false);

  useEffect(() => {
    if (state.error && !shown.current) {
      shown.current = true;
      toast.error(state.error);
    }
    if (!state.error) shown.current = false;
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <input
        type="file"
        name="file"
        accept="application/pdf,.pdf"
        required
        disabled={disabled}
        className="text-muted-foreground block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium"
      />
      <SubmitButton disabled={disabled} />
    </form>
  );
}
