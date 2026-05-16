export type BootstrapPromptInput = {
  owner: string;
  repo: string;
  branch: string;
  commands: string[];
};

export function buildCloudAgentPrompt(input: BootstrapPromptInput): string {
  return [
    "Use this Devin account as the next cloud agent for the shared repo.",
    "If this session supports model choice or switching, prefer Opus 4.7. If unavailable, use Max or Xite, then Opus 4.6.",
    "Do not search the web for the repository first. Use the git bootstrap commands below as the source of truth for repo access.",
    "",
        `Clone ${input.owner}/${input.repo} and continue from the shared git state.`,
    "",
    ...input.commands,
    "pwd",
    "git remote -v",
    "ls",
    "",
    "Then read these files in order:",
    "AGENTS.md",
    "README.md",
    "docs/cloud-agent-operating-model.md",
    "docs/handoffs/LATEST.md",
    "",
    "After cloning, confirm that the repository is available locally before doing anything else.",
    "After reading the docs, continue the current task from the latest handoff and current branch state. Do not start from scratch and do not rely on an old VM state.",
  ].join("\n");
}

export function buildRepoAttachPrompt(input: BootstrapPromptInput): string {
  return [
    `Prepare this Devin session for ${input.owner}/${input.repo}.`,
    "If this session supports model choice or switching, prefer Opus 4.7. If unavailable, use Max or Xite, then Opus 4.6.",
    "Do not search the web. Do not start implementation work. Do not open PRs. Do not edit project files unless clone/setup itself requires it.",
    "",
    `Clone ${input.owner}/${input.repo} and stop after confirming that the repository is available locally.`,
    "",
    ...input.commands,
    "pwd",
    "git remote -v",
    "git branch --show-current",
    "ls",
    "",
    "After the clone succeeds, reply with one short confirmation that the repository is available locally and then wait for the next instruction.",
    "Do not read additional project docs yet. Do not continue the task yet.",
  ].join("\n");
}
