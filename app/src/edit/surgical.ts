import { parse, HTMLElement } from "node-html-parser";
import { validateDisclosure } from "../render/renderer.js";
import { complete } from "../convert/client.js";

export class AmbiguityError extends Error {
  candidates: string[];
  constructor(message: string, candidates: string[]) {
    super(message);
    this.name = "AmbiguityError";
    this.candidates = candidates;
  }
}

/**
 * Validates the safety and malformedness of the HTML fragment.
 * Throws an error if validation fails.
 */
export function validateHtmlSanity(html: string): void {
  // Check for basic unbalanced brackets first
  const openCount = (html.match(/</g) || []).length;
  const closeCount = (html.match(/>/g) || []).length;
  if (openCount !== closeCount) {
    throw new Error("Malformed HTML: unbalanced angle brackets");
  }

  // Use a stack to track open tags for tag-matching
  const stack: string[] = [];
  const selfClosing = new Set(["img", "br", "hr", "input", "meta", "link", "col"]);
  const tagRegex = /<(\/?)([a-zA-Z0-9-]+)(?:\s+[^>]*?)?>/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const isClosing = match[1] === "/";
    const rawTagName = match[2];
    if (!rawTagName) {
      continue;
    }
    const tagName = rawTagName.toLowerCase();

    if (selfClosing.has(tagName)) {
      if (isClosing) {
        throw new Error(`Malformed HTML: self-closing tag <${tagName}> should not have a closing tag`);
      }
      continue;
    }

    if (isClosing) {
      if (stack.length === 0) {
        throw new Error(`Malformed HTML: closing tag </${tagName}> has no matching opening tag`);
      }
      const top = stack.pop();
      if (top !== tagName) {
        throw new Error(`Malformed HTML: mismatched tags. Expected </${top}>, found </${tagName}>`);
      }
    } else {
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    throw new Error(`Malformed HTML: unclosed tags: ${stack.join(", ")}`);
  }

  // Check for unsafe elements
  const root = parse(html);
  const scripts = root.querySelectorAll("script");
  if (scripts.length > 0) {
    throw new Error("Unsafe HTML: contains <script> tag");
  }

  const allElements = root.querySelectorAll("*");
  for (const el of allElements) {
    // Check for inline event handlers (attributes starting with "on")
    const attrs = Object.keys(el.attributes);
    const hasEventHandler = attrs.some((attr) => attr.toLowerCase().startsWith("on"));
    if (hasEventHandler) {
      throw new Error("Unsafe HTML: contains inline event handlers");
    }

    // Check for layout-breaking/external elements
    const tag = el.tagName.toLowerCase();
    const forbidden = ["html", "head", "body", "iframe", "object", "embed", "link"];
    if (forbidden.includes(tag)) {
      throw new Error(`Unsafe HTML: forbidden layout-breaking or external element <${tag}>`);
    }
  }
}

/**
 * Checks if the instruction is ambiguous (e.g. contains "list" or "table" when multiple exist).
 * Throws AmbiguityError if ambiguous.
 */
export function checkAmbiguity(sectionHtml: string, instruction: string): void {
  const root = parse(sectionHtml);
  if (/list/i.test(instruction)) {
    const lists = root.querySelectorAll("ul, ol");
    if (lists.length > 1) {
      throw new AmbiguityError(
        "Ambiguous instruction: multiple lists found in the section.",
        lists.map((el) => el.toString())
      );
    }
  }
  if (/table/i.test(instruction)) {
    const tables = root.querySelectorAll("table");
    if (tables.length > 1) {
      throw new AmbiguityError(
        "Ambiguous instruction: multiple tables found in the section.",
        tables.map((el) => el.toString())
      );
    }
  }
}

/**
 * Verifies that the areas outside the target section remain unchanged.
 */
export function verifyContainment(originalHtml: string, modifiedHtml: string, sectionId: string): boolean {
  const originalRoot = parse(originalHtml);
  const modifiedRoot = parse(modifiedHtml);

  const originalTarget = originalRoot.getElementById(sectionId);
  const modifiedTarget = modifiedRoot.getElementById(sectionId);

  if (!originalTarget || !modifiedTarget) {
    return false;
  }

  originalTarget.remove();
  modifiedTarget.remove();

  return originalRoot.toString() === modifiedRoot.toString();
}

/**
 * Performs a direct HTML edit on a section of the document.
 */
