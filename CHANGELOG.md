# Changelog

## [1.4.0] - 2025-12-07
### Added
- **3-State Theme Toggle**: Theme button now cycles through Auto, Light, and Dark modes.
    - **Auto Mode**: Automatically follows system theme preference (indicated by star icon with 'A').
    - **Light Mode**: Forces light theme regardless of system settings.
    - **Dark Mode**: Forces dark theme regardless of system settings.
    - Theme preference is saved and persists across sessions.
    - System theme changes are detected and applied automatically when in Auto mode.

## [1.3.9] - 2025-12-07
### Changed
- **Translation**: Complete English translation of the extension (UI, messages, and documentation).
- **Mode UI**: Enhanced visual explanation of Manual vs Auto modes with clear status labels and descriptions.

## [1.3.8] - 2025-12-07
### Added
- **Global Toggle**: Added a main switch to completely enable/disable the extension.
    - State is saved via `chrome.storage` and persists across sites and restarts.
    - When disabled, the popup UI is grayed out and all highlighting features are functionality disabled.
    - The selection tooltip is no longer shown when the extension is disabled.
### Changed
- **UI Refinements**: Improved global toggle graphics and introduced a minimalist custom scrollbar.
- **Internal**: Centralized version management. Now dynamically read from `manifest.json`.

## [1.3.7] - 2025-11-28
### Changed
- Reverted to original icon (`icon.png`) for all sizes to ensure compatibility.

## [1.3.6] - 2025-11-28
### Changed
- Updated extension icon to new design provided by user.

## [1.3.5] - 2025-11-28
### Changed
- **Material 3 Icon**: Updated extension icon to Material Design 3 style with a much larger, more prominent highlighter symbol (70-80% of icon space) for maximum visibility.

## [1.3.4] - 2025-11-28
### Fixed
- **Icon Visibility**: Fixed extension icon visibility issue by using proper PNG format with a solid bright yellow background and high-contrast black highlighter icon. Chrome extensions require PNG format for icons.

## [1.3.3] - 2025-11-28
### Changed
- **Icon Update**: Updated the extension icon to a **Dark Theme** version (Yellow Highlighter on Dark Circle) to ensure high visibility on all browser themes and fix visibility issues in Chrome.

## [1.3.2] - 2025-11-28
### Fixed
- **Critical Bug Fix**: Fixed syntax errors in `content.js` that completely broke both automatic and manual highlighting modes.
    - Removed malformed code block with typo (`imeout` instead of `setTimeout`).
    - Restored proper logic for automatic mode (immediate highlighting) and manual mode (tooltip menu display).
    - Fixed broken event listener preventing tooltip from closing on click.

## [1.3.1] - 2025-11-28
### Fixed
- **Inter-line Artifacts**: Fixed an issue where invisible whitespace/newlines between lines (e.g., in lists) were highlighted, creating ugly vertical bars. The highlighter now intelligently skips whitespace-only nodes.

## [1.3.0] - 2025-11-27
### Added
- **Smart Readability Mode**: Implemented a "Force Black Text" strategy.
    - Highlights now always use **Light/Pastel** color variants.
    - Highlighted text is forced to **Black (#000000)** with no shadow.
    - This ensures perfect contrast and readability on both light and dark backgrounds.

## [1.2.3] - 2025-11-27
### Changed
- **Dark Mode Tints**: Significantly intensified the background tint colors in Dark Mode to make the selected theme more visible and aesthetically pleasing.

## [1.2.2] - 2025-11-27
### Fixed
- **Multi-line Layout Bug**: Fixed a critical issue where highlighting text across multiple paragraphs or blocks would break the page layout. Implemented a recursive text-node walker to wrap text safely without disturbing the DOM structure.

## [1.2.1] - 2025-11-27
### Changed
- **Deep Theming**: The popup background and section headers now subtly tint to match the selected highlighter color.
- **UI Cleanup**: Removed the arrow icon next to the "Manuale" label and adjusted spacing for a cleaner look.

## [1.2.0] - 2025-11-27
### Added
- **Dynamic Theming**: Restored "Material You" style theming. The extension's UI (icons, toggles, rings) now adapts to the selected highlighter color.

## [1.1.2] - 2025-11-27
### Fixed
- **Highlight Merging**: Fixed an issue where overlapping highlights created nested spans. Now, highlighting over existing highlights correctly merges them into a single block.

## [1.1.1] - 2025-11-27
### Fixed
- **Color Overlap**: Fixed a bug where changing the color of an existing highlight would stack colors instead of replacing them.
- **Tooltip Persistence**: Fixed an issue where the selection tooltip would remain visible after clicking away or selecting a color.

## [1.1.0] - 2025-11-27
### Changed
- **Complete Refactor**: Rewrote the entire extension from React/Vite to Native Vanilla JS, HTML, and CSS for better performance, smaller size, and easier maintenance.
- **New UI**: Implemented a new, lightweight popup UI with Dark Mode support.

## [1.0.0] - 2025-11-27
### Initial
- Initial release (React/Vite based).
