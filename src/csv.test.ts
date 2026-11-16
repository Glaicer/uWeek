import { expect, test } from "vitest";
import { csvHeaders, prepareCsv } from "./csv";

const header = csvHeaders.join(",") + "\n";

test("CSV preserves literal notes, source fields and logical record numbers with BOM and CRLF", async () => {
  const preview = await prepareCsv(
    new Blob([
      '\uFEFFList,Completed,Checklist,Notes,Task,Date\r\n,,,,,\r\n, true ,,"Line one\r\n""<script>literal</script>""",  Read  ,2035-02-28\r\n',
    ]),
  );
  expect(preview.emptyRecords).toBe(1);
  expect(preview.records).toEqual([
    {
      recordNumber: 3,
      fields: {
        Date: "2035-02-28",
        Task: "  Read  ",
        Notes: 'Line one\r\n"<script>literal</script>"',
        Checklist: "",
        Completed: " true ",
        List: "",
      },
      title: "Read",
      notes: 'Line one\r\n"<script>literal</script>"',
      date: "2035-02-28",
      listTitle: undefined,
      completed: true,
    },
  ]);
});

test("undated tasks default to Inbox and byte changes have distinct fingerprints", async () => {
  const text = header + ",Read,,,false,\n,Read,,,false,\n";
  const original = await prepareCsv(new Blob([text]));
  expect(original.listTitles).toEqual(["Inbox"]);
  expect(original.duplicateOccurrences).toBe(1);
  expect(original.undated).toBe(2);
  expect(original.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect((await prepareCsv(new Blob([text]))).fingerprint).toBe(
    original.fingerprint,
  );
  for (const changed of ["\uFEFF" + text, text.replaceAll("\n", "\r\n")])
    expect((await prepareCsv(new Blob([changed]))).fingerprint).not.toBe(
      original.fingerprint,
    );
});

test.each([
  ["Date,Task,Notes,Checklist,Completed,Task\n", "Record 1: Expected exactly"],
  ["Date,Task,Notes,Checklist,Completed,Other\n", "Record 1: Expected exactly"],
  ["Date,Task,Notes,Completed,List\n", "Record 1: Expected exactly"],
  [header + "2035-02-29,Read,,,false,", "Record 2: Invalid calendar Date"],
  [header + "2035-02-28,Read,,,false,Books", "Record 2: Ambiguous placement"],
  [header + ",Read,,item,false,", "Record 2: Non-empty Checklist"],
  [header + ",Read,,,,", "Record 2: Completed must be TRUE or FALSE"],
  [header + ",   ,,,false,", "Record 2: Empty Task"],
  [header + ",Read,,,false", "Record 2: Expected six fields"],
  [header + ',Read,"unclosed,,false,', "Record 2: Malformed CSV"],
  [header + ',Re"ad,,,false,', "Record 2: Malformed CSV"],
  [
    header + ',Read,"two\nlines",,false,\n,Read,,item,false,',
    "Record 3: Non-empty Checklist",
  ],
])(
  "invalid CSV is rejected with an English logical-record error: %s",
  async (text, error) => {
    await expect(prepareCsv(new Blob([text]))).rejects.toThrow(error);
  },
);

test("CSV rejects invalid UTF-8, files above 5 MiB and more than 100,000 logical records", async () => {
  await expect(prepareCsv(new Blob([new Uint8Array([0xff])]))).rejects.toThrow(
    "Invalid encoding",
  );
  await expect(
    prepareCsv(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)])),
  ).rejects.toThrow("5 MiB");
  await expect(
    prepareCsv(new Blob([header + "\n".repeat(100_001)])),
  ).rejects.toThrow("100,000 logical records");
});
