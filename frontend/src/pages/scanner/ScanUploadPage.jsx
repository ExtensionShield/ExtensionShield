import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import {
  AlertCircle,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileJson2,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  LockKeyhole,
  MoreHorizontal,
  RefreshCw,
  Save,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import SEOHead from "../../components/SEOHead";
import { useAuth } from "../../context/AuthContext";
import "./ScanUploadPage.scss";

const AuditCodeEditor = React.lazy(() => import("./AuditCodeEditor"));

const ACCEPTED_PRIVATE_BUILD_TYPES = [".crx", ".zip"];
const MAX_UPLOAD_SIZE_MB = 25;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const SAMPLE_AUDIT_CODE = `// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_DATA') {
    fetch(message.url, {
      method: 'GET',
      headers: {
        'Authorization': message.token,
        'Content-Type': 'application/json'
      }
    })
    .then(res => res.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

function storeToken(token) {
  chrome.storage.local.set({ authToken: token }, () => {
    console.log('Token stored');
  });
}`;

const TEXT_FILE_EXTENSIONS = new Set([
  "bat",
  "cjs",
  "conf",
  "css",
  "csv",
  "html",
  "htm",
  "ini",
  "js",
  "json",
  "jsx",
  "less",
  "log",
  "mjs",
  "md",
  "scss",
  "svg",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const TEXT_FILE_NAMES = new Set([
  "changelog",
  "license",
  "notice",
  "readme",
]);

const LANGUAGE_BY_EXTENSION = {
  cjs: "javascript",
  css: "css",
  html: "html",
  htm: "html",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  less: "less",
  mjs: "javascript",
  md: "markdown",
  scss: "scss",
  svg: "xml",
  ts: "typescript",
  tsx: "typescript",
  vue: "html",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getFileName(path) {
  return path.split("/").filter(Boolean).pop() || path;
}

function getFileExtension(path) {
  const fileName = getFileName(path).toLowerCase();
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return fileName.slice(dotIndex + 1);
}

function getFileLanguage(path) {
  return LANGUAGE_BY_EXTENSION[getFileExtension(path)] || "plaintext";
}

function isProbablyTextFile(path, size) {
  if (size > MAX_TEXT_PREVIEW_BYTES) return false;
  const name = getFileName(path).toLowerCase();
  const extension = getFileExtension(path);
  return TEXT_FILE_EXTENSIONS.has(extension) || TEXT_FILE_NAMES.has(name);
}

function isSupportedPrivateBuild(file) {
  if (!file?.name) return false;
  const extension = `.${getFileExtension(file.name)}`;
  return ACCEPTED_PRIVATE_BUILD_TYPES.includes(extension) && file.size <= MAX_UPLOAD_SIZE_BYTES;
}

function normalizeZipPath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findZipOffset(bytes) {
  for (let index = 0; index < bytes.length - 3; index += 1) {
    if (
      bytes[index] === 0x50
      && bytes[index + 1] === 0x4b
      && bytes[index + 2] === 0x03
      && bytes[index + 3] === 0x04
    ) {
      return index;
    }
  }
  return -1;
}

function sliceArrayBuffer(bytes, start) {
  return bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + bytes.byteLength);
}

function extractZipPayload(arrayBuffer, fileName) {
  const bytes = new Uint8Array(arrayBuffer);
  const isCrx = bytes[0] === 0x43 && bytes[1] === 0x72 && bytes[2] === 0x32 && bytes[3] === 0x34;

  if (!isCrx) {
    return {
      archiveKind: "ZIP",
      buffer: arrayBuffer,
    };
  }

  const version = readUint32LE(bytes, 4);
  let zipOffset = -1;

  if (version === 2 && bytes.length >= 16) {
    const publicKeyLength = readUint32LE(bytes, 8);
    const signatureLength = readUint32LE(bytes, 12);
    zipOffset = 16 + publicKeyLength + signatureLength;
  } else if (version === 3 && bytes.length >= 12) {
    const headerLength = readUint32LE(bytes, 8);
    zipOffset = 12 + headerLength;
  }

  if (zipOffset < 0 || zipOffset >= bytes.length) {
    zipOffset = findZipOffset(bytes);
  }

  if (zipOffset < 0 || zipOffset >= bytes.length) {
    throw new Error(`${fileName} is a CRX file, but its embedded ZIP payload could not be located.`);
  }

  return {
    archiveKind: `CRX v${version || "unknown"}`,
    buffer: sliceArrayBuffer(bytes, zipOffset),
  };
}

function sortFiles(files) {
  return [...files].sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: "base" }));
}

