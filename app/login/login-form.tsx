"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
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
import { toast } from "sonner";
import { loginSchema, signupSchema, type LoginInput } from "@/lib/validations/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(mode === "login" ? loginSchema : signupSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { error: signErr } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      toast.success("Sprawdź skrzynkę e-mail, aby potwierdzić konto.");
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (signInErr) {
      setError(signInErr.message);
      return;
    }
    router.push(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = createClient();
    const { error: oAuthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oAuthErr) setError(oAuthErr.message);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>KSeF — faktury</CardTitle>
        <CardDescription>
          {mode === "login" ? "Zaloguj się e-mailem" : "Załóż konto"}
        </CardDescription>
      </CardHeader>
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
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hasło</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete={
                        mode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-3 mt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {mode === "login" ? "Zaloguj się" : "Zarejestruj się"}
            </Button>
            <div className="hidden">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={signInWithGoogle}
              >
                Kontynuuj z Google
              </Button>
            </div>
            <button
              type="button"
              className="text-muted-foreground text-sm underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                form.clearErrors();
              }}
            >
              {mode === "login"
                ? "Nie masz konta? Zarejestruj się"
                : "Masz już konto? Zaloguj się"}
            </button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
