import type { Metadata } from "next";

/**
 * Impressum — server-rendered legal page (§5 DDG / §18 Abs. 2 MStV). The shared
 * Header/Footer come from the root layout, so this page only supplies the
 * content card. Linked from the footer's Impressum link.
 *
 * Provider details (name / address / e-mail) are read from server-side
 * IMPRESSUM_* env vars so personal data stays OUT of the (public) repository.
 * `force-dynamic` makes them resolve at request time from the running
 * container's environment (set IMPRESSUM_* in .env for the live deployment),
 * not baked in at build time.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Impressum – Wetterchatty",
  description: "Impressum und Anbieterkennzeichnung für Wetterchatty.",
};

const provider = {
  name: process.env.IMPRESSUM_NAME ?? "[Name – in .env setzen]",
  street: process.env.IMPRESSUM_STREET ?? "[Straße & Hausnummer]",
  city: process.env.IMPRESSUM_CITY ?? "[PLZ Ort]",
  email: process.env.IMPRESSUM_EMAIL ?? "kontakt@example.com",
};

export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <article className="rounded-2xl border border-black/5 bg-white/80 px-6 py-8 shadow-sm backdrop-blur sm:px-8 dark:border-white/10 dark:bg-slate-900/60">
        <h1 className="text-2xl font-bold tracking-tight text-brand-ink dark:text-slate-100">
          Impressum
        </h1>

        <section className="mt-6 space-y-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <h2 className="text-base font-semibold text-brand-ink dark:text-slate-100">
            Angaben gemäß § 5 DDG
          </h2>
          <p>{provider.name}</p>
          <p>{provider.street}</p>
          <p>{provider.city}</p>
        </section>

        <section className="mt-6 space-y-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <h2 className="text-base font-semibold text-brand-ink dark:text-slate-100">
            Kontakt
          </h2>
          <p>
            E-Mail:{" "}
            <a
              href={`mailto:${provider.email}`}
              className="font-medium text-brand-blue underline-offset-2 hover:underline dark:text-sky-300"
            >
              {provider.email}
            </a>
          </p>
        </section>

        <section className="mt-6 space-y-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <h2 className="text-base font-semibold text-brand-ink dark:text-slate-100">
            Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
          </h2>
          <p>{provider.name} (Anschrift wie oben)</p>
        </section>
      </article>
    </main>
  );
}
