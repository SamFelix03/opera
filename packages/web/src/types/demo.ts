export type DemoRole =
  | "owner"
  | "energyOp"
  | "maintOp"
  | "replacement"
  | "investor"
  | "regulator";

export type DemoRoleWallet = {
  role: DemoRole;
  address: string;
  label?: string;
  customerId?: string | null;
  funded?: boolean;
};

export type DemoStepName =
  | "setupIdentities"
  | "setupAsset"
  | "fundAndStake"
  | "normalOps"
  | "sanctionsEvent"
  | "replacementAcquire"
  | "regulatorExport";

export type DemoStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type DemoEvent = {
  id?: number | string;
  kind: string;
  step?: string | null;
  message?: string;
  payload?: unknown;
  createdAt?: string;
  ts?: string;
};

export type DemoRun = {
  id?: string;
  runId?: string;
  status?: string;
  currentStep?: string | null;
  roles?: DemoRoleWallet[] | Record<string, DemoRoleWallet | string>;
  assetId?: number | string | null;
  energyLorId?: number | string | null;
  maintLorId?: number | string | null;
  energyMandateId?: number | string | null;
  maintMandateId?: number | string | null;
  lorIds?: Record<string, number | string>;
  mandateIds?: Record<string, number | string>;
  settlementToken?: string | null;
  settlementMode?: string | null;
  exportPath?: string | null;
  steps?:
    | Array<{ step: string; status: DemoStepStatus | string; error?: string | null }>
    | Record<string, DemoStepStatus | { status: DemoStepStatus; error?: string }>;
  error?: string | null;
};

export type BootstrapResponse = {
  runId: string;
  roles: DemoRoleWallet[] | Record<string, DemoRoleWallet | string>;
  fundHint?: string;
  fundInstructions?: string;
  message?: string;
};

/** UI wizard phases that group backend step names */
export const WIZARD_PHASES: {
  id: string;
  title: string;
  description: string;
  steps: DemoStepName[];
}[] = [
  {
    id: "setup",
    title: "Setup",
    description: "Identities, solar asset LORs, mandates, and CVA stakes",
    steps: ["setupIdentities", "setupAsset", "fundAndStake"],
  },
  {
    id: "normalOps",
    title: "Normal ops",
    description: "Months 1–3: revenue distribute, scores above 90, oracle prices",
    steps: ["normalOps"],
  },
  {
    id: "sanctions",
    title: "Sanctions freeze",
    description: "Maint operator A-Pass frozen → score 88 → 31, yield escrow",
    steps: ["sanctionsEvent"],
  },
  {
    id: "acquire",
    title: "Auto-list / Acquire",
    description: "Maintenance LOR auto-lists; replacement acquires and resumes",
    steps: ["replacementAcquire"],
  },
  {
    id: "export",
    title: "Regulator export",
    description: "Compile audit pack with events and Travel Rule attestations",
    steps: ["regulatorExport"],
  },
];

export const ROLE_LABELS: Record<DemoRole, string> = {
  owner: "Asset owner (SG family office)",
  energyOp: "Energy revenue operator",
  maintOp: "Maintenance operator",
  replacement: "Replacement operator",
  investor: "Investor / token holder",
  regulator: "Regulator (MAS examiner)",
};
