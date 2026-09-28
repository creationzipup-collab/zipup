import { AdminNav } from "@/components/admin/admin-nav";
import { PageTitle } from "@/components/brand/page-title";
import { requireAdminPage } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-4">
        <PageTitle label="Admin" title="관리자" />
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
