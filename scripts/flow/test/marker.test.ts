import { describe, expect, test } from "bun:test";
import { headlessResultText, parseTaskIdMarker } from "../src/marker.ts";

describe("parseTaskIdMarker", () => {
  test("reads the ID from a marker line", () => {
    expect(parseTaskIdMarker("✅ Done!\nTASK_ID: task_abc123")).toBe("task_abc123");
  });

  test("returns undefined when there's no marker", () => {
    expect(parseTaskIdMarker("✅ Done!\n- **Task:** [Fix it](https://app.getport.io/...)")).toBe(
      undefined,
    );
  });

  test("ignores markdown decoration and trailing punctuation", () => {
    expect(parseTaskIdMarker("**TASK_ID:** `task_x-1`.")).toBe("task_x-1");
    expect(parseTaskIdMarker("> TASK_ID: task_quoted")).toBe("task_quoted");
  });

  test("doesn't match the marker mid-sentence", () => {
    expect(parseTaskIdMarker("I will print TASK_ID: task_nope at the end")).toBe(undefined);
  });

  test("takes the last marker when there are several", () => {
    expect(parseTaskIdMarker("TASK_ID: task_first\nmore text\nTASK_ID: task_last\n")).toBe(
      "task_last",
    );
  });
});

describe("headlessResultText", () => {
  test("unwraps the result of --output-format json", () => {
    const stdout = JSON.stringify({ type: "result", result: "hello\nTASK_ID: task_1" });
    expect(headlessResultText(stdout)).toBe("hello\nTASK_ID: task_1");
  });

  test("falls back to the raw output when it isn't JSON", () => {
    expect(headlessResultText("Error: not logged in")).toBe("Error: not logged in");
  });
});
