export const copyTextToClipboard = async (
  text: string,
  options?: {
    fallbackInput?: HTMLInputElement | null;
  }
): Promise<boolean> => {
  // 1) Modern API (may be unavailable on HTTP / some browsers / restricted contexts)
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  // 2) Fallback: select an existing read-only input (preferred)
  try {
    const fallbackInput = options?.fallbackInput;
    if (fallbackInput) {
      fallbackInput.focus();
      fallbackInput.select();
      try {
        fallbackInput.setSelectionRange(0, fallbackInput.value.length);
      } catch {
        // ignore
      }

      if (typeof document.execCommand === 'function') {
        const ok = document.execCommand('copy');
        return Boolean(ok);
      }
    }
  } catch {
    // fall through
  }

  // 3) Last resort fallback: temporary textarea
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(textarea);

    return Boolean(ok);
  } catch {
    return false;
  }
};
