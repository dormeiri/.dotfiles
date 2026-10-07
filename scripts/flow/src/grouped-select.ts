import { stripVTControlCharacters, styleText } from "node:util";
import { AutocompletePrompt, isCancel, settings } from "@clack/core";
import {
  limitOptions,
  S_BAR,
  S_BAR_END,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  symbol,
} from "@clack/prompts";
import type { Choice } from "./effects.ts";

// Headings are disabled rows, so the cursor skips them; they stay listed while a member matches.
interface Row {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  members?: Row[];
}

const PLACEHOLDER = "Type to filter…";

function matches(search: string, row: Row): boolean {
  const text = `${stripVTControlCharacters(row.label)} ${row.hint ?? ""} ${row.value}`;
  return text.toLowerCase().includes(search.toLowerCase());
}

function toRows(choices: Choice<string>[]): Row[] {
  const rows: Row[] = [];
  let heading: Row | undefined;
  for (const { value, label, hint, group } of choices) {
    const row: Row = { value, label, hint };
    if (group === undefined) heading = undefined;
    else if (group !== heading?.label) {
      heading = { value: `\0group:${group}`, label: group, disabled: true, members: [] };
      rows.push(heading);
    }
    heading?.members?.push(row);
    rows.push(row);
  }
  return rows;
}

// clack's autocomplete with group headings, which it can only render as struck-through options.
export async function groupedSelect<T extends string>(
  message: string,
  choices: Choice<T>[],
): Promise<T | undefined> {
  const rows = toRows(choices);
  const first = rows.find((row) => !row.members);
  if (!first) return undefined;
  const prompt = new AutocompletePrompt<Row>({
    options: rows,
    initialValue: [first.value],
    placeholder: PLACEHOLDER,
    filter: (search, row) =>
      row.members ? row.members.some((member) => matches(search, member)) : matches(search, row),
    render() {
      const guide = settings.withGuide;
      const title = `${symbol(this.state)}  ${message}`;
      const head = guide ? [styleText("gray", S_BAR), title] : [title];
      const doneBar = guide ? styleText("gray", S_BAR) : "";
      switch (this.state) {
        case "submit": {
          const picked = rows.find((row) => row.value === this.selectedValues[0]);
          const label = picked ? stripVTControlCharacters(picked.label) : "";
          return [...head, `${doneBar}  ${styleText("dim", label)}`].join("\n");
        }
        case "cancel": {
          const input = this.userInput ? styleText(["strikethrough", "dim"], this.userInput) : "";
          return [...head, `${doneBar}  ${input}`].join("\n");
        }
        default: {
          const color = this.state === "error" ? "yellow" : "cyan";
          const bar = guide ? `${styleText(color, S_BAR)}  ` : "";
          const input =
            this.isNavigating || this.userInput === ""
              ? ` ${styleText("dim", this.userInput || PLACEHOLDER)}`
              : ` ${this.userInputWithCursor}`;
          const shown = this.filteredOptions.filter((row) => !row.members).length;
          const count =
            this.filteredOptions.length === rows.length
              ? ""
              : styleText("dim", ` (${shown} match${shown === 1 ? "" : "es"})`);
          const lines = [...head, ...(guide ? [bar.trimEnd()] : [])];
          lines.push(`${bar}${styleText("dim", "Search:")}${input}${count}`);
          if (shown === 0 && this.userInput) {
            lines.push(`${bar}${styleText("yellow", "No matches found")}`);
          }
          if (this.state === "error") lines.push(`${bar}${styleText("yellow", this.error)}`);
          const keys = [
            `${styleText("dim", "↑/↓")} to select`,
            `${styleText("dim", "Enter:")} confirm`,
            `${styleText("dim", "Type:")} to search`,
          ];
          const footer = [`${bar}${keys.join(" • ")}`, guide ? styleText(color, S_BAR_END) : ""];
          const options = limitOptions({
            cursor: this.cursor,
            options: this.filteredOptions,
            columnPadding: guide ? 3 : 0,
            rowPadding: lines.length + footer.length,
            style: (row, active) => {
              if (row.members) return styleText("bold", row.label);
              if (!active) return `  ${styleText("dim", S_RADIO_INACTIVE)} ${row.label}`;
              const hint = row.hint ? styleText("dim", ` (${row.hint})`) : "";
              return `  ${styleText("green", S_RADIO_ACTIVE)} ${row.label}${hint}`;
            },
          });
          return [...lines, ...options.map((line) => `${bar}${line}`), ...footer].join("\n");
        }
      }
    },
  });
  const answer = await prompt.prompt();
  return isCancel(answer) || typeof answer !== "string" ? undefined : (answer as T);
}
