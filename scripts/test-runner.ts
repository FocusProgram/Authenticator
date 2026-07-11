// Runs tests via puppeteer. Do not compile using webpack.

import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import os from "os";
import merge from "lodash/merge";

interface MochaTestResults {
  total?: number;
  tests?: StrippedTestResults[];
  completed?: boolean;
}

interface StrippedTestResults {
  title: string;
  duration: number;
  path: string[];
  err?: string;
  status: "failed" | "passed" | "pending";
}

declare global {
  interface Window {
    __mocha_test_results__: MochaTestResults;
  }
}
interface TestDisplay {
  [key: string]: TestDisplay | StrippedTestResults;
}

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

const debug = (message: string) => {
  if (process.env.ENABLE_CONSOLE) {
    console.log(`[test-runner] ${message}`);
  }
};

async function closeBrowser(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>
) {
  const browserProcess = browser.process();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      browser.close(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Browser did not close within 5 seconds.")),
          5000
        );
      }),
    ]);
  } catch (error) {
    browserProcess?.kill("SIGKILL");
    console.warn(
      `[test-runner] ${
        error instanceof Error ? error.message : "Unable to close browser."
      } Forced the test browser to stop.`
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runTests() {
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "authenticator-tests-")
  );
  const puppeteerArgs: string[] = [
    `--load-extension=${path.resolve(__dirname, "../test/chrome")}`,
    // for CI
    "--no-sandbox",
    "--lang=en-US,en",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--disable-crashpad",
  ];

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    debug("Launching browser...");
    browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--disable-extensions"],
      args: puppeteerArgs,
      // Set HEADLESS=true for environments where the new headless mode
      // supports extension pages; interactive runs remain the default.
      headless: process.env.HEADLESS === "true",
      executablePath: process.env.PUPPETEER_EXEC_PATH,
      userDataDir: profileDirectory,
      env: {
        ...process.env,
        HOME: profileDirectory,
      },
      timeout: 20000,
    });
    debug("Browser launched.");
    const mochaPage = await browser.newPage();
    let pageErrorDetected = false;
    mochaPage.on("pageerror", (error) => {
      pageErrorDetected = true;
      console.error(`Test page error: ${error.message}`);
    });

    // By setting this env var, console logging works for both components and testing.
    if (process.env.ENABLE_CONSOLE) {
      mochaPage.on("console", (consoleMessage) => {
        console.log(consoleMessage.text());
      });
    }

    debug("Opening extension test page...");
    await mochaPage.goto(
      "chrome-extension://bhghoamapcdpbohphigoooaddinpkbai/view/test.html",
      { waitUntil: "load", timeout: 20000 }
    );
    debug("Waiting for tests to finish...");

    let timeoutId: ReturnType<typeof setTimeout>;
    const results = await Promise.race([
      mochaPage.evaluate(() => {
        return new Promise<{ testResults: MochaTestResults }>((resolve) => {
          const finish = () => {
            resolve({
              testResults: window.__mocha_test_results__,
            });
          };
          window.addEventListener("testsComplete", finish, { once: true });
          if (window.__mocha_test_results__?.completed) {
            finish();
          }
        });
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Tests did not finish within 60 seconds.")),
          60000
        );
      }),
    ]);
    clearTimeout(timeoutId!);

    let failedTest = pageErrorDetected;
    let display: TestDisplay = {};
    if (results?.testResults.tests) {
      for (const test of results.testResults.tests) {
        let tmp: TestDisplay = {};
        test.path.reduce((acc, current, index) => {
          return (acc[current] = test.path.length - 1 === index ? test : {});
        }, tmp);
        display = merge(display, tmp);
      }
    }

    const printDisplayTests = (display: TestDisplay | StrippedTestResults) => {
      for (const key in display) {
        if (typeof display[key].status === "string") {
          const test = display[key];
          switch (test.status) {
            case "passed":
              console.log(`${colors.green}✓${colors.reset} ${test.title}`);
              break;
            case "failed":
              console.log(`${colors.red}✗ ${test.title}${colors.reset}`);
              if (test.err) {
                console.log(test.err);
              }
              failedTest = true;
              break;
            case "pending":
              console.log(`- ${test.title}`);
              break;
          }
        } else {
          console.log(key);
          console.group();
          printDisplayTests(display[key]);
        }
      }
      console.groupEnd();
    };
    printDisplayTests(display);
    if (!results?.testResults.completed) {
      console.error("Test reporter did not mark the run as completed.");
      failedTest = true;
    }
    if (
      typeof results?.testResults.total === "number" &&
      results.testResults.tests?.length !== results.testResults.total
    ) {
      console.error(
        `Expected ${results.testResults.total} test results, received ${
          results.testResults.tests?.length || 0
        }.`
      );
      failedTest = true;
    }
    process.exitCode = failedTest ? 1 : 0;
  } finally {
    if (browser) {
      debug("Closing browser...");
      await closeBrowser(browser);
    }
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
