<p align="center">
  <img src="banner.webp" alt="pi-antigravity-quota" width="100%">
</p>

# Pi Antigravity Quota

An extension for [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent) that displays the remaining quota for your Google Cloud Code (Antigravity) subscription models.

## Features

- **Status Command**: Run `/quota` to see a beautiful, formatted list of all your available models and their remaining quota.
- **Visual Indicators**: Color-coded progress bars (Green/Yellow/Red) and icons to quickly show status.
- **Smart Filtering**: Automatically hides internal or deprecated models, keeping the dashboard clean.

## Installation

1.  Download or clone this repository into your pi extensions folder:
    ```bash
    cd ~/.pi/agent/extensions
    git clone https://github.com/ditfetzt/pi-antigravity-quota.git antigravity-quota
    ```

2.  Restart `pi`.

## Usage

-   **`/quota`**: Displays the quota dashboard.

## Configuration

The extension automatically reads your credentials from `~/.pi/agent/auth.json` (key: `google-antigravity`). No additional configuration is required if you are already signed in to Antigravity in Pi.

## License

MIT
