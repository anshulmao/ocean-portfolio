import {chromium} from 'playwright';

// One way to start the test browser. CI installs Playwright's own Chromium (`npx playwright install chromium`);
// elsewhere PLAYWRIGHT_CHROMIUM_PATH points at a Chromium binary, or PLAYWRIGHT_CHANNEL picks an installed browser.
export function launchBrowser(options = {}) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH, channel = process.env.PLAYWRIGHT_CHANNEL;
  return chromium.launch({...(executablePath ? {executablePath} : channel ? {channel} : {}), ...options});
}
