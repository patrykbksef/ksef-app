"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  acceptLegalDocuments,
  type AcceptLegalActionState,
} from "@/lib/actions/legal";
import { LEGAL_DOCS_VERSION } from "@/lib/legal/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState } from "react";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={disabled || pending}>
      {pending ? "Zapisywanie…" : "Akceptuję i kontynuuję"}
    </Button>
  );
}

const initialState: AcceptLegalActionState = {};

export function AcceptLegalForm() {
  const [state, formAction] = useActionState(acceptLegalDocuments, initialState);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptDpa, setAcceptDpa] = useState(false);

  const allAccepted = acceptTerms && acceptPrivacy && acceptDpa;

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Akceptacja dokumentów</CardTitle>
        <CardDescription>
          Aby korzystać z aplikacji, zaakceptuj Regulamin, Politykę prywatności
          oraz Umowę powierzenia przetwarzania danych osobowych (wersja{" "}
          {LEGAL_DOCS_VERSION}).
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}

          <input type="hidden" name="acceptTerms" value={acceptTerms ? "true" : "false"} />
          <input type="hidden" name="acceptPrivacy" value={acceptPrivacy ? "true" : "false"} />
          <input type="hidden" name="acceptDpa" value={acceptDpa ? "true" : "false"} />

          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-terms"
              checked={acceptTerms}
              onCheckedChange={(c) => setAcceptTerms(c)}
            />
            <Label htmlFor="accept-terms" className="leading-snug font-normal">
              Akceptuję{" "}
              <Link
                href="/regulamin"
                target="_blank"
                className="underline underline-offset-2"
              >
                Regulamin
              </Link>
            </Label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-privacy"
              checked={acceptPrivacy}
              onCheckedChange={(c) => setAcceptPrivacy(c)}
            />
            <Label htmlFor="accept-privacy" className="leading-snug font-normal">
              Akceptuję{" "}
              <Link
                href="/polityka-prywatnosci"
                target="_blank"
                className="underline underline-offset-2"
              >
                Politykę prywatności
              </Link>
            </Label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-dpa"
              checked={acceptDpa}
              onCheckedChange={(c) => setAcceptDpa(c)}
            />
            <Label htmlFor="accept-dpa" className="leading-snug font-normal">
              Zawieram{" "}
              <Link
                href="/umowa-powierzenia"
                target="_blank"
                className="underline underline-offset-2"
              >
                Umowę powierzenia przetwarzania danych osobowych
              </Link>
            </Label>
          </div>
        </CardContent>
        <CardFooter className="mt-4">
          <SubmitButton disabled={!allAccepted} />
        </CardFooter>
      </form>
    </Card>
  );
}
