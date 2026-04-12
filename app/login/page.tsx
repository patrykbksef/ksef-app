import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="text-muted-foreground text-sm">Ładowanie…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
