import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminPage } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-4">
        <div>
          <span className="eyebrow">Admin Console</span>
          <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">관리자</h1>
        </div>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