function buildFileTree(files) {
  const root = { type: "folder", name: "extension", path: "", children: [] };
  const folderMap = new Map([["", root]]);

  files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    let parentPath = "";
    let parentNode = root;

    parts.slice(0, -1).forEach((part) => {
      const folderPath = parentPath ? `${parentPath}/${part}` : part;
      let folderNode = folderMap.get(folderPath);

      if (!folderNode) {
        folderNode = { type: "folder", name: part, path: folderPath, children: [] };
        folderMap.set(folderPath, folderNode);
        parentNode.children.push(folderNode);
      }

      parentPath = folderPath;
      parentNode = folderNode;
    });

    parentNode.children.push({
      type: "file",
      name: getFileName(file.path),
      path: file.path,
      file,
    });
  });

  const sortNode = (node) => {
    node.children.sort((left, right) => {
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
    node.children.filter((child) => child.type === "folder").forEach(sortNode);
  };

  sortNode(root);
  return root;
}

function collectFolderPaths(node, paths = {}) {
  node.children.forEach((child) => {
    if (child.type === "folder") {
      paths[child.path] = true;
      collectFolderPaths(child, paths);
    }
  });
  return paths;
}

function getArchiveFiles(zip) {
  return sortFiles(
    Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => {
        const path = normalizeZipPath(entry.name);
        const extension = getFileExtension(path);
        const size = entry._data?.uncompressedSize ?? entry._data?.compressedSize ?? 0;

        return {
          path,
          zipPath: entry.name,
          extension,
          size,
          isText: isProbablyTextFile(path, size),
          language: getFileLanguage(path),
          source: "archive",
        };
      })
      .filter((file) => file.path && !file.path.startsWith("__MACOSX/"))
  );
}

function pickInitialFile(files) {
  return (
    files.find((file) => file.path.toLowerCase().endsWith("manifest.json"))
    || files.find((file) => getFileName(file.path).toLowerCase() === "service_worker.js")
    || files.find((file) => file.isText)
    || files[0]
    || null
  );
}

function buildPreviewWorkspace() {
  const contents = {
    "manifest.json": JSON.stringify({
      manifest_version: 3,
      name: "Coupon Helper",
      version: "2.1.0",
      description: "Find and apply coupon codes.",
      permissions: ["storage", "activeTab"],
      host_permissions: ["*://*/*"],
      background: { service_worker: "background/service_worker.js" },
      content_scripts: [{ matches: ["*://*/*"], js: ["content/content_script.js"] }],
      action: { default_popup: "popup/popup.html" },
    }, null, 2),
    "background/service_worker.js": SAMPLE_AUDIT_CODE,
    "content/content_script.js": "// Content script\nconst observer = new MutationObserver(() => {});\nobserver.observe(document.body, { childList: true, subtree: true });\n",
    "popup/popup.html": "<!DOCTYPE html>\n<html>\n<head><link rel=\"stylesheet\" href=\"styles.css\"></head>\n<body><div id=\"app\"></div><script src=\"popup.js\"></script></body>\n</html>\n",
    "popup/popup.js": "document.addEventListener('DOMContentLoaded', () => {\n  console.log('popup loaded');\n});\n",
    "popup/styles.css": "#app { width: 280px; padding: 16px; font-family: system-ui, sans-serif; }\nh1 { font-size: 15px; margin: 0; }\n",
  };
  const files = sortFiles(
    Object.entries(contents).map(([path, text]) => ({
      path,
      zipPath: path,
      extension: getFileExtension(path),
      size: text.length,
      isText: true,
      language: getFileLanguage(path),
      source: "archive",
    }))
  );
  return {
    workspace: {
      id: "preview",
      fileName: "sample-extension.zip",
      fileSize: files.reduce((sum, f) => sum + f.size, 0),
      archiveKind: "ZIP",
      files,
      tree: buildFileTree(files),
      textFileCount: files.length,
      binaryFileCount: 0,
    },
    initialContents: contents,
  };
}

