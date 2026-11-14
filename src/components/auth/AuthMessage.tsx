export function AuthMessage({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  return tone === "error"
    ? <p role="alert" className="mb-4 rounded-[12px] bg-[#fdecec] px-3 py-2.5 text-[12px] font-semibold text-[#c03a3a]">{children}</p>
    : <p role="status" className="mb-4 rounded-[12px] bg-tint px-3 py-2.5 text-[12px] font-semibold text-primary-2">{children}</p>;
}
