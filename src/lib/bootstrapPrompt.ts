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
    `pwd`,
    `git remote -v`,
    `ls`,
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