async function parsePrivateBuildFile(file) {
  const rawBuffer = await file.arrayBuffer();
  const { archiveKind, buffer } = extractZipPayload(rawBuffer, file.name);
  const zip = await JSZip.loadAsync(buffer);
  const files = getArchiveFiles(zip);

  if (!files.length) {
    throw new Error("No files were found in this archive.");
  }

  const tree = buildFileTree(files);

  return {
    zip,
    workspace: {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      fileName: file.name,
      fileSize: file.size,
      archiveKind,
      files,
      tree,
      textFileCount: files.filter((entry) => entry.isText).length,
      binaryFileCount: files.filter((entry) => !entry.isText).length,
    },
  };
}

function createVirtualTextFile(path) {
  return {
    path,
    zipPath: path,
    extension: getFileExtension(path),
    size: 0,
    isText: true,
    language: getFileLanguage(path),
    source: "created",
  };
}

function getFileTypeLabel(file) {
  if (!file) return "No file selected";
  if (!file.isText) return "Binary";
  if (file.source === "created") return "New file";
  return file.extension ? file.extension.toUpperCase() : "Text";
}

function FileTypeIcon({ file }) {
  if (!file) return <File size={15} strokeWidth={1.8} />;
  if (file.extension === "json") return <FileJson2 size={15} strokeWidth={1.8} />;
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(file.extension)) {
    return <FileCode2 size={15} strokeWidth={1.8} />;
  }
  return <FileText size={15} strokeWidth={1.8} />;
}

function ArchiveTreeNode({
  node,
  depth,
  expandedFolders,
  selectedPath,
  dirtyFiles,
  onToggleFolder,
  onSelectFile,
}) {
  if (node.type === "folder") {
    const isExpanded = expandedFolders[node.path] !== false;

    return (
      <>
        <button
          type="button"
          className="archive-tree-row archive-tree-row--folder"
          style={{ "--tree-depth": depth }}
          aria-expanded={isExpanded}
          onClick={() => onToggleFolder(node.path)}
          title={node.path || "extension"}
        >
          <ChevronRight
            size={14}
            strokeWidth={1.8}
            className={`archive-tree-row__chevron ${isExpanded ? "archive-tree-row__chevron--open" : ""}`}
          />
          {isExpanded ? <FolderOpen size={15} strokeWidth={1.8} /> : <Folder size={15} strokeWidth={1.8} />}
          <span>{node.name}</span>
        </button>
        {isExpanded && node.children.map((child) => (
          <ArchiveTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedFolders={expandedFolders}
            selectedPath={selectedPath}
            dirtyFiles={dirtyFiles}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
          />
        ))}
      </>
    );
  }

  const isActive = node.path === selectedPath;
  const isDirty = Boolean(dirtyFiles[node.path]);

  return (
    <button
      type="button"
      className={`archive-tree-row archive-tree-row--file ${isActive ? "archive-tree-row--active" : ""}`}
      style={{ "--tree-depth": depth }}
      onClick={() => onSelectFile(node.path)}
      title={node.path}
    >
      <span className="archive-tree-row__spacer" aria-hidden="true" />
      <FileTypeIcon file={node.file} />
      <span>{node.name}</span>
      {isDirty && <span className="archive-tree-row__dirty" aria-label="Edited file" />}
    </button>
  );
}

