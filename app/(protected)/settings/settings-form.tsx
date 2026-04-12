"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveProfile, type ProfileActionState } from "@/lib/actions/profile";
import {
  profileFormSchema,
  type ProfileFormInput,
} from "@/lib/validations/profile";

type Props = {
  defaultValues: ProfileFormInput;
};

const initialAction: ProfileActionState = {};

export function SettingsForm({ defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(
    saveProfile,
    initialAction,
  );
  const form = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
  });
  const toastShown = useRef(false);

  useEffect(() => {
    if (state.ok && !toastShown.current) {
      toastShown.current = true;
      toast.success("Zapisano profil");
    }
    if (state.error && !toastShown.current) {
      toastShown.current = true;
      toast.error(state.error);
    }
    if (!state.ok && !state.error) toastShown.current = false;
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>KSeF i firma</CardTitle>
        <CardDescription>
          NIP, nazwa i adres sprzedawcy (Podmiot1 w FA(3)), token KSeF oraz
          opcjonalna automatyczna wysyłka po wgraniu pliku.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("nip", values.nip);
            fd.set("ksef_token", values.ksef_token);
            fd.set("issuer_name", values.issuer_name);
            fd.set("issuer_address_line1", values.issuer_address_line1);
            fd.set("issuer_address_line2", values.issuer_address_line2 ?? "");
            fd.set("auto_send", values.auto_send ? "true" : "false");
            startTransition(() => {
              formAction(fd);
            });
          })}
        >
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="nip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NIP</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="issuer_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nazwa prawna sprzedawcy (Podmiot1)</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="organization" />
                  </FormControl>
                  <FormDescription>
                    W XML faktury jako wystawca; powinna zgadzać się z podmiotem
                    w KSeF.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="issuer_address_line1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adres — linia 1</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="street-address" />
                  </FormControl>
                  <FormDescription>
                    Ulica i numer (pole AdresL1 w FA(3)).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="issuer_address_line2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adres — linia 2 (opcjonalnie)</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="address-line2" />
                  </FormControl>
                  <FormDescription>
                    Kod pocztowy, miejscowość itd. (AdresL2).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ksef_token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>KSeF token</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" autoComplete="off" />
                  </FormControl>
                  <FormDescription>
                    Przechowywany w Supabase (RLS). W środowisku testowym użyj
                    tokenu testowego.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="auto_send"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Automatyczna wysyłka do KSeF
                    </FormLabel>
                    <FormDescription>
                      Włączone: wysyłka zaraz po poprawnym sparsowaniu PDF.
                      Wyłączone: najpierw weryfikacja na stronie faktury.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
