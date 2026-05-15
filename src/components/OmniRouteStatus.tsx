export function OmniRouteStatus({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-[28px] border border-rose-400/20 bg-[linear-gradient(180deg,rgba(70,20,26,0.34),rgba(29,11,15,0.8))] p-5 text-sm shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
      <div className="text-base font-semibold text-rose-100">OmniRoute unreachable</div>
      <p className="mt-2 leading-6 text-rose-50/80">{error}</p>
      <p className="mt-3 leading-6 text-rose-50/75">
        Check that OmniRoute is running on{" "}
        <code className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-white">
          {process.env.OMNIROUTE_URL || "http://localhost:20128"}
        </code>{" "}
        and that <code className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-white">
          OMNIROUTE_TOKEN
        </code>{" "}
        in <code className="rounded-full border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-white">.env.local</code>{" "}
        is a valid management API key.
      </p>
    </div>
  );
}
