import React, { useEffect, useState } from "react";
import { Save, ScanLine, Settings as SettingsIcon } from "lucide-react";
import type { SettingsSnapshot, SettingsUpdatePayload } from "../api";
import { scanDependencies, updateSettings } from "../api";
import { Button, Card, Input, useToast } from "../ui";

export const SettingsPage = ({
  settings,
  onSaved,
  onAction
}: {
  settings: SettingsSnapshot | null;
  onSaved: () => Promise<void>;
  onAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [executionModel, setExecutionModel] = useState(settings?.runtime.executionModel ?? "");
  const [planningModel, setPlanningModel] = useState(settings?.runtime.planningModel ?? "");
  const [jql, setJql] = useState(settings?.tracker.jql ?? "");
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (settings) {
      setExecutionModel(settings.runtime.executionModel ?? "");
      setPlanningModel(settings.runtime.planningModel ?? "");
      setJql(settings.tracker.jql ?? "");
    }
  }, [settings?.runtime.executionModel, settings?.runtime.planningModel, settings?.tracker.jql]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: SettingsUpdatePayload = {};
      if (executionModel !== (settings?.runtime.executionModel ?? "")) payload.runtime = { ...payload.runtime, executionModel };
      if (planningModel !== (settings?.runtime.planningModel ?? "")) payload.runtime = { ...payload.runtime, planningModel };
      if (jql !== (settings?.tracker.jql ?? "") && settings?.tracker.kind === "jira") payload.tracker = { jql };
      await updateSettings(payload);
      await onSaved();
      push({ title: "Settings saved (in-memory)" });
    } catch (err) {
      push({ title: "Save failed", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_minmax(280px,380px)] gap-4 max-lg:grid-cols-1">
      <Card className="p-4 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-[var(--muted-foreground)]" />
            <h2 className="m-0 text-base font-semibold">Configuration</h2>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={15} /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Changes are applied in-memory and revert on restart. Edit WORKFLOW.md for persistent configuration.
        </p>
        <div className="grid gap-3">
          <p className="mb-0 mt-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Tracker</p>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Tracker kind</label>
            <Input value={settings?.tracker.kind ?? "—"} disabled />
          </div>
          {settings?.tracker.kind === "jira" ? (
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold">JQL Filter</label>
              <Input value={jql} onChange={(e) => setJql(e.target.value)} placeholder="project = MYPROJECT AND status = 'To Do'" />
            </div>
          ) : null}
          {settings?.tracker.project_key ? (
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold">Project key</label>
              <Input value={settings.tracker.project_key} disabled />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Active states</label>
            <Input value={settings?.tracker.active_states.join(", ") ?? ""} disabled />
          </div>

          <p className="mb-0 mt-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Runtime Models</p>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Runtime kind</label>
            <Input value={settings?.runtime.kind ?? "—"} disabled />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Execution model</label>
            <Input
              value={executionModel}
              onChange={(e) => setExecutionModel(e.target.value)}
              placeholder="e.g. claude-sonnet-4-6"
              disabled={settings?.runtime.kind !== "claude_code"}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Planning model</label>
            <Input
              value={planningModel}
              onChange={(e) => setPlanningModel(e.target.value)}
              placeholder="e.g. claude-opus-4-7"
              disabled={settings?.runtime.kind !== "claude_code"}
            />
          </div>
          {settings?.runtime.kind !== "claude_code" ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Model editing is only available for the claude_code runtime.
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="self-start p-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 mt-0 text-base font-semibold">Dependency Analysis</h2>
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          LLM scan of open issues to detect implicit blockers. Results appear as "Blocked" badges on cards.
        </p>
        <Button variant="secondary" onClick={() => onAction("Scanning dependencies", () => scanDependencies())}>
          <ScanLine size={15} /> Scan Now
        </Button>
      </Card>
    </section>
  );
};
