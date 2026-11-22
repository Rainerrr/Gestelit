import { Fragment, type ReactNode } from "react";
import { readableHebrewDates } from "@/lib/format/hebrew";

/** Isolate Latin identifiers/numbers without changing their value or HTML-escaping behavior. */
export function BidiText({ text }: { text: string }) {
  const parts = text.split(/([A-Za-z][A-Za-z0-9]*(?:[ ._/-][A-Za-z0-9]+)*|\d+(?:[.,:/-]\d+)*(?:%|₪)?)/g);
  return <>{parts.map((part, i) => i % 2 ? <bdi key={i} dir="ltr" className="[overflow-wrap:anywhere]">{part}</bdi> : <Fragment key={i}>{part}</Fragment>)}</>;
}

function Inline({ text }: { text: string }) {
  return <>{readableHebrewDates(text).split(/(\*\*[\s\S]+?\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-foreground"><BidiText text={part.slice(2, -2)}/></strong> :
    part.startsWith("`") && part.endsWith("`") ? <code key={i} className="rounded bg-muted px-1 text-[0.9em]"><BidiText text={part.slice(1, -1)}/></code> : <BidiText key={i} text={part}/>)}</>;
}
const listLine = /^\s*(?:[-•*]|\d+[.)])\s+/;
const stripList = (line: string) => line.replace(listLine, "");
const cells = (line: string) => stripList(line).trim().replace(/^\|\s*|\s*\|$/g, "").split(/\s*\|\s*/);
const separator = (line: string) => cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
// Models sometimes combine a job/customer pipe with labeled em-dash fields.
// Normalize only those record rows; ordinary prose and date ranges stay intact.
const recordFields = (line: string) => cells(line.includes("|")
  ? line.replace(/\*\*/g, "").replace(/\s+[—–]\s+(?=[^:—–|\n]{1,40}:)/g, " | ")
  : line);

function RecordCard({ fields, headers }: { fields: string[]; headers?: string[] }) {
  return <div className="min-w-0 rounded-xl border border-border bg-card p-3.5">
    {headers ? <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">{fields.map((field, i) => <div key={i} className="min-w-0"><dt className="text-xs text-muted-foreground"><Inline text={headers[i] ?? ""}/></dt><dd className="font-medium"><Inline text={field}/></dd></div>)}</dl> : <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/60 pb-2"><span className="font-semibold text-primary"><Inline text={fields[0]}/></span><span className="font-medium"><Inline text={fields[1]}/></span></div>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">{fields.slice(2).map((field, i) => {
        const colon = field.indexOf(":");
        return <div key={i} className="min-w-0">{colon >= 0 && <dt className="text-xs text-muted-foreground"><Inline text={field.slice(0, colon)}/></dt>}<dd className="font-medium"><Inline text={colon >= 0 ? field.slice(colon + 1).trim() : field}/></dd></div>;
      })}</dl>
    </>}
  </div>;
}

/** Small, safe text renderer: no raw HTML, links, images, or executable Markdown. */
export function AnswerText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|") && separator(lines[i + 1])) {
      const headers = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(<div key={blocks.length} className="grid gap-2" role="group" aria-label="נתוני ההשוואה">{rows.map((row, index) => <RecordCard key={index} fields={row} headers={headers}/>)}</div>);
      continue;
    }
    if (recordFields(line).length >= 3) {
      const rows: string[][] = [];
      while (i < lines.length && recordFields(lines[i]).length >= 3) rows.push(recordFields(lines[i++]));
      blocks.push(<div key={blocks.length} className="grid gap-2">{rows.map((row, index) => <RecordCard key={index} fields={row}/>)}</div>);
      continue;
    }
    if (/^#{1,4}\s/.test(line)) { blocks.push(<h3 key={blocks.length} className="pt-1 font-semibold"><Inline text={line.replace(/^#{1,4}\s+/, "")}/></h3>); i++; continue; }
    if (listLine.test(line)) {
      const rows: string[] = [];
      const ordered = /^\d+[.)]/.test(line);
      while (i < lines.length && listLine.test(lines[i]) && recordFields(lines[i]).length < 3) rows.push(stripList(lines[i++]));
      const items = rows.map((row, index) => <li key={index} className="ps-1"><Inline text={row}/></li>);
      blocks.push(ordered ? <ol key={blocks.length} className="list-decimal space-y-2 ps-5 marker:text-muted-foreground">{items}</ol> : <ul key={blocks.length} className="list-disc space-y-2 ps-5 marker:text-primary/60">{items}</ul>);
      continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !listLine.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && recordFields(lines[i]).length < 3) paragraph.push(lines[i++]);
    blocks.push(<p key={blocks.length} className="whitespace-pre-wrap"><Inline text={paragraph.join("\n")}/></p>);
  }
  return <div dir="rtl" className="min-w-0 space-y-4 text-start text-[14px] leading-[1.85] [overflow-wrap:anywhere]">{blocks}</div>;
}
