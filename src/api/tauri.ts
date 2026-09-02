import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  BootstrapPayload,
  HistoryFilePayload,
  NewTarget,
  PingSample,
  PingSampleEvent,
  Target,
} from "../types";

export function bootstrap() {
  return invoke<BootstrapPayload>("bootstrap");
}

export function saveSettings(settings: AppSettings) {
  return invoke<AppSettings>("save_settings", { settings });
}

export function saveTarget(newTarget: NewTarget) {
  return invoke<Target>("save_target", { newTarget });
}

export function updateTarget(id: string, ipv4: string, alias: string) {
  return invoke<Target>("update_target", { payload: { id, ipv4, alias } });
}

export function deleteTarget(id: string) {
  return invoke<void>("delete_target", { payload: { id } });
}

export function setTargetEnabled(id: string, enabled: boolean) {
  return invoke<Target>("set_target_enabled", { payload: { id, enabled } });
}

export function startPing() {
  return invoke<void>("start_ping");
}

export function stopPing() {
  return invoke<void>("stop_ping");
}

export function loadSamples(
  targetId: string,
  from?: string,
  to?: string,
) {
  return invoke<PingSample[]>("samples", {
    query: { targetId, from: from ?? null, to: to ?? null },
  });
}

export function openHistoryFile(path: string) {
  return invoke<HistoryFilePayload>("open_history_file", { path });
}

export function loadHistorySamples(
  path: string,
  targetId: string,
  from?: string,
  to?: string,
) {
  return invoke<PingSample[]>("history_samples", {
    query: { path, targetId, from: from ?? null, to: to ?? null },
  });
}

export async function onPingSample(
  callback: (sample: PingSampleEvent) => void,
): Promise<UnlistenFn> {
  return listen<PingSampleEvent>("ping-sample", (event) => {
    callback(event.payload);
  });
}

export function clearHistory() {
  return invoke<number>("clear_history");
}

export function switchDataFile(path: string) {
  return invoke<BootstrapPayload>("switch_data_file", { path });
}

export function saveDataFileAs(path: string) {
  return invoke<string>("save_data_file_as", { path });
}

export function newDataFile(path: string) {
  return invoke<BootstrapPayload>("new_data_file", { path });
}

