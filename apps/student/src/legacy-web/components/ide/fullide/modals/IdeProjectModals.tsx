"use client";

import DeleteModal from "../DeleteModal";

import ProjectNameModal from "@/components/code/projects/ProjectNameModal";
import ProjectsDrawer from "@/components/code/projects/ProjectsDrawer";
import SaveBeforeSwitchModal from "@/components/code/projects/SaveBeforeSwitchModal";

export default function IdeProjectModals({
  showDeleteModal = true,
  showProjects = true,
  showSaveAs = true,
  showRename = true,
  nodes,
  pendingDeleteId,
  onCancelDelete,
  onConfirmDelete,
  projectsOpen,
  onProjectsOpenChange,
  projectId,
  headerProjectTitle,
  language,
  canCreateProjects,
  loadingProjects,
  projectsError,
  projects,
  onRefreshProjects,
  onSelectProject,
  onCreateBlankProject,
  onSaveAsIntent,
  onRenameIntent,
  onArchiveProject,
  confirmSwitchOpen,
  isSavingProject,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancelSwitch,
  saveAsOpen,
  saveAsInitialValue,
  onSaveAsConfirm,
  onSaveAsCancel,
  renameOpen,
  projectModalBusy,
  renameInitialValue,
  onRenameConfirm,
  onRenameCancel,
}: any) {
  return (
    <>
      {showDeleteModal && pendingDeleteId ? (
        <DeleteModal
          nodes={nodes}
          pendingDeleteId={pendingDeleteId}
          onCancel={onCancelDelete}
          onDelete={onConfirmDelete}
        />
      ) : null}

      {showProjects ? (
        <ProjectsDrawer
          open={projectsOpen}
          onOpenChange={onProjectsOpenChange}
          currentProjectId={projectId}
          currentProjectTitle={headerProjectTitle}
          currentLanguage={language}
          canCreateProjects={canCreateProjects}
          loading={loadingProjects}
          error={projectsError}
          projects={projects}
          onRefresh={onRefreshProjects}
          onSelectProject={onSelectProject}
          onCreateBlankProject={onCreateBlankProject}
          onSaveAsProject={onSaveAsIntent}
          onRenameProject={onRenameIntent}
          onArchiveProject={onArchiveProject}
        />
      ) : null}

      <SaveBeforeSwitchModal
        open={confirmSwitchOpen}
        busy={isSavingProject}
        onSaveAndContinue={onSaveAndContinue}
        onDiscardAndContinue={onDiscardAndContinue}
        onCancel={onCancelSwitch}
      />

      {showSaveAs ? (
        <ProjectNameModal
          open={saveAsOpen}
          busy={isSavingProject}
          title="Save as new project"
          description="Create a new saved project from your current local workspace."
          confirmLabel="Save As"
          initialValue={saveAsInitialValue}
          onConfirm={onSaveAsConfirm}
          onCancel={onSaveAsCancel}
        />
      ) : null}

      {showRename ? (
        <ProjectNameModal
          open={renameOpen}
          busy={projectModalBusy}
          title="Rename project"
          description="Update the saved project name."
          confirmLabel="Rename"
          initialValue={renameInitialValue}
          onConfirm={onRenameConfirm}
          onCancel={onRenameCancel}
        />
      ) : null}
    </>
  );
}
