"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  sendInvoiceToKsef,
  type SendInvoiceState,
} from "@/lib/actions/invoices";

function Submit({
  disabled,
  title,
}: {
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      size="lg"
      title={title}
    >
      {pending ? "Wysyłanie…" : "Wyślij do KSeF (test)"}
    </Button>
  );
}

const initial: SendInvoiceState = {};

export function SendToKsefForm({
  invoiceId,
  canSend,
  sendDisabled,
  sendDisabledReason,
}: {
  invoiceId: string;
  canSend: boolean;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(sendInvoiceToKsef, initial);
  const shown = useRef(false);

  useEffect(() => {
    if (state.ok && !shown.current) {
      shown.current = true;
      toast.success("Faktura wysłana do KSeF");
      router.refresh();
    }
    if (state.error && !shown.current) {
      shown.current = true;
      toast.error(state.error);
    }
    if (!state.ok && !state.error) shown.current = false;
  }, [state, router]);

  if (!canSend) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Submit disabled={sendDisabled} title={sendDisabledReason} />
    </form>
  );
}
