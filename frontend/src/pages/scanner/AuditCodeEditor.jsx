import React, { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/features/json/register";

const THEME_NAME = "extensionshield-audit-light";

let themeDefined = false;

if (typeof window !== "undefined") {
  window.MonacoEnvironment = {
    getWorker() {
      return new EditorWorker();
    },
  };
}

function defineTheme() {
  if (themeDefined) return;

  monaco.editor.defineTheme(THEME_NAME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "15803d" },
      { token: "keyword", foreground: "6d28d9" },
      { token: "string", foreground: "dc2626" },
      { token: "number", foreground: "b45309" },
      { token: "type.identifier", foreground: "1d4ed8" },
      { token: "identifier", foreground: "0f172a" },
    ],
    colors: {
      "editor.background": "#fffdfa",
      "editor.foreground": "#111827",
      "editorLineNumber.foreground": "#6b7280",
      "editorLineNumber.activeForeground": "#111827",
      "editor.lineHighlightBackground": "#00000000",
      "editor.selectionBackground": "#bbf7d044",
      "editor.inactiveSelectionBackground": "#bbf7d026",
      "editorCursor.foreground": "#15803d",
      "editorWhitespace.foreground": "#d1d5db",
      "editorGutter.background": "#fffdfa",
    },
  });

  themeDefined = true;
}

export default function AuditCodeEditor({
  value,
  language = "javascript",
  readOnly = true,
  onChange,
  firstDisplayLine = 1,
  flaggedDisplayLine = null,
  ariaLabel = "ExtensionShield code editor",
}) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const decorationsRef = useRef(null);
  const modelRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const isApplyingValueRef = useRef(false);
  const initialValueRef = useRef(value || "");
  const initialLanguageRef = useRef(language || "plaintext");
  const initialReadOnlyRef = useRef(readOnly);
  const initialFirstDisplayLineRef = useRef(firstDisplayLine);
  const initialFlaggedDisplayLineRef = useRef(flaggedDisplayLine);
  const initialAriaLabelRef = useRef(ariaLabel);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    defineTheme();

    const initialReadOnly = initialReadOnlyRef.current;
    const initialFirstDisplayLine = initialFirstDisplayLineRef.current;
    const initialFlaggedDisplayLine = initialFlaggedDisplayLineRef.current;
    const model = monaco.editor.createModel(initialValueRef.current, initialLanguageRef.current);
    const editor = monaco.editor.create(containerRef.current, {
      model,
      theme: THEME_NAME,
      readOnly: initialReadOnly,
      domReadOnly: initialReadOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      folding: true,
      glyphMargin: Boolean(initialFlaggedDisplayLine),
      lineDecorationsWidth: 18,
      lineNumbersMinChars: 3,
      lineNumbers: (lineNumber) => String(initialFirstDisplayLine + lineNumber - 1),
      renderLineHighlight: "none",
      renderValidationDecorations: "off",
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        horizontalScrollbarSize: 10,
        verticalScrollbarSize: 10,
      },
      scrollBeyondLastLine: false,
      roundedSelection: false,
      contextmenu: !initialReadOnly,
      selectionHighlight: false,
      occurrencesHighlight: "off",
      wordBasedSuggestions: "off",
      quickSuggestions: false,
      fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 24,
      padding: { top: 16, bottom: 18 },
      ariaLabel: initialAriaLabelRef.current,
    });

    const changeDisposable = editor.onDidChangeModelContent(() => {
      if (isApplyingValueRef.current) return;
      onChangeRef.current?.(editor.getValue());
    });

    editorRef.current = editor;
    modelRef.current = model;

    return () => {
      decorationsRef.current?.clear();
      changeDisposable.dispose();
      editor.dispose();
      model.dispose();
      decorationsRef.current = null;
      editorRef.current = null;
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const nextValue = value || "";
    if (editor.getValue() === nextValue) return;

    isApplyingValueRef.current = true;
    editor.setValue(nextValue);
    isApplyingValueRef.current = false;
  }, [value]);

  useEffect(() => {
    if (!modelRef.current) return;
    monaco.editor.setModelLanguage(modelRef.current, language || "plaintext");
  }, [language]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly,
      domReadOnly: readOnly,
      contextmenu: !readOnly,
    });
  }, [readOnly]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      glyphMargin: Boolean(flaggedDisplayLine),
      lineNumbers: (lineNumber) => String(firstDisplayLine + lineNumber - 1),
    });
  }, [firstDisplayLine, flaggedDisplayLine]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    decorationsRef.current?.clear();
    decorationsRef.current = null;

    if (!flaggedDisplayLine) return;

    const modelLine = Math.max(1, flaggedDisplayLine - firstDisplayLine + 1);
    decorationsRef.current = editor.createDecorationsCollection([
      {
        range: new monaco.Range(modelLine, 1, modelLine, 1),
        options: {
          isWholeLine: true,
          className: "audit-code-editor__line--flagged",
          glyphMarginClassName: "audit-code-editor__glyph--flagged",
          linesDecorationsClassName: "audit-code-editor__line-decoration--flagged",
        },
      },
    ]);
  }, [firstDisplayLine, flaggedDisplayLine]);

  return <div ref={containerRef} className="audit-code-editor" />;
}
