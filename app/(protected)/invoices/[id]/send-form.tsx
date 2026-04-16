"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ksefQueryKeys } from "@/lib/query-keys";
import {
  sendInvoiceToKsef,
  type SendInvoiceState,
} from "@/lib/actions/invoices";
import type { KsefEnvironment } from "@/lib/ksef/config";

function Submit({
  disabled,
  title,
  ksefEnvironment,
}: {
  disabled?: boolean;
  title?: string;
  ksefEnvironment: KsefEnvironment;
}) {
  const { pending } = useFormStatus();
  const sendLabel =
    ksefEnvironment === "demo"
      ? "Wyślij do KSeF (test)"
      : "Wyślij do KSeF";
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      size="lg"
      title={title}
    >
      {pending ? "Wysyłanie…" : sendLabel}
    </Button>
  );
}

const initial: SendInvoiceState = {};

export function SendToKsefForm({
  invoiceId,
  canSend,
  sendDisabled,
  sendDisabledReason,
  ksefEnvironment,
}: {
  invoiceId: string;
  canSend: boolean;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  ksefEnvironment: KsefEnvironment;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, formAction] = useActionState(sendInvoiceToKsef, initial);
  const shown = useRef(false);

  useEffect(() => {
    if (state.ok && !shown.current) {
      shown.current = true;
      toast.success("Faktura wysłana do KSeF");
      void queryClient.invalidateQueries({ queryKey: ksefQueryKeys.recentInvoices });
      router.refresh();
    }
    if (state.error && !shown.current) {
      shown.current = true;
      toast.error(state.error);
    }
    if (!state.ok && !state.error) shown.current = false;
  }, [state, router, queryClient]);

  if (!canSend) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Submit
        disabled={sendDisabled}
        title={sendDisabledReason}
        ksefEnvironment={ksefEnvironment}
      />
    </form>
  );
}
