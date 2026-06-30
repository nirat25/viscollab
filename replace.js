const fs = require('fs');
const file = 'web/src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import CommentSidebar from "../components/CommentSidebar";',
  'import CommentSidebar from "../components/CommentSidebar";\nimport SurgicalEditSandbox from "../components/SurgicalEditSandbox";'
);

content = content.replace(
  /const \[sandboxPrompt, setSandboxPrompt\].*?setSandboxError\(""\);\n/s,
  ""
);

content = content.replace(
  /\/\/ AI Surgical Edit Simulation\n  const handleOpenAiEdit.*syncState\(newVersions, nextVersionNum, updatedComments, verdicts\);\n  };/s,
  `// AI Surgical Edit Simulation
  const handleOpenAiEdit = (sectionId: string) => {
    setSandboxSectionId(sectionId);
  };

  const handleSurgicalCommit = (newHtml: string) => {
    if (!sandboxSectionId || !currentUser) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentVersion.html, "text/html");
    const targetEl = doc.getElementById(sandboxSectionId);
    if (targetEl) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = newHtml;
      const newEl = tempDiv.firstElementChild;
      if (newEl) {
        targetEl.replaceWith(newEl);
      }
    }

    const updatedHtml = doc.body.innerHTML;
    const nextVersionNum = documentVersions.length + 1;

    const newVersion = {
      versionNumber: nextVersionNum,
      html: updatedHtml,
      status: "Draft" as const,
      timestamp: new Date().toISOString()
    };

    const newVersions = [...documentVersions, newVersion];
    setDocumentVersions(newVersions);
    setActiveVersionNum(nextVersionNum);

    const containerDiv = document.createElement("div");
    containerDiv.innerHTML = updatedHtml;
    
    const updatedComments = comments.map(c => {
      if (c.lifecycle === "resolved") return c;
      const locateResult = locate(containerDiv, c);
      
      const hasReanchored = locateResult.status !== c.anchorStatus;
      const historyUpdate = hasReanchored 
        ? [{ event: \`re-anchored to status: \${locateResult.status} due to v\${nextVersionNum} edit\`, who: "System", when: Date.now() }]
        : [];

      return {
        ...c,
        anchorStatus: locateResult.status,
        posStart: locateResult.status !== "orphaned" ? locateResult.start : undefined,
        posEnd: locateResult.status !== "orphaned" ? locateResult.end : undefined,
        lastKnownContext: locateResult.newText || locateResult.newSnippet || c.lastKnownContext,
        history: [...c.history, ...historyUpdate]
      };
    });

    setComments(updatedComments);
    setSandboxSectionId(null);
    syncState(newVersions, nextVersionNum, updatedComments, verdicts);
  };`
);

content = content.replace(
  /\{\/\* AI Surgical Sandbox Modal \*\/\}\n\s+\{sandboxSectionId && \(\n\s+<div className="fixed inset-0.*?\{\/\* Convert New Document Modal \*\/\}/s,
  `{/* AI Surgical Sandbox Modal */}
      {sandboxSectionId && (
        <SurgicalEditSandbox
          sectionId={sandboxSectionId}
          originalHtml={
            new DOMParser().parseFromString(currentVersion.html, "text/html").getElementById(sandboxSectionId)?.outerHTML || ""
          }
          isOpen={!!sandboxSectionId}
          onClose={() => setSandboxSectionId(null)}
          onCommit={handleSurgicalCommit}
        />
      )}

      {/* Convert New Document Modal */}`
);

fs.writeFileSync(file, content);
