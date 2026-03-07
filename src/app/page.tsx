import Link from 'next/link';

export default function Home() {
  return (
    <section className="container mx-auto px-4 py-10 md:px-6 md:py-14">
      <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">CMSA</p>
        <h1 className="mt-2 text-3xl font-bold md:text-5xl">Portal Oficial</h1>
        <p className="mt-4 text-base text-muted-foreground md:text-lg">
          Bienvenido al portal principal. Desde aqui puedes acceder al sistema de turnos,
          buscador de libros y herramientas internas.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/clientes"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Agenda de Clientes
          </Link>
          <Link
            href="/turnos"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
          >
            Panel de Turnos
          </Link>
          <Link
            href="/pantalla-turnos"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
          >
            Pantalla de Turnos
          </Link>
          <Link
            href="/terminal-turnos"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
          >
            Terminal de Turnos
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
          >
            Ir a Busqueda de Libros
          </Link>
          <Link
            href="/cronometer"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
          >
            Ir a Cronometro
          </Link>
          <Link
            href="/documents"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
          >
            Gestion de Documentos
          </Link>
        </div>
      </div>
    </section>
  );
}
