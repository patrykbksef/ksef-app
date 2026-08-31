"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CircleCheck,
  CircleX,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Landmark,
  LoaderCircle,
  PlugZap,
  Save,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  testKsefConnection,
  type KsefConnectionTestActionState,
} from "@/lib/actions/ksef-connection";
import { saveProfile, type ProfileActionState } from "@/lib/actions/profile";
import {
  KSEF_WEB_APP_URL,
  type KsefEnvironment,
} from "@/lib/ksef/config";
import { cn } from "@/lib/utils";
import {
  profileFormSchema,
  type ProfileFormInput,
} from "@/lib/validations/profile";

type Props = {
  defaultValues: ProfileFormInput;
};

const initialAction: ProfileActionState = {};
type ConnectionTestState = KsefConnectionTestActionState & {
  fingerprint: string;
};

const KSEF_USER_GUIDE_URL =
  "https://ksef.podatki.gov.pl/media/20shej34/aplikacja-podatnika-ksef-20-podrecznik-uzytkownika_01042026.pdf";

function ConnectionTestResult({
  result,
}: {
  result: ConnectionTestState | null;
}) {
  if (!result) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        result.ok
          ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {result.ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CircleX className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{result.message}</span>
    </div>
  );
}

export function SettingsForm({ defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(
    saveProfile,
    initialAction,
  );
  const form = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
  });
  const activeKsefEnv = useWatch({
    control: form.control,
    name: "ksef_environment",
  });
  const nip = useWatch({ control: form.control, name: "nip" });
  const demoToken = useWatch({
    control: form.control,
    name: "ksef_token_demo",
  });
  const productionToken = useWatch({
    control: form.control,
    name: "ksef_token_production",
  });
  const [connectionTests, setConnectionTests] = useState<
    Record<KsefEnvironment, ConnectionTestState | null>
  >({ demo: null, production: null });
  const [testingEnvironment, setTestingEnvironment] =
    useState<KsefEnvironment | null>(null);
  const [isTestingConnection, startConnectionTestTransition] = useTransition();
  const toastShown = useRef(false);
  const connectionFingerprints: Record<KsefEnvironment, string> = {
    demo: `demo:${nip}:${demoToken}`,
    production: `production:${nip}:${productionToken}`,
  };
  const visibleConnectionTests: Record<
    KsefEnvironment,
    ConnectionTestState | null
  > = {
    demo:
      connectionTests.demo?.fingerprint === connectionFingerprints.demo
        ? connectionTests.demo
        : null,
    production:
      connectionTests.production?.fingerprint ===
      connectionFingerprints.production
        ? connectionTests.production
        : null,
  };

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

  function handleConnectionTest(environment: KsefEnvironment) {
    const token = environment === "production" ? productionToken : demoToken;
    const fingerprintAtStart = connectionFingerprints[environment];
    const fd = new FormData();
    fd.set("nip", nip);
    fd.set("ksef_environment", environment);
    fd.set("ksef_token", token);
    setConnectionTests((current) => ({ ...current, [environment]: null }));
    setTestingEnvironment(environment);

    startConnectionTestTransition(async () => {
      let result: KsefConnectionTestActionState;
      try {
        result = await testKsefConnection(fd);
      } catch {
        result = {
          ok: false,
          message: "Nie udało się uruchomić testu połączenia. Spróbuj ponownie.",
        };
      }

      setConnectionTests((current) => ({
        ...current,
        [environment]: { ...result, fingerprint: fingerprintAtStart },
      }));
      setTestingEnvironment(null);
    });
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/5" />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Settings2 className="size-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Ustawienia KSeF
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed md:text-base">
                Skonfiguruj dane firmy, dostęp do KSeF i sposób wysyłania
                faktur.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "h-8 gap-2 self-start px-3 sm:self-center",
              activeKsefEnv === "production"
                ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                : "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                activeKsefEnv === "production" ? "bg-amber-500" : "bg-sky-500",
              )}
            />
            {activeKsefEnv === "production" ? "Produkcja PRD" : "Demo TR"}
          </Badge>
        </div>
      </section>

      <Form {...form}>
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("nip", values.nip);
            fd.set("ksef_token_demo", values.ksef_token_demo);
            fd.set("ksef_token_production", values.ksef_token_production);
            fd.set("ksef_environment", values.ksef_environment);
            fd.set("issuer_name", values.issuer_name);
            fd.set("issuer_address_line1", values.issuer_address_line1);
            fd.set("issuer_address_line2", values.issuer_address_line2 ?? "");
            fd.set("auto_send", values.auto_send ? "true" : "false");
            startTransition(() => {
              formAction(fd);
            });
          })}
        >
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/25">
              <div className="flex items-start gap-3">
                <Badge className="mt-0.5 size-7 rounded-full p-0">1</Badge>
                <div>
                  <CardTitle className="text-lg">Środowisko pracy</CardTitle>
                  <CardDescription className="mt-1">
                    Wybierz, dokąd aplikacja będzie wysyłała faktury.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 md:p-6">
              <FormField
                control={form.control}
                name="ksef_environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Środowisko KSeF</FormLabel>
                    <FormControl>
                      <div
                        role="radiogroup"
                        aria-label="Środowisko KSeF"
                        className="grid gap-3 md:grid-cols-2"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={field.value === "demo"}
                          onClick={() => field.onChange("demo")}
                          className={cn(
                            "group flex min-h-32 items-start gap-4 rounded-xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            field.value === "demo"
                              ? "border-sky-500/70 bg-sky-500/8 shadow-sm"
                              : "border-border bg-background hover:border-sky-500/30",
                          )}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
                            <FlaskConical className="size-5" />
                          </span>
                          <span className="space-y-1">
                            <span className="flex items-center gap-2 font-semibold">
                              Demo
                              <Badge variant="secondary">TR</Badge>
                            </span>
                            <span className="text-muted-foreground block text-sm leading-relaxed">
                              Bezpieczne testy na fikcyjnych danych, bez skutków
                              prawnych.
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={field.value === "production"}
                          onClick={() => field.onChange("production")}
                          className={cn(
                            "group flex min-h-32 items-start gap-4 rounded-xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            field.value === "production"
                              ? "border-amber-500/70 bg-amber-500/8 shadow-sm"
                              : "border-border bg-background hover:border-amber-500/30",
                          )}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            <Landmark className="size-5" />
                          </span>
                          <span className="space-y-1">
                            <span className="flex items-center gap-2 font-semibold">
                              Produkcja
                              <Badge variant="secondary">PRD</Badge>
                            </span>
                            <span className="text-muted-foreground block text-sm leading-relaxed">
                              Rzeczywista wysyłka do KSeF z pełnymi skutkami
                              prawnymi.
                            </span>
                          </span>
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/25">
              <div className="flex items-start gap-3">
                <Badge className="mt-0.5 size-7 rounded-full p-0">2</Badge>
                <div>
                  <CardTitle className="text-lg">Dane firmy</CardTitle>
                  <CardDescription className="mt-1">
                    Dane sprzedawcy zapisywane w fakturze FA(3) jako Podmiot1.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
              <FormField
                control={form.control}
                name="nip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIP firmy</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        inputMode="numeric"
                        className="font-mono"
                      />
                    </FormControl>
                    <FormDescription>
                      Musi odpowiadać kontekstowi tokenu KSeF.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="issuer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa prawna firmy</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="organization" />
                    </FormControl>
                    <FormDescription>
                      Pełna nazwa wystawcy widoczna w KSeF.
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
                    <FormLabel>Ulica i numer</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="street-address" />
                    </FormControl>
                    <FormDescription>Pole AdresL1 w FA(3).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="issuer_address_line2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kod pocztowy i miejscowość</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="address-line2" />
                    </FormControl>
                    <FormDescription>
                      Opcjonalne pole AdresL2 w FA(3).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/25">
              <div className="flex items-start gap-3">
                <Badge className="mt-0.5 size-7 rounded-full p-0">3</Badge>
                <div>
                  <CardTitle className="text-lg">Tokeny i połączenie</CardTitle>
                  <CardDescription className="mt-1">
                    Tokeny są niezależne. Możesz przetestować oba bez zmiany
                    aktywnego środowiska.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 lg:grid-cols-2 md:p-6">
              <FormField
                control={form.control}
                name="ksef_token_demo"
                render={({ field }) => (
                  <FormItem
                    className={cn(
                      "rounded-xl border-2 bg-background p-4 transition-all",
                      activeKsefEnv === "demo"
                        ? "border-sky-500/60 shadow-sm"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
                          <FlaskConical className="size-4" />
                        </span>
                        <div>
                          <FormLabel>Token DEMO</FormLabel>
                          <p className="text-muted-foreground text-xs">Środowisko TR</p>
                        </div>
                      </div>
                      {activeKsefEnv === "demo" ? (
                        <Badge className="bg-sky-600">Aktywny</Badge>
                      ) : null}
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="off"
                        className="font-mono"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isTestingConnection || isPending}
                      onClick={() => handleConnectionTest("demo")}
                      className="w-full"
                    >
                      {testingEnvironment === "demo" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <PlugZap />
                      )}
                      {testingEnvironment === "demo" ? "Testowanie…" : "Testuj DEMO"}
                    </Button>
                    <FormDescription>
                      Sprawdza NIP, token i uprawnienie InvoiceWrite. Nie wysyła
                      faktury.
                    </FormDescription>
                    <FormMessage />
                    <ConnectionTestResult result={visibleConnectionTests.demo} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ksef_token_production"
                render={({ field }) => (
                  <FormItem
                    className={cn(
                      "rounded-xl border-2 bg-background p-4 transition-all",
                      activeKsefEnv === "production"
                        ? "border-amber-500/60 shadow-sm"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          <Landmark className="size-4" />
                        </span>
                        <div>
                          <FormLabel>Token produkcyjny</FormLabel>
                          <p className="text-muted-foreground text-xs">Środowisko PRD</p>
                        </div>
                      </div>
                      {activeKsefEnv === "production" ? (
                        <Badge className="bg-amber-600">Aktywny</Badge>
                      ) : null}
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="off"
                        className="font-mono"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isTestingConnection || isPending}
                      onClick={() => handleConnectionTest("production")}
                      className="w-full"
                    >
                      {testingEnvironment === "production" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <PlugZap />
                      )}
                      {testingEnvironment === "production"
                        ? "Testowanie…"
                        : "Testuj PRD"}
                    </Button>
                    <FormDescription>
                      Sprawdza NIP, token i uprawnienie InvoiceWrite. Nie wysyła
                      faktury.
                    </FormDescription>
                    <FormMessage />
                    <ConnectionTestResult
                      result={visibleConnectionTests.production}
                    />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <details className="group overflow-hidden rounded-xl border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 marker:hidden md:p-6">
              <span className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">Jak uzyskać token KSeF?</span>
                  <span className="text-muted-foreground mt-0.5 block text-sm font-normal">
                    Pełna instrukcja krok po kroku
                  </span>
                </span>
              </span>
              <span className="text-muted-foreground text-xl transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="border-t bg-muted/15 px-5 py-6 text-sm leading-relaxed md:px-6">
              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                <Button asChild variant="outline" className="justify-start">
                  <a href={KSEF_WEB_APP_URL.demo} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Otwórz KSeF DEMO
                  </a>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <a
                    href={KSEF_WEB_APP_URL.production}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink /> Otwórz KSeF produkcyjny
                  </a>
                </Button>
              </div>
              <ol className="grid gap-4 md:grid-cols-2">
                {[
                  "Otwórz właściwą aplikację. DEMO służy wyłącznie do testów na fikcyjnych danych.",
                  "Zaloguj się i wybierz kontekst firmy o tym samym NIP-ie co w ustawieniach.",
                  "W menu wybierz Tokeny, a następnie Generuj token.",
                  "Nadaj tokenowi czytelną nazwę, np. Integracja PDF do KSeF — DEMO.",
                  "Zaznacz uprawnienie Wystawianie faktur (InvoiceWrite).",
                  "Wygeneruj token i od razu skopiuj cały ciąg do bezpiecznego miejsca.",
                  "Wklej go do odpowiedniego pola i uruchom test połączenia.",
                  "Wybierz środowisko do normalnej pracy i zapisz ustawienia.",
                ].map((instruction, index) => (
                  <li key={instruction} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
                <ShieldCheck className="mt-0.5 size-5 shrink-0" />
                <p>
                  Token jest sekretem. Nie wysyłaj go e-mailem ani na czacie i
                  nie umieszczaj na zrzutach ekranu. Token DEMO nie działa w
                  produkcji i odwrotnie.
                </p>
              </div>
              <p className="text-muted-foreground mt-4">
                Tokeny można wykorzystywać do 31 grudnia 2026 r. Zobacz{" "}
                <a
                  href={KSEF_USER_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  oficjalny podręcznik KSeF 2.0
                </a>
                .
              </p>
            </div>
          </details>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/25">
              <div className="flex items-start gap-3">
                <Badge className="mt-0.5 size-7 rounded-full p-0">4</Badge>
                <div>
                  <CardTitle className="text-lg">Sposób wysyłania</CardTitle>
                  <CardDescription className="mt-1">
                    Zdecyduj, czy faktury mają wymagać zatwierdzenia.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 md:p-6">
              <FormField
                control={form.control}
                name="auto_send"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-5 rounded-xl border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Send className="size-5" />
                      </span>
                      <div>
                        <FormLabel className="text-base">Automatyczna wysyłka</FormLabel>
                        <FormDescription className="mt-1 leading-relaxed">
                          {field.value
                            ? "Faktura zostanie wysłana od razu po poprawnym odczytaniu."
                            : "Najpierw sprawdzisz i zatwierdzisz odczytane dane faktury."}
                        </FormDescription>
                      </div>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-between md:px-6">
              <p className="text-muted-foreground text-center text-xs sm:text-left">
                Test połączenia nie zapisuje zmian w profilu.
              </p>
              <Button
                type="submit"
                disabled={isPending || isTestingConnection}
                className="w-full sm:w-auto sm:min-w-36"
              >
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Save />
                )}
                {isPending ? "Zapisywanie…" : "Zapisz ustawienia"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
