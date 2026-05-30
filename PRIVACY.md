# Privacy Policy — LinkedIn Toolkit Chrome Extension

**Last updated:** May 2024

## Overview

LinkedIn Toolkit is a Chrome browser extension that helps you manage your LinkedIn profile. This policy explains what data the extension accesses and how it is used.

## Data Collection

**LinkedIn Toolkit does not collect, store, or transmit any personal data to external servers.**

All processing happens entirely within your browser.

## What the extension accesses

| Data | Purpose | Leaves your device? |
|---|---|---|
| LinkedIn page DOM | To scan skill names from the current page | ❌ No |
| Edit link URLs | To automate the delete skill workflow | ❌ No |
| Deletion progress | Stored in `chrome.storage.local` for UI state | ❌ No |

## Permissions Explained

- **`activeTab`** — Reads the currently open LinkedIn tab to scan skills
- **`scripting`** — Injects small scripts to scan the DOM and click UI elements
- **`storage`** — Saves deletion progress locally so it survives the popup closing
- **`tabs`** — Checks the target tab still exists before each deletion step
- **`https://www.linkedin.com/*`** — Restricts the extension to LinkedIn pages only

## Third-Party Services

None. The extension makes no network requests of its own.

## Changes to This Policy

Any updates will be reflected in this file in the GitHub repository.

## Contact

For questions or concerns, open an issue on [GitHub](https://github.com/igotlinux/linkedin-toolkit/issues).