function ArchiveExplorer({
  workspace,
  expandedFolders,
  selectedPath,
  dirtyFiles,
  onToggleFolder,
  onSelectFile,
  onCreateFile,
}) {
  return (
    <aside className="archive-explorer" aria-label="Parsed extension files">
      <div className="archive-explorer__header">
        <span>Files</span>
        <button type="button" className="archive-icon-button" onClick={onCreateFile}>
          <FilePlus size={15} strokeWidth={1.9} />
          <span>New</span>
        </button>
      </div>
      <div className="archive-explorer__tree">
        {workspace.tree.children.map((node) => (
          <ArchiveTreeNode
            key={node.path}
            node={node}
            depth={0}
            expandedFolders={expandedFolders}
            selectedPath={selectedPath}
            dirtyFiles={dirtyFiles}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
      <div className="archive-explorer__footer">
        <span>{workspace.files.length} files</span>
        <span>{formatFileSize(workspace.fileSize)}</span>
      </div>
    </aside>
  );
}

function SignedOutCodePreview() {
  const tabs = ["Overview", "Findings", "Code", "Changes", "Permissions", "Network", "Reputation"];

  return (
    <section className="scan-report-preview" aria-label="Private extension audit preview">
      <div className="scan-report-preview__shell">
        <div className="scan-report-preview__tabs">
          <nav aria-label="Audit preview sections">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`scan-report-preview__tab ${tab === "Overview" ? "scan-report-preview__tab--active" : ""}`}
              >
                <span>{tab}</span>
                {tab === "Findings" && <strong>7</strong>}
              </button>
            ))}
          </nav>
          <div className="scan-report-preview__actions">
            <button type="button" className="scan-report-preview__action">
              <Download size={16} strokeWidth={2} />
              <span>Export report</span>
            </button>
            <button type="button" className="scan-report-preview__icon-action" aria-label="More report actions">
              <MoreHorizontal size={18} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="scan-report-preview__body">
          <aside className="scan-report-preview__files" aria-label="Example extension files">
            <div className="scan-report-preview__files-header">
              <span>Files</span>
              <RefreshCw size={16} strokeWidth={1.8} />
            </div>
            <div className="scan-report-preview__tree">
              <button type="button" className="scan-preview-file-row scan-preview-file-row--folder" style={{ "--preview-depth": 0 }}>
                <ChevronRight size={14} strokeWidth={1.9} className="scan-preview-file-row__chevron scan-preview-file-row__chevron--open" />
                <span>extension</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--folder" style={{ "--preview-depth": 1 }}>
                <ChevronRight size={14} strokeWidth={1.9} className="scan-preview-file-row__chevron scan-preview-file-row__chevron--open" />
                <Folder size={16} strokeWidth={1.8} />
                <span>background</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file scan-preview-file-row--active" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>service_worker.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>api.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>storage.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>utils.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--folder" style={{ "--preview-depth": 1 }}>
                <ChevronRight size={14} strokeWidth={1.9} className="scan-preview-file-row__chevron scan-preview-file-row__chevron--open" />
                <Folder size={16} strokeWidth={1.8} />
                <span>content</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>content_script.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>inject.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--folder" style={{ "--preview-depth": 1 }}>
                <ChevronRight size={14} strokeWidth={1.9} className="scan-preview-file-row__chevron scan-preview-file-row__chevron--open" />
                <Folder size={16} strokeWidth={1.8} />
                <span>popup</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--html">&lt;&gt;</span>
                <span>popup.html</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--js">JS</span>
                <span>popup.js</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--css">#</span>
                <span>styles.css</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--folder" style={{ "--preview-depth": 1 }}>
                <ChevronRight size={14} strokeWidth={1.9} className="scan-preview-file-row__chevron scan-preview-file-row__chevron--open" />
                <Folder size={16} strokeWidth={1.8} />
                <span>options</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--html">&lt;&gt;</span>
                <span>options.html</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--file" style={{ "--preview-depth": 2 }}>
                <span className="scan-preview-file-row__type scan-preview-file-row__type--json">{"{}"}</span>
                <span>manifest.json</span>
              </button>
              <button type="button" className="scan-preview-file-row scan-preview-file-row--folder" style={{ "--preview-depth": 0 }}>
                <ChevronRight size={14} strokeWidth={1.9} />
                <Folder size={16} strokeWidth={1.8} />
                <span>Locales</span>
              </button>
            </div>
            <div className="scan-report-preview__files-footer">
              <span>512 files</span>
              <span>2.4 MB</span>
            </div>
          </aside>

          <main className="scan-report-preview__editor" aria-label="Example code editor">
            <div className="scan-report-preview__editor-header">
              <div className="scan-report-preview__breadcrumbs">
                <span>extension</span>
                <ChevronRight size={14} strokeWidth={1.8} />
                <span>background</span>
                <ChevronRight size={14} strokeWidth={1.8} />
                <span className="scan-report-preview__crumb--type">JS</span>
                <strong>service_worker.js</strong>
              </div>
              <span className="scan-report-preview__readonly">Read-only</span>
            </div>
            <Suspense fallback={<div className="audit-code-editor audit-code-editor--loading" aria-label="Loading code preview" />}>
              <AuditCodeEditor
                value={SAMPLE_AUDIT_CODE}
                language="javascript"
                readOnly
                firstDisplayLine={32}
                flaggedDisplayLine={44}
                ariaLabel="Read-only private build code preview"
              />
            </Suspense>
          </main>

          <aside className="scan-report-preview__details" aria-label="Example audit finding details">
            <article className="scan-report-preview__detail-card">
              <header className="scan-report-preview__detail-header">
                <span>Finding details</span>
                <strong>High</strong>
              </header>
              <div className="scan-report-preview__finding-title">
                <span aria-hidden="true" />
                <div>
                  <h2>Unvalidated fetch URL</h2>
                  <p>service_worker.js:43</p>
                </div>
              </div>
              <p className="scan-report-preview__finding-copy">
                The extension fetches data from a URL provided in a runtime message without validating or restricting the destination.
                This can allow attackers to exfiltrate sensitive data or interact with arbitrary endpoints.
              </p>
              <span className="scan-report-preview__cwe">CWE-918</span>
              <div className="scan-report-preview__recommendation">
                <span>Recommendation</span>
                <p>Validate the URL against an allowlist before making the request.</p>
              </div>
            </article>

            <article className="scan-report-preview__detail-card scan-report-preview__detail-card--version">
              <h2>Version comparison</h2>
              <div className="scan-report-preview__version-row">
                <span>Current</span>
                <strong className="scan-report-preview__version-pill scan-report-preview__version-pill--current">172.0</strong>
                <p>Uploaded just now</p>
              </div>
              <div className="scan-report-preview__version-row">
                <span>Previous</span>
                <strong className="scan-report-preview__version-pill scan-report-preview__version-pill--previous">171.3</strong>
                <p>5 days ago</p>
              </div>
              <button type="button" className="scan-report-preview__compare">Compare versions</button>
            </article>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default function ScanUploadPage() {
  const { isAuthenticated, openSignInModal } = useAuth();
  const fileInputRef = useRef(null);
  const zipRef = useRef(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [expandedFolders, setExpandedFolders] = useState({});
  const [fileContents, setFileContents] = useState({});
  const [dirtyFiles, setDirtyFiles] = useState({});
  const [uploadError, setUploadError] = useState("");
  const [selectedFileError, setSelectedFileError] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isLoadingSelectedFile, setIsLoadingSelectedFile] = useState(false);
  const [savedFiles, setSavedFiles] = useState({});
  const [isExporting, setIsExporting] = useState(false);

  const isPreviewMode = !isAuthenticated && new URLSearchParams(window.location.search).get("preview") === "uploaded";

  const selectedFile = useMemo(
    () => workspace?.files.find((file) => file.path === selectedPath) || null,
    [selectedPath, workspace]
  );

  const selectedFileContent = selectedPath ? fileContents[selectedPath] || "" : "";
  const editedFileCount = Object.keys(dirtyFiles).length;
  const savedFileCount = Object.keys(savedFiles).length;
  const hasModifiedFiles = editedFileCount > 0 || savedFileCount > 0;

  const clearWorkspace = useCallback(() => {
    zipRef.current = null;
    setWorkspace(null);
    setSelectedPath("");
    setExpandedFolders({});
    setFileContents({});
    setDirtyFiles({});
    setSavedFiles({});
    setUploadError("");
    setSelectedFileError("");
  }, []);

  const applyParsedWorkspace = useCallback(({ zip, workspace: parsedWorkspace }) => {
    const initialFile = pickInitialFile(parsedWorkspace.files);
    zipRef.current = zip;
    setWorkspace(parsedWorkspace);
    setExpandedFolders(collectFolderPaths(parsedWorkspace.tree));
    setFileContents({});
    setDirtyFiles({});
    setSavedFiles({});
    setSelectedFileError("");
    setSelectedPath(initialFile?.path || "");
  }, []);

  const applyFile = useCallback(
    async (file) => {
      if (!isAuthenticated) {
        openSignInModal();
        return;
      }

      if (!file) return;

      if (!isSupportedPrivateBuild(file)) {
        setUploadError(`Upload a CRX or ZIP file up to ${MAX_UPLOAD_SIZE_MB} MB.`);
        return;
      }

      setIsParsing(true);
      setUploadError("");
      setSelectedFileError("");

      try {
        const parsedArchive = await parsePrivateBuildFile(file);
        applyParsedWorkspace(parsedArchive);
      } catch (error) {
        zipRef.current = null;
        setWorkspace(null);
        setSelectedPath("");
        setFileContents({});
        setDirtyFiles({});
        setExpandedFolders({});
        setUploadError(error instanceof Error ? error.message : "Could not parse this archive.");
      } finally {
        setIsParsing(false);
      }
    },
    [applyParsedWorkspace, isAuthenticated, openSignInModal]
  );

  const handleUploadClick = useCallback(() => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    fileInputRef.current?.click();
  }, [isAuthenticated, openSignInModal]);

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target?.files?.[0];
      void applyFile(file);
      if (event.target) event.target.value = "";
    },
    [applyFile]
  );

  const handleDragEnter = useCallback((event) => {
    event.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragActive(false);
      void applyFile(event.dataTransfer?.files?.[0]);
    },
    [applyFile]
  );

  const toggleFolder = useCallback((path) => {
    setExpandedFolders((current) => ({
      ...current,
      [path]: current[path] === false,
    }));
  }, []);

  const handleEditorChange = useCallback(
    (nextValue) => {
      if (!selectedPath) return;

      setFileContents((current) => (
        current[selectedPath] === nextValue
          ? current
          : { ...current, [selectedPath]: nextValue }
      ));
      setDirtyFiles((current) => (
        current[selectedPath]
          ? current
          : { ...current, [selectedPath]: true }
      ));
    },
    [selectedPath]
  );

  const handleSaveFile = useCallback(() => {
    if (!selectedPath || !dirtyFiles[selectedPath]) return;
    setDirtyFiles((current) => {
      const next = { ...current };
      delete next[selectedPath];
      return next;
    });
    setSavedFiles((current) => ({ ...current, [selectedPath]: true }));
  }, [selectedPath, dirtyFiles]);

  const handleDownloadZip = useCallback(async () => {
    if (!workspace) return;
    setIsExporting(true);
    try {
      const newZip = new JSZip();
      for (const file of workspace.files) {
        if (fileContents[file.path] !== undefined) {
          newZip.file(file.zipPath, fileContents[file.path]);
        } else if (zipRef.current) {
          const entry = zipRef.current.file(file.zipPath);
          if (entry) {
            const content = await entry.async("uint8array");
            newZip.file(file.zipPath, content);
          }
        }
      }
      const blob = await newZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = workspace.fileName.replace(/\.(crx|zip)$/i, "-edited.zip");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [workspace, fileContents]);

  const createNewFile = useCallback(() => {
    if (!workspace) return;

    const existingPaths = new Set(workspace.files.map((file) => file.path));
    let candidate = "new_file.js";
    let index = 2;
    while (existingPaths.has(candidate)) {
      candidate = `new_file_${index}.js`;
      index += 1;
    }

    const newFile = createVirtualTextFile(candidate);

    setWorkspace((current) => {
      if (!current) return current;
      const files = sortFiles([...current.files, newFile]);
      const tree = buildFileTree(files);
      return {
        ...current,
        files,
        tree,
        textFileCount: files.filter((file) => file.isText).length,
        binaryFileCount: files.filter((file) => !file.isText).length,
      };
    });
    setFileContents((current) => ({ ...current, [candidate]: "" }));
    setDirtyFiles((current) => ({ ...current, [candidate]: true }));
    setExpandedFolders((current) => ({ ...current, ...collectFolderPaths(buildFileTree([newFile])) }));
    setSelectedPath(candidate);
  }, [workspace]);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFileError("");
      setIsLoadingSelectedFile(false);
      return undefined;
    }

    if (!selectedFile.isText) {
      setSelectedFileError("");
      setIsLoadingSelectedFile(false);
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(fileContents, selectedFile.path)) {
      setSelectedFileError("");
      setIsLoadingSelectedFile(false);
      return undefined;
    }

    const entry = zipRef.current?.file(selectedFile.zipPath);
    let cancelled = false;
    setIsLoadingSelectedFile(true);
    setSelectedFileError("");

    if (!entry) {
      setFileContents((current) => ({ ...current, [selectedFile.path]: "" }));
      setIsLoadingSelectedFile(false);
      return undefined;
    }

    entry.async("string")
      .then((content) => {
        if (cancelled) return;
        setFileContents((current) => ({ ...current, [selectedFile.path]: content }));
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedFileError("This file could not be decoded as text.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSelectedFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileContents, selectedFile]);

  useEffect(() => {
    if (!isPreviewMode || workspace) return;
    const { workspace: pw, initialContents } = buildPreviewWorkspace();
    setWorkspace(pw);
    setExpandedFolders(collectFolderPaths(pw.tree));
    setFileContents(initialContents);
    setSelectedPath(pickInitialFile(pw.files)?.path || "");
  }, [isPreviewMode, workspace]);

  const heroTitle = isAuthenticated
    ? "Upload a private CRX or ZIP build"
    : "Sign in to upload a private CRX or ZIP build";
  const heroCopy = isAuthenticated
    ? "Choose a build to inspect its files locally before scanning."
    : "We never store your file. Scans are private and results are only visible to your account.";
  const primaryButtonText = isParsing
    ? "Parsing build"
    : isAuthenticated
      ? workspace
        ? "Replace build"
        : "Choose CRX or ZIP"
      : "Sign in to upload";

  return (
    <div className="scan-upload-page">
      <SEOHead
        title="Private Extension Audit - Pre-release Chrome Extension Security Review | ExtensionShield"
        description="Upload a CRX or ZIP for a pre-release Chrome extension security audit: static analysis, permissions review, policy checks, and evidence-backed findings. Private by default."
        pathname="/scan/upload"
      />

      <section className="scan-upload-hero" aria-label="Private extension audit">
        <div
          className={`scan-upload-hero-card ${isDragActive ? "scan-upload-hero-card--dragging" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="scan-upload-hero-card__visual" aria-hidden="true">
            <LockKeyhole size={23} strokeWidth={2.15} />
          </div>

          <div className="scan-upload-hero-card__copy">
            <h1>{heroTitle}</h1>
            <p>{heroCopy}</p>
          </div>

          <div className="scan-upload-hero-card__actions">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_PRIVATE_BUILD_TYPES.join(",")}
              className="scan-upload-page__file-input"
              onChange={handleFileChange}
              disabled={isParsing}
            />
            <button
              type="button"
              className="scan-upload-primary"
              onClick={handleUploadClick}
              disabled={isParsing}
            >
              <UploadCloud size={17} strokeWidth={2.2} />
              <span>{primaryButtonText}</span>
            </button>
            {workspace && (
              <button type="button" className="scan-upload-ghost" onClick={clearWorkspace}>
                <X size={17} strokeWidth={2} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {uploadError && (
            <p className="scan-upload-hero-card__error" role="status">
              <AlertCircle size={15} strokeWidth={2} />
              <span>{uploadError}</span>
            </p>
          )}
        </div>
      </section>

      {(isAuthenticated || isPreviewMode) && (
        <section className={`archive-workspace ${isPreviewMode ? "archive-workspace--preview" : ""}`} aria-label="Private build file workspace">
          <div className="archive-workspace__shell">
            <div className="archive-workspace__topbar">
              <div>
                <span>File workspace</span>
                {isPreviewMode && <span className="archive-workspace__preview-tag">Preview</span>}
                <strong>{workspace?.fileName || "No build loaded"}</strong>
              </div>
              <div className="archive-workspace__meta">
                {workspace
                  ? `${workspace.archiveKind} / ${workspace.files.length} files / ${workspace.textFileCount} text / ${workspace.binaryFileCount} binary`
                  : "Drop a CRX or ZIP to begin"}
                {editedFileCount > 0 && <span>{editedFileCount} edited</span>}
                {hasModifiedFiles && (
                  <button type="button" className="archive-icon-button" onClick={handleDownloadZip} disabled={isExporting}>
                    <Download size={14} strokeWidth={2} />
                    <span>{isExporting ? "Exporting…" : "Export ZIP"}</span>
                  </button>
                )}
              </div>
            </div>

            {workspace ? (
              <div className="archive-workspace__body">
                <ArchiveExplorer
                  workspace={workspace}
                  expandedFolders={expandedFolders}
                  selectedPath={selectedPath}
                  dirtyFiles={dirtyFiles}
                  onToggleFolder={toggleFolder}
                  onSelectFile={setSelectedPath}
                  onCreateFile={createNewFile}
                />

                <main className="archive-editor" aria-label="Selected file editor">
                  <div className="archive-editor__header">
                    <div className="archive-editor__breadcrumbs">
                      {(selectedPath || "Select a file").split("/").filter(Boolean).map((part, index, parts) => (
                        <React.Fragment key={`${part}-${index}`}>
                          {index > 0 && <ChevronRight size={14} strokeWidth={1.8} />}
                          <span className={index === parts.length - 1 ? "archive-editor__crumb--active" : ""}>
                            {part}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="archive-editor__chips">
                      {selectedFile && dirtyFiles[selectedFile.path] && (
                        <>
                          <span className="archive-editor__chip archive-editor__chip--dirty">Edited</span>
                          <button type="button" className="archive-editor__chip archive-editor__chip--save" onClick={handleSaveFile}>
                            <Save size={12} strokeWidth={2.2} />
                            Save
                          </button>
                        </>
                      )}
                      {selectedFile && savedFiles[selectedFile.path] && !dirtyFiles[selectedFile.path] && (
                        <span className="archive-editor__chip archive-editor__chip--saved">Saved</span>
                      )}
                      <span className="archive-editor__chip">{getFileTypeLabel(selectedFile)}</span>
                      {selectedFile?.isText && <span className="archive-editor__chip">Editable</span>}
                    </div>
                  </div>

                  {selectedFile?.isText ? (
                    <Suspense fallback={<div className="audit-code-editor audit-code-editor--loading" aria-label="Loading code editor" />}>
                      <AuditCodeEditor
                        value={selectedFileContent}
                        language={selectedFile.language}
                        readOnly={isLoadingSelectedFile}
                        onChange={handleEditorChange}
                        ariaLabel={`Editor for ${selectedFile.path}`}
                      />
                    </Suspense>
                  ) : selectedFile ? (
                    <div className="archive-editor__empty">
                      <FileArchive size={28} strokeWidth={1.7} />
                      <h2>Binary file</h2>
                      <p>{selectedFile.path} is not shown in the editor. Text files can be opened and edited here.</p>
                      <span>{formatFileSize(selectedFile.size)}</span>
                    </div>
                  ) : (
                    <div className="archive-editor__empty">
                      <FileText size={28} strokeWidth={1.7} />
                      <h2>Select a file</h2>
                      <p>Choose a file from the explorer to inspect its contents.</p>
                    </div>
                  )}

                  {(isLoadingSelectedFile || selectedFileError) && (
                    <div className={`archive-editor__status ${selectedFileError ? "archive-editor__status--error" : ""}`}>
                      {selectedFileError || "Loading file..."}
                    </div>
                  )}
                </main>
              </div>
            ) : (
              <button
                type="button"
                className={`archive-dropzone ${isDragActive ? "archive-dropzone--dragging" : ""}`}
                onClick={handleUploadClick}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <FileArchive size={29} strokeWidth={1.8} />
                <strong>{isParsing ? "Parsing archive" : "Drop CRX/ZIP here"}</strong>
                <span>or choose a file to inspect the extension source tree</span>
              </button>
            )}
          </div>
        </section>
      )}

      {!isAuthenticated && !isPreviewMode && <SignedOutCodePreview />}

      <p className="scan-upload-footnote">
        <ShieldCheck size={15} strokeWidth={2} />
        <Link to="/scan">Or run a free extension risk check</Link>
        <ChevronRight size={15} strokeWidth={2} />
      </p>
    </div>
  );
}
