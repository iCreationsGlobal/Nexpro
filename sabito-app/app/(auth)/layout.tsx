import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-100">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Logo />
        <div className="mt-6 w-full max-w-md rounded-2xl border border-brand-200 bg-white p-6">
          {children}
        </div>
      </div>
      <div className="h-2 bg-[var(--sabito-teal)]" />
    </div>
  );
}
