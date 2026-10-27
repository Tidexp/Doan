"use client";

import { useState } from "react";

type PickerFile = {
  id: string;
  name: string;
  mimeType: string;
};

type PickerResult = {
  action: string;
  docs?: PickerFile[];
};

type PickerView = {
  setMimeTypes(mimeTypes: string): PickerView;
  setIncludeFolders(include: boolean): PickerView;
};

type PickerBuilder = {
  addView(view: PickerView): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerResult) => void): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

type GooglePicker = {
  Action: { PICKED: string };
  DocsView: new (viewId: string) => PickerView;
  Feature: { MULTISELECT_ENABLED: string };
  ViewId: { DOCS: string };
  PickerBuilder: new () => PickerBuilder;
};

type GoogleApi = {
  load(
    api: string,
    options: { callback: () => void; onerror: () => void },
  ): void;
  picker: GooglePicker;
};

type GoogleTokenClient = {
  requestAccessToken(): void;
};

type GoogleIdentity = {
  oauth2: {
    initTokenClient(options: {
      client_id: string;
      scope: string;
      callback: (response: { access_token?: string; error?: string }) => void;
    }): GoogleTokenClient;
  };
};

declare global {
  interface Window {
    gapi?: GoogleApi;
    google?: { accounts?: GoogleIdentity };
  }
}

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_WORKSPACE_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
];
const SUPPORTED_DRIVE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
  ...GOOGLE_WORKSPACE_TYPES,
];
const GOOGLE_WORKSPACE_EXPORT_TYPES = new Set(GOOGLE_WORKSPACE_TYPES);
const PDF_MIME_TYPE = "application/pdf";

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    const onError = () => reject(new Error("Không tải được thư viện Google Drive."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function getWorkspaceExportName(name: string) {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

export function DriveImportButton({
  clientId,
  apiKey,
  appId,
  departmentId,
  disabled,
  onMessage,
  onImported,
}: {
  clientId: string;
  apiKey: string;
  appId: string;
  departmentId: string;
  disabled: boolean;
  onMessage: (message: string) => void;
  onImported: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function importFiles(files: PickerFile[], token: string) {
    let imported = 0;
    const failures: string[] = [];

    for (const driveFile of files) {
      try {
        const isWorkspaceFile = GOOGLE_WORKSPACE_EXPORT_TYPES.has(
          driveFile.mimeType,
        );
        const endpoint = isWorkspaceFile
          ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFile.id)}/export?mimeType=${encodeURIComponent(PDF_MIME_TYPE)}`
          : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFile.id)}?alt=media`;
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "Google không cho phép tải tệp này."
              : `Google Drive trả về lỗi ${response.status}.`,
          );
        }

        const blob = await response.blob();
        const file = new File(
          [blob],
          isWorkspaceFile ? getWorkspaceExportName(driveFile.name) : driveFile.name,
          {
            type: isWorkspaceFile
              ? PDF_MIME_TYPE
              : blob.type || driveFile.mimeType,
          },
        );
        const formData = new FormData();
        formData.set("file", file);
        formData.set("departmentId", departmentId);
        const uploadResponse = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
        const result = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(result.error ?? "Không nhập được tệp vào kho tài liệu.");
        }
        imported += 1;
      } catch (error) {
        failures.push(
          `${driveFile.name}: ${error instanceof Error ? error.message : "Lỗi không xác định."}`,
        );
      }
    }

    const summary = `Đã nhập ${imported}/${files.length} tệp từ Google Drive.`;
    onMessage(
      failures.length
        ? `${summary} ${failures.join(" ")}`
        : summary,
    );
    if (imported > 0) onImported();
  }

  async function openPicker() {
    if (busy || disabled) return;
    setBusy(true);
    onMessage("");

    try {
      const gisScript =
        "https://accounts.google.com/gsi/client";
      const pickerScript = "https://apis.google.com/js/api.js";
      await Promise.all([loadScript(gisScript), loadScript(pickerScript)]);

      const googleIdentity = window.google?.accounts;
      const googleApi = window.gapi;
      if (!googleIdentity || !googleApi) {
        throw new Error("Google Drive chưa tải xong. Hãy thử lại.");
      }

      await new Promise<void>((resolve, reject) => {
        googleApi.load("picker", {
          callback: resolve,
          onerror: () => reject(new Error("Không khởi tạo được Google Picker.")),
        });
      });

      const token = await new Promise<string>((resolve, reject) => {
        const tokenClient = googleIdentity.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_FILE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(
                new Error(
                  response.error === "access_denied"
                    ? "Bạn chưa cấp quyền truy cập tệp đã chọn."
                    : "Không lấy được quyền truy cập Google Drive.",
                ),
              );
              return;
            }
            resolve(response.access_token);
          },
        });
        tokenClient.requestAccessToken();
      });

      await new Promise<void>((resolve) => {
        const view = new googleApi.picker.DocsView(
          googleApi.picker.ViewId.DOCS,
        )
          .setIncludeFolders(false)
          .setMimeTypes(SUPPORTED_DRIVE_TYPES.join(","));
        const picker = new googleApi.picker.PickerBuilder()
          .addView(view)
          .setAppId(appId)
          .setDeveloperKey(apiKey)
          .setOAuthToken(token)
          .enableFeature(googleApi.picker.Feature.MULTISELECT_ENABLED)
          .setCallback((data) => {
            if (data.action === googleApi.picker.Action.PICKED && data.docs) {
              void importFiles(data.docs, token).finally(resolve);
              return;
            }
            if (data.action !== "loaded") resolve();
          })
          .build();
        picker.setVisible(true);
      });
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Không thể kết nối Google Drive.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={openPicker}
      className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 disabled:opacity-60"
    >
      {busy ? "Đang nhập từ Drive..." : "Nhập từ Google Drive"}
    </button>
  );
}
