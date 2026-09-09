import { ChevronDown, Download, Edit3, Gauge, KeyRound, Loader2, Power, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import type { AuthAccount, AuthQuotaState, AuthQuotaWindow, AuthModelState } from "../../types";
import { quotaDisplayState } from "./quotaDisplay";

const WINDOW_MINUTES = {
  fiveHours: 5 * 60,
  week: 7 * 24 * 60,
  month: 30 * 24 * 60,
} as const;

type AccountActions = {
  pending: boolean;
  quotaPending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onRefreshQuota: () => void;
  onSync: () => void;
  onExport: () => void;
  onRelogin: () => void;
};

type ActionButtonProps = {
  label: string;
  disabled?: boolean;
  className: string;
  onClick: () => void;
  children: ReactNode;
};

function isAvailable(account: AuthAccount) {
  return account.status !== "invalid" && !account.disabled && !account.quota?.exceeded;
}

function statusInfo(account: AuthAccount) {
  if (account.status === "invalid") return { label: "已失效", className: "bg-destructive/10 text-destructive" };
  if (account.disabled) return { label: "已停用", className: "bg-muted text-muted-foreground" };
  if (account.quota?.exceeded) return { label: "额度耗尽", className: "bg-warning/15 text-warning" };
  return { label: "正常", className: "bg-success/10 text-success" };
}

function displayTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function hasWindowData(window: AuthQuotaWindow) {
  return (window.used_percent != null && window.used_percent !== 0)
    || (window.window_minutes != null && window.window_minutes !== 0)
    || window.reset_at != null;
}

function getWindow(quota: AuthQuotaState | null, target: number) {
  if (!quota) return null;
  for (const limit of quota.limits) {
    for (const window of [limit.primary, limit.secondary]) {
      if (!window || !hasWindowData(window) || !window.window_minutes) continue;
      if (window.window_minutes >= target * 0.95 && window.window_minutes <= target * 1.05) {
        return window;
      }
    }
  }
  return null;
}

function QuotaCell({ quota, target, label }: { quota: AuthQuotaState | null; target: number; label: string }) {
  const window = getWindow(quota, target);
  if (!window) {
    return <div className="text-xs text-muted-foreground">{quota?.exceeded ? "已耗尽" : "--"}</div>;
  }
  const { remaining, tone } = quotaDisplayState(window.used_percent);
  const barClass = tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-success";
  const resetAt = displayTime(window.reset_at);
  return (
    <div className="min-w-[92px]">
      <div className={`text-xs font-semibold tabular-nums ${tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground"}`}>
        {remaining == null ? `${label} --` : `${remaining.toFixed(0)}%`}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${remaining ?? 0}%` }} />
      </div>
      {resetAt && <div className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">重置 {resetAt}</div>}
    </div>
  );
}

function ModelSummary({ account, expanded, onToggle }: { account: AuthAccount; expanded: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="inline-flex max-w-[180px] items-center gap-1.5 text-left text-xs text-foreground hover:text-primary" title="展开模型列表">
      <span className="truncate">{account.models.length ? `${account.models.length} 个模型` : "无模型"}</span>
      <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  );
}

function ModelDetails({ models }: { models: AuthModelState[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {models.length === 0
        ? <span className="text-xs text-muted-foreground">尚无模型快照，不参与路由</span>
        : models.map((model) => (
          <span key={model.id} className={`max-w-[220px] truncate rounded-full px-2 py-1 text-[11px] ${model.unavailable ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`} title={model.last_error || model.id}>
            {model.id}
          </span>
        ))}
    </div>
  );
}

function ActionButton({ label, disabled, className, onClick, children }: ActionButtonProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={className}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function RowActions({ account, actions }: { account: AuthAccount; actions: AccountActions }) {
  const invalid = account.status === "invalid";
  const disabled = account.disabled;
  return (
    <div className="flex items-center justify-end gap-0.5 overflow-visible">
      {invalid ? (
        <ActionButton label="重新登录" onClick={actions.onRelogin} disabled={actions.pending} className="rounded-lg p-1.5 text-primary hover:bg-primary/10 disabled:opacity-50"><KeyRound size={15} /></ActionButton>
      ) : (
        <>
          {account.provider === "codex" && <ActionButton label="刷新额度" onClick={actions.onRefreshQuota} disabled={actions.pending} className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50">{actions.quotaPending ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />}</ActionButton>}
          <ActionButton label="刷新令牌" onClick={actions.onRefresh} disabled={actions.pending} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">{actions.pending && !actions.quotaPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</ActionButton>
          <ActionButton label="同步模型" onClick={actions.onSync} disabled={actions.pending} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><RotateCw size={15} /></ActionButton>
          {account.provider !== "kimi" && <ActionButton label="导出 JSON" onClick={actions.onExport} disabled={actions.pending} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><Download size={15} /></ActionButton>}
        </>
      )}
      <ActionButton label="编辑账号" onClick={actions.onEdit} disabled={actions.pending} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><Edit3 size={15} /></ActionButton>
      <ActionButton label={disabled ? "启用账号" : "停用账号"} onClick={actions.onToggle} disabled={actions.pending} className={`rounded-lg p-1.5 disabled:opacity-50 ${disabled ? "text-success hover:bg-success/10" : "text-warning hover:bg-warning/10"}`}><Power size={15} /></ActionButton>
      <ActionButton label="删除账号" onClick={actions.onDelete} disabled={actions.pending} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 size={15} /></ActionButton>
    </div>
  );
}

export function AccountList({ accounts, actionFor }: { accounts: AuthAccount[]; actionFor: (account: AuthAccount) => AccountActions }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <div className="surface overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead className="bg-muted/45 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3">#</th>
              <th className="min-w-[190px] px-3 py-3">账号</th>
              <th className="w-28 px-3 py-3">状态</th>
              <th className="w-28 px-3 py-3">账号类型</th>
              <th className="w-32 px-3 py-3">5H 额度</th>
              <th className="w-32 px-3 py-3">周额度</th>
              <th className="w-32 px-3 py-3">月额度</th>
              <th className="w-32 px-3 py-3">模型</th>
              <th className="w-20 px-3 py-3 text-center">优先级</th>
              <th className="w-20 px-3 py-3 text-center">权重</th>
              <th className="w-44 px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.map((account, index) => {
              const expanded = expandedId === account.id;
              const status = statusInfo(account);
              const actions = actionFor(account);
              return (
                <Fragment key={account.id}>
                  <tr key={account.id} className={`${isAvailable(account) ? "" : "bg-muted/20"} transition-colors hover:bg-muted/35`}>
                    <td className="px-4 py-3 align-top text-xs tabular-nums text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{account.label || account.account_id}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{account.email || account.account_id}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.label}</span>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-muted-foreground">{account.plan_type || "未知"}</td>
                    <td className="px-3 py-3 align-top"><QuotaCell quota={account.quota} target={WINDOW_MINUTES.fiveHours} label="5H" /></td>
                    <td className="px-3 py-3 align-top"><QuotaCell quota={account.quota} target={WINDOW_MINUTES.week} label="周" /></td>
                    <td className="px-3 py-3 align-top"><QuotaCell quota={account.quota} target={WINDOW_MINUTES.month} label="月" /></td>
                    <td className="px-3 py-3 align-top"><ModelSummary account={account} expanded={expanded} onToggle={() => setExpandedId(expanded ? null : account.id)} /></td>
                    <td className="px-3 py-3 text-center align-top text-xs font-semibold tabular-nums">P{account.priority}</td>
                    <td className="px-3 py-3 text-center align-top text-xs font-semibold tabular-nums">W{account.weight}</td>
                    <td className="px-3 py-3 align-top"><RowActions account={account} actions={actions} /></td>
                  </tr>
                  {expanded && (
                    <tr key={`${account.id}-details`} className="bg-muted/20">
                      <td colSpan={11} className="px-4 py-3">
                        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
                          <div className="min-w-[280px] flex-1"><div className="mb-2 text-[11px] font-semibold text-muted-foreground">可用模型</div><ModelDetails models={account.models} /></div>
                          <div className="text-xs text-muted-foreground">
                            <div>最近刷新：{displayTime(account.last_refreshed_at) || "未刷新"}</div>
                            <div className="mt-1">模型同步：{displayTime(account.last_models_sync_at) || "未同步"}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
