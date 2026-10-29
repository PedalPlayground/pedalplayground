/**
 * Props for text fields that are not part of sign-in: turns off browser autofill, autocorrect and
 * spellcheck, and asks password managers (1Password, LastPass, Dashlane) not to offer to fill them.
 */
export const plainField = {
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-form-type": "other",
} as const;
