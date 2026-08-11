export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof document === "undefined") return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Some embedded and mobile browsers expose Clipboard API but deny writes.
  }

  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.insetInlineStart = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}
