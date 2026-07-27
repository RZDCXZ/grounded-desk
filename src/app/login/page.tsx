import { getAdminEmail } from "@/lib/env";

import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <LoginForm
      adminEmail={getAdminEmail()}
      invalidLink={error === "invalid_magic_link"}
    />
  );
}
