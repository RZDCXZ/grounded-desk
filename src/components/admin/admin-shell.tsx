import { AdminNavigationClient } from "@/components/admin/admin-navigation-client";

type AdminShellProps = {
  children: React.ReactNode;
  organizationName: string;
  administratorEmail: string;
};

export function AdminShell({
  children,
  organizationName,
  administratorEmail,
}: AdminShellProps) {
  return (
    <div className="min-h-screen lg:pl-58">
      <AdminNavigationClient
        administratorEmail={administratorEmail}
        organizationName={organizationName}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
