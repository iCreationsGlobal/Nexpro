import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export function Logo({ light = false }: { light?: boolean } = {}) {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/sabito-icon.png"
        alt=""
        className="h-8 w-8 rounded-lg object-contain"
      />
      <span className={light ? "text-white" : "text-brand-900"}>{SITE_NAME}</span>
    </Link>
  );
}
