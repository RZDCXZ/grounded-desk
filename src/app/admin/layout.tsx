import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdministrator } from "@/lib/auth/require-admin";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, organization } = await requireAdministrator();

  return (
    <AdminShell
      administratorEmail={user.email ?? "管理员"}
      organizationName={organization.name}
    >
      {children}
    </AdminShell>
  );
}