export function performDirectHtmlEdit(
  html: string,
  sectionId: string,
  newSectionHtml: string,
  expectedSequence?: number,
  currentSequence?: number
): string {
  // 1. Sequence-based Concurrency Check
  if (expectedSequence !== undefined && currentSequence !== undefined && expectedSequence !== currentSequence) {
    throw new Error("Concurrency conflict: sequence mismatch");
  }

  // 2. Validate HTML sanity of the new section
  validateHtmlSanity(newSectionHtml);

  // 3. Parse and replace
  const root = parse(html);
  const targetElement = root.getElementById(sectionId);
  if (!targetElement) {
    throw new Error(`Element with ID ${sectionId} not found`);
  }

  const parsedNewSection = parse(newSectionHtml);

  // Make sure the new element has the correct ID
  let newElement = parsedNewSection.getElementById(sectionId);
  if (!newElement) {
    const firstEl = parsedNewSection.childNodes.find((node): node is HTMLElement => node instanceof HTMLElement);
    if (firstEl) {
      firstEl.setAttribute("id", sectionId);
      newElement = firstEl;
    }
  }

  targetElement.replaceWith(parsedNewSection);
  const finalHtml = root.toString();

  // 4. Validate progressive disclosure
  if (!validateDisclosure(finalHtml).valid) {
    throw new Error("Validation failed: Progressive disclosure checks violated");
  }

  // 5. 100% Containment verification
  if (!verifyContainment(html, finalHtml, sectionId)) {
    throw new Error("Containment check failed: elements outside of the target section were mutated");
  }

  return finalHtml;
}

/**
 * Performs a surgical edit using an LLM on a section of the document.
 */
export async function performSurgicalEdit(
  html: string,
  sectionId: string,
  instruction: string,
  expectedSequence?: number,
  currentSequence?: number
): Promise<string> {
  // 1. Sequence-based Concurrency Check
  if (expectedSequence !== undefined && currentSequence !== undefined && expectedSequence !== currentSequence) {
    throw new Error("Concurrency conflict: sequence mismatch");
  }

  // 2. Parse the HTML and find the targeted section
  const root = parse(html);
  const targetSection = root.getElementById(sectionId);
  if (!targetSection) {
    throw new Error(`Section with ID ${sectionId} not found`);
  }

  const sectionHtml = targetSection.toString();

  // 3. Ambiguity Resolution Check
  checkAmbiguity(sectionHtml, instruction);

  // 4. Query the fast edit LLM using complete()
  const systemPrompt = `
You are an expert technical editor.
Your task is to edit ONLY the provided HTML section based on the user's instruction.
Return ONLY the modified HTML section. Do not wrap the output in markdown code blocks, do not include any explanatory text, conversational filler, or introductory/concluding remarks. Just return the raw HTML of the modified section.
`.trim();

  const userPrompt = `
HTML Section to edit:
${sectionHtml}

Instruction:
${instruction}
`.trim();

  const editedRaw = await complete({
    role: "edit",
    system: systemPrompt,
    user: userPrompt,
  });

  // Clean the LLM output (remove markdown blocks if present)
  let editedHtml = editedRaw.trim();
  if (editedHtml.startsWith("```")) {
    editedHtml = editedHtml.replace(/^```[a-zA-Z0-9-]*\n/, "").replace(/\n```$/, "").trim();
  }

  // 5. Validate HTML sanity of the edited section
  validateHtmlSanity(editedHtml);

  // 6. Splice the returned HTML back into the document
  const parsedNewSection = parse(editedHtml);

  // Make sure the new element has the correct ID
  let newElement = parsedNewSection.getElementById(sectionId);
  if (!newElement) {
    const firstEl = parsedNewSection.childNodes.find((node): node is HTMLElement => node instanceof HTMLElement);
    if (firstEl) {
      firstEl.setAttribute("id", sectionId);
      newElement = firstEl;
    }
  }

  targetSection.replaceWith(parsedNewSection);
  const finalHtml = root.toString();

  // 7. Validate progressive disclosure
  if (!validateDisclosure(finalHtml).valid) {
    throw new Error("Validation failed: Progressive disclosure checks violated");
  }

  // 8. 100% Containment verification
  if (!verifyContainment(html, finalHtml, sectionId)) {
    throw new Error("Containment check failed: elements outside of the target section were mutated");
  }

  return finalHtml;
}

// Re-export pure endpoint helpers so htmlcollab-app/edit exposes them.
export { validateEditRequest, validateLlmSectionResult, simulateEdit } from './editEndpointHelpers.js';
export type { EditRequest, ValidationError } from './editEndpointHelpers.js';
