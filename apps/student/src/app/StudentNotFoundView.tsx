const notFoundCopy = {
  en: {
    title: "Page not found",
    description:
      "This address does not belong to a student learning page.",
    action: "Back to My Learning",
  },
  es: {
    title: "Página no encontrada",
    description:
      "Esta dirección no corresponde a una página de aprendizaje para estudiantes.",
    action: "Volver a Mi aprendizaje",
  },
  fr: {
    title: "Page introuvable",
    description:
      "Cette adresse ne correspond pas à une page d’apprentissage étudiant.",
    action: "Retour à Mon apprentissage",
  },
  ht: {
    title: "Paj la pa jwenn",
    description:
      "Adrès sa a pa koresponn ak yon paj aprantisaj pou elèv.",
    action: "Retounen nan Aprantisaj mwen",
  },
} as const;

export function StudentNotFoundView(props: {
  locale: string;
  path: string;
}) {
  const copy =
    notFoundCopy[
      props.locale as keyof typeof notFoundCopy
    ] ?? notFoundCopy.en;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="ui-surface-floating w-full max-w-xl p-6 text-center sm:p-8">
        <p className="ui-kicker">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/65">
          {copy.description}
        </p>
        <p className="mt-2 break-all text-xs text-neutral-500 dark:text-white/45">
          {props.path}
        </p>
        <div className="mt-6 flex justify-center">
          <a
            className="ui-btn-primary"
            href={`/${props.locale}/subjects`}
          >
            {copy.action}
          </a>
        </div>
      </section>
    </main>
  );
}
