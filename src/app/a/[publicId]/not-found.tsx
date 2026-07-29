import { BrandMark } from "@/components/admin/brand-mark";

export default function PublicAssistantNotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="w-full max-w-md rounded-xl border border-line bg-card p-8 text-center">
        <BrandMark className="justify-center" />
        <h1 className="mt-8 text-xl font-semibold text-forest-950">
          公开入口不可用
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-600">
          该助手当前不可公开访问。
        </p>
      </section>
    </main>
  );
}
