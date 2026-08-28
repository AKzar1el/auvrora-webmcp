import { createLoopFixController } from "../lib/app/controller.ts";
import type { LoopFixState } from "../lib/app/state.ts";
import type { Finding } from "../lib/audit/types.ts";
import { registerLoopFixTools } from "../lib/webmcp/register.ts";

function appendElements(parent: Node, ...children: Node[]) {
  for (const child of children) parent.appendChild(child);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required LoopFix element: ${selector}`);
  return element;
}

function statusLabel(status: string): string {
  if (status === "fixed") return "Fixed";
  if (status === "still_present") return "Still present";
  return "Not verifiable";
}

function findingRow(finding: Finding, selected: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const label = document.createElement("label");
  label.className = "finding-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selected;
  checkbox.dataset.findingId = finding.id;
  checkbox.addEventListener("change", () => onChange(checkbox.checked));

  const body = document.createElement("span");
  body.className = "finding-body";

  const top = document.createElement("span");
  top.className = "finding-topline";
  const severity = document.createElement("span");
  severity.className = `severity severity-${finding.severity}`;
  severity.textContent = finding.severity;
  const code = document.createElement("code");
  code.textContent = finding.code;
  appendElements(top, severity, code);

  const title = document.createElement("strong");
  title.textContent = finding.title;
  const evidence = document.createElement("span");
  evidence.className = "finding-evidence";
  evidence.textContent = finding.observedEvidence;

  appendElements(body, top, title, evidence);
  appendElements(label, checkbox, body);
  return label;
}

export function initializeLoopFixApp() {
  const controller = createLoopFixController();
  const form = requiredElement<HTMLFormElement>("#loopfix-audit-form");
  const urlInput = requiredElement<HTMLInputElement>("#loopfix-url");
  const runButton = requiredElement<HTMLButtonElement>("#loopfix-run");
  const demoButton = requiredElement<HTMLButtonElement>("#loopfix-demo");
  const findingsPanel = requiredElement<HTMLElement>("#findings-panel");
  const findingsList = requiredElement<HTMLElement>("#findings-list");
  const counts = requiredElement<HTMLElement>("#finding-counts");
  const context = requiredElement<HTMLElement>("#audit-context");
  const scopePanel = requiredElement<HTMLElement>("#fix-scope-panel");
  const scopeList = requiredElement<HTMLOListElement>("#scope-list");
  const scopeCount = requiredElement<HTMLElement>("#scope-count");
  const clearButton = requiredElement<HTMLButtonElement>("#scope-clear");
  const verifyButton = requiredElement<HTMLButtonElement>("#verify-scope");
  const verificationPanel = requiredElement<HTMLElement>("#verification-panel");
  const verificationList = requiredElement<HTMLElement>("#verification-list");
  const verificationSummary = requiredElement<HTMLElement>("#verification-summary");
  const modeStatus = requiredElement<HTMLElement>("#mode-status");
  const liveRegion = requiredElement<HTMLElement>("#app-live-region");
  const webmcpStatus = requiredElement<HTMLElement>("#webmcp-status");

  let activeOperation: AbortController | null = null;

  const announce = (message: string) => {
    liveRegion.textContent = "";
    window.setTimeout(() => { liveRegion.textContent = message; }, 20);
  };

  const renderCounts = (state: LoopFixState) => {
    counts.replaceChildren();
    if (!state.audit) return;
    for (const severity of ["error", "warning", "notice"] as const) {
      const badge = document.createElement("span");
      badge.className = `count-badge severity-${severity}`;
      const count = state.audit.findings.filter((finding) => finding.severity === severity).length;
      badge.textContent = `${count} ${severity}${count === 1 ? "" : "s"}`;
      counts.appendChild(badge);
    }
  };

  const applyScope = (nextIds: string[]) => {
    try {
      if (nextIds.length === 0) controller.clearFixScope();
      else controller.setFixScope(nextIds);
      announce(`Fix scope updated to ${nextIds.length} finding${nextIds.length === 1 ? "" : "s"}.`);
    } catch (error) {
      announce(error instanceof Error ? error.message : "The fix scope could not be updated.");
      render(controller.getState());
    }
  };

  const render = (state: LoopFixState) => {
    const audit = state.audit;
    findingsPanel.hidden = !audit;
    scopePanel.hidden = !audit;
    verificationPanel.hidden = !state.verification;

    if (!audit) {
      modeStatus.textContent = "No audit yet";
      findingsList.replaceChildren();
      scopeList.replaceChildren();
      return;
    }

    modeStatus.textContent = state.mode === "demo" ? "Demo data" : "Live audit";
    context.textContent = `${audit.canonicalUrl} · ${audit.findings.length} finding${audit.findings.length === 1 ? "" : "s"} · rules ${audit.rulesVersion}`;
    renderCounts(state);

    findingsList.replaceChildren();
    const selected = new Set(state.selectedFindingIds);
    for (const finding of audit.findings) {
      findingsList.appendChild(findingRow(finding, selected.has(finding.id), (checked) => {
        const next = checked
          ? [...state.selectedFindingIds, finding.id]
          : state.selectedFindingIds.filter((id) => id !== finding.id);
        if (next.length > 10) {
          announce("A fix scope can contain at most 10 findings.");
          render(controller.getState());
          return;
        }
        applyScope([...next]);
      }));
    }
    if (audit.findings.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No findings were produced by the current deterministic rules.";
      findingsList.appendChild(empty);
    }

    scopeList.replaceChildren();
    for (const findingId of state.selectedFindingIds) {
      const finding = audit.findings.find((item) => item.id === findingId);
      if (!finding) continue;
      const item = document.createElement("li");
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = finding.title;
      const code = document.createElement("code");
      code.textContent = finding.code;
      appendElements(text, title, code);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.setAttribute("aria-label", `Remove ${finding.title} from fix scope`);
      remove.textContent = "Remove";
      remove.addEventListener("click", () => applyScope(state.selectedFindingIds.filter((id) => id !== findingId)));
      appendElements(item, text, remove);
      scopeList.appendChild(item);
    }
    if (state.selectedFindingIds.length === 0) {
      const item = document.createElement("li");
      item.className = "empty-state";
      item.textContent = "Select findings to define a bounded fix scope.";
      scopeList.appendChild(item);
    }

    scopeCount.textContent = `${state.selectedFindingIds.length} selected`;
    clearButton.disabled = state.selectedFindingIds.length === 0;
    verifyButton.disabled = state.selectedFindingIds.length === 0 || activeOperation !== null;

    verificationList.replaceChildren();
    if (state.verification) {
      let fixed = 0;
      let stillPresent = 0;
      let notVerifiable = 0;
      for (const result of state.verification.results) {
        if (result.status === "fixed") fixed += 1;
        else if (result.status === "still_present") stillPresent += 1;
        else notVerifiable += 1;
        const finding = audit.findings.find((item) => item.id === result.findingId);
        const row = document.createElement("div");
        row.className = "verification-row";
        const title = document.createElement("span");
        title.textContent = finding?.title ?? result.findingId;
        const status = document.createElement("strong");
        status.className = `verification-status verification-${result.status}`;
        status.textContent = statusLabel(result.status);
        appendElements(row, title, status);
        verificationList.appendChild(row);
      }
      verificationSummary.textContent = `${fixed} fixed · ${stillPresent} still present · ${notVerifiable} not verifiable`;
    }
  };

  const setBusy = (busy: boolean) => {
    runButton.disabled = busy;
    demoButton.disabled = busy;
    runButton.textContent = busy ? "Auditing…" : "Run audit";
    const state = controller.getState();
    verifyButton.disabled = busy || state.selectedFindingIds.length === 0;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    activeOperation?.abort();
    const operation = new AbortController();
    activeOperation = operation;
    setBusy(true);
    try {
      const audit = await controller.runAudit(urlInput.value.trim(), operation.signal);
      announce(`Audit completed with ${audit.findings.length} finding${audit.findings.length === 1 ? "" : "s"}.`);
    } catch (error) {
      if (operation.signal.aborted) announce("Audit cancelled.");
      else announce(error instanceof Error ? error.message : "The audit could not be completed.");
    } finally {
      if (activeOperation === operation) activeOperation = null;
      setBusy(false);
      render(controller.getState());
    }
  });

  demoButton.addEventListener("click", () => {
    activeOperation?.abort();
    activeOperation = null;
    const audit = controller.loadDemo();
    setBusy(false);
    announce(`Demo loaded with ${audit.findings.length} findings.`);
  });

  clearButton.addEventListener("click", () => applyScope([]));

  verifyButton.addEventListener("click", async () => {
    activeOperation?.abort();
    const operation = new AbortController();
    activeOperation = operation;
    setBusy(true);
    verifyButton.textContent = "Verifying…";
    try {
      const results = await controller.verifyFixScope(operation.signal);
      const fixed = results.filter((result) => result.status === "fixed").length;
      const stillPresent = results.filter((result) => result.status === "still_present").length;
      const notVerifiable = results.filter((result) => result.status === "not_verifiable").length;
      announce(`Verification completed: ${fixed} fixed, ${stillPresent} still present, ${notVerifiable} not verifiable.`);
    } catch (error) {
      if (operation.signal.aborted) announce("Verification cancelled.");
      else announce(error instanceof Error ? error.message : "Verification could not be completed.");
    } finally {
      if (activeOperation === operation) activeOperation = null;
      verifyButton.textContent = "Re-audit & verify";
      setBusy(false);
      render(controller.getState());
    }
  });

  controller.subscribe(render);
  render(controller.getState());

  void registerLoopFixTools(controller).then((registration) => {
    webmcpStatus.textContent = registration.supported
      ? `WebMCP ready · ${registration.count} tools`
      : "WebMCP unavailable in this browser";
    if (registration.supported) {
      window.addEventListener("pagehide", registration.dispose, { once: true });
    }
  }).catch(() => {
    webmcpStatus.textContent = "WebMCP registration failed";
  });

  return { controller };
}
