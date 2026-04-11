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
      toast.success("Profile saved");
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
        <CardTitle>KSeF & company</CardTitle>
        <CardDescription>
          NIP, seller name and address (Podmiot1 in FA(3)), KSeF token, and
          optional auto-send after upload.
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
                  <FormLabel>Seller legal name (Podmiot1)</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="organization" />
                  </FormControl>
                  <FormDescription>
                    Shown on the invoice XML as the issuer; must match your
                    entity for KSeF.
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
                  <FormLabel>Address line 1</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="street-address" />
                  </FormControl>
                  <FormDescription>
                    Street and number (maps to AdresL1 in FA(3)).
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
                  <FormLabel>Address line 2 (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="address-line2" />
                  </FormControl>
                  <FormDescription>
                    City, postal code, etc. (AdresL2).
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
                    Stored in your Supabase project (RLS). Use a test-environment
                    token for sandbox.
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
                    <FormLabel className="text-base">Auto-send to KSeF</FormLabel>
                    <FormDescription>
                      When on, the app sends to KSeF immediately after a
                      successful PDF parse. When off, you review on the invoice
                      page first.
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
              {isPending ? "Saving…" : "Save"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
