import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/member/AuthForms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPage() {
  return (
    <div className="container-x mx-auto max-w-md py-10 sm:py-14">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Reset your password</h1>
      <p className="mb-6 mt-1.5 text-sm leading-relaxed text-muted">
        Enter your username, one of the recovery codes you saved at sign-up, and a new password. Lost your codes too? The account cannot be recovered without them; you can <Link href="/signup" className="text-accent underline underline-offset-2">create a new account</Link>.
      </p>
      <ResetForm />
    </div>
  );
}
