import { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm outline-none focus:border-[var(--sabito-teal)] focus:bg-white",
        className
      )}
      {...props}
    />
  );
}
