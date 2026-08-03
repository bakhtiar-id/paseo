import { describe, expect, test } from "vitest";
import { isAbsolute } from "node:path";

import {
  checkoutFromPersistedWorkspacePlacement,
  deriveWorkspaceDisplayName,
  deriveWorkspaceKind,
  generateWorkspaceId,
  generateProjectId,
  initialWorkspacePlacement,
  reconcileWorkspacePlacement,
} from "./workspace-registry-model.js";
import { createPersistedWorkspaceRecord } from "./workspace-registry.js";

describe("opaque registry ids", () => {
  test("generates opaque project ids", () => {
    expect(generateProjectId()).toMatch(/^prj_[0-9a-f]{16}$/);
  });

  test("generates opaque workspace ids that are not filesystem paths", () => {
    const workspaceId = generateWorkspaceId();

    expect(workspaceId).toMatch(/^wks_[0-9a-f]+$/);
    expect(isAbsolute(workspaceId)).toBe(false);
  });
});

describe("workspace kind", () => {
  test("classifies plain git worktrees as workspaces of kind worktree", () => {
    expect(
      deriveWorkspaceKind({
        cwd: "/tmp/repo-feature",
        isGit: true,
        currentBranch: "feature/plain",
        remoteUrl: "https://github.com/acme/repo.git",
        worktreeRoot: "/tmp/repo-feature",
        isPaseoOwnedWorktree: false,
        mainRepoRoot: "/tmp/repo",
      }),
    ).toBe("worktree");
  });
});

describe("workspace display name", () => {
  test("derives the folder name for a regular checkout instead of the raw default branch", () => {
    expect(
      deriveWorkspaceDisplayName({
        cwd: "/projects/paseo",
        checkout: {
          cwd: "/projects/paseo",
          isGit: true,
          currentBranch: "master",
          remoteUrl: null,
          worktreeRoot: "/projects/paseo",
          isPaseoOwnedWorktree: false,
          mainRepoRoot: null,
        },
      }),
    ).toBe("paseo");
  });

  test("keeps the branch name for a worktree, where it names the line of work", () => {
    expect(
      deriveWorkspaceDisplayName({
        cwd: "/tmp/paseo-feature-login",
        checkout: {
          cwd: "/tmp/paseo-feature-login",
          isGit: true,
          currentBranch: "feature/login",
          remoteUrl: null,
          worktreeRoot: "/tmp/paseo-feature-login",
          isPaseoOwnedWorktree: false,
          mainRepoRoot: "/projects/paseo",
        },
      }),
    ).toBe("feature/login");
  });

  test("falls back to the folder name for a detached-HEAD worktree", () => {
    expect(
      deriveWorkspaceDisplayName({
        cwd: "/tmp/paseo-pr",
        checkout: {
          cwd: "/tmp/paseo-pr",
          isGit: true,
          currentBranch: "HEAD",
          remoteUrl: null,
          worktreeRoot: "/tmp/paseo-pr",
          isPaseoOwnedWorktree: false,
          mainRepoRoot: "/projects/paseo",
        },
      }),
    ).toBe("paseo-pr");
  });
});

describe("workspace placement", () => {
  test("defines checkout and created-worktree placement completely", () => {
    expect(
      initialWorkspacePlacement({
        source: "checkout",
        cwd: "/repo",
        checkout: {
          cwd: "/repo",
          isGit: true,
          currentBranch: " main ",
          remoteUrl: null,
          worktreeRoot: "/repo",
          isPaseoOwnedWorktree: false,
          mainRepoRoot: null,
        },
      }),
    ).toEqual({
      cwd: "/repo",
      kind: "local_checkout",
      displayName: "repo",
      branch: "main",
      worktreeRoot: "/repo",
      baseBranch: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
    });
    expect(
      initialWorkspacePlacement({
        source: "created_worktree",
        cwd: "/repo-feature/app",
        worktreeRoot: "/repo-feature",
        branch: "feature/placement",
        baseBranch: "main",
        mainRepoRoot: "/repo",
      }),
    ).toEqual({
      cwd: "/repo-feature/app",
      kind: "worktree",
      displayName: "feature/placement",
      branch: "feature/placement",
      worktreeRoot: "/repo-feature",
      baseBranch: "main",
      isPaseoOwnedWorktree: true,
      mainRepoRoot: "/repo",
    });
  });

  test("updates live placement while preserving its durable name and base branch", () => {
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: "workspace-one",
      projectId: "project-one",
      cwd: "/repo-feature",
      kind: "worktree",
      displayName: "Keep this name",
      branch: "old-branch",
      worktreeRoot: "/old-root",
      baseBranch: "release",
      isPaseoOwnedWorktree: true,
      mainRepoRoot: "/repo",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });

    const update = reconcileWorkspacePlacement({
      workspace,
      checkout: {
        cwd: workspace.cwd,
        isGit: true,
        currentBranch: "renamed-branch",
        remoteUrl: null,
        worktreeRoot: "/repo-feature",
        isPaseoOwnedWorktree: false,
        mainRepoRoot: "/repo",
      },
      updatedAt: "2026-03-02T00:00:00.000Z",
    });

    expect(update?.fields).toEqual({
      branch: "renamed-branch",
      worktreeRoot: "/repo-feature",
      isPaseoOwnedWorktree: false,
    });
    expect(update?.workspace).toMatchObject({
      displayName: "Keep this name",
      baseBranch: "release",
      branch: "renamed-branch",
    });
  });

  test("projects persisted placement to the wire checkout", () => {
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: "workspace-one",
      projectId: "project-one",
      cwd: "/repo-feature/app",
      kind: "worktree",
      displayName: "feature",
      branch: "feature",
      worktreeRoot: "/repo-feature",
      isPaseoOwnedWorktree: true,
      mainRepoRoot: "/repo",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });

    expect(checkoutFromPersistedWorkspacePlacement({ workspace })).toEqual({
      cwd: "/repo-feature/app",
      isGit: true,
      currentBranch: "feature",
      remoteUrl: null,
      worktreeRoot: "/repo-feature",
      isPaseoOwnedWorktree: true,
      mainRepoRoot: "/repo",
    });
  });
});
