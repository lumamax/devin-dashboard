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
    "",
    `Clone ${input.owner}/${input.repo} and continue from the shared git state.`,
    "",
    ...input.commands,
    "",
    "Then read these files in order:",
    "AGENTS.md",
    "README.md",
    "docs/cloud-agent-operating-model.md",
    "docs/handoffs/LATEST.md",
    "",
    "After reading them, continue the current task from the latest handoff and current branch state. Do not start from scratch and do not rely on an old VM state.",
  ].join("\n");
}
