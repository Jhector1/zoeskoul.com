import CurriculumDraftEditor from "./drafts/CurriculumDraftEditor";

export function CurriculumDraftsPage() {
  return (
    <section className="page-stack curriculum-admin-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Curriculum</p>
          <h1>Curriculum editor</h1>
          <p className="page-description">
            Create and edit canonical course content. Filesystem writes,
            validation, compilation, and preview execution remain authoritative
            Web server operations.
          </p>
        </div>
      </header>

      <div className="curriculum-editor-host">
        <CurriculumDraftEditor />
      </div>
    </section>
  );
}
