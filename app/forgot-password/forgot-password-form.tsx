"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  passwordResetRequestSchema,
  type PasswordResetRequestInput,
} from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: PasswordResetRequestInput) {
    setError(null);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", "/reset-password");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      values.email,
      { redirectTo: callbackUrl.toString() },
    );

    if (resetError) {
      setError(
        resetError.status === 429
          ? "Wysłano zbyt wiele próśb. Poczekaj chwilę i spróbuj ponownie."
          : "Nie udało się wysłać wiadomości. Spróbuj ponownie później.",
      );
      return;
    }

    setSent(true);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Reset hasła</CardTitle>
        <CardDescription>
          Podaj adres e-mail konta. Wyślemy link do ustawienia nowego hasła.
        </CardDescription>
      </CardHeader>
      {sent ? (
        <>
          <CardContent className="space-y-3">
            <p className="font-medium">Sprawdź skrzynkę e-mail</p>
            <p className="text-muted-foreground text-sm">
              Jeśli konto istnieje, wiadomość z linkiem do zmiany hasła została wysłana.
              Sprawdź również folder spam.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Wróć do logowania</Link>
            </Button>
          </CardFooter>
        </>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="jan@firma.pl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="mt-4 flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Wysyłanie…" : "Wyślij link do zmiany hasła"}
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">Wróć do logowania</Link>
              </Button>
            </CardFooter>
          </form>
        </Form>
      )}
    </Card>
  );
}
