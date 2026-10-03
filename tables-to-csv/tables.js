// Runs in the page (session.evaluate): every data table as a full grid, merged cells (rowspan, colspan) filled in,
// footnote marks left out. One expression; returns plain JSON.
(() => {
  const text = (cell) => {
    const c = cell.cloneNode(true);
    c.querySelectorAll("sup.reference, .reference, .sortkey, style, script, .mw-editsection").forEach((n) => n.remove());
    return (c.innerText || c.textContent || "").replace(/\[\d+\]|\[[a-z]\]/g, "").replace(/\s+/g, " ").trim();
  };
  // Encyclopedia pages mark data tables; elsewhere take every table with at least two rows and two columns.
  const marked = [...document.querySelectorAll("table.wikitable")];
  const tables = (marked.length ? marked : [...document.querySelectorAll("table")]).filter(
    (t) => !t.closest("table table") && t.rows.length >= 2 && Math.max(...[...t.rows].map((r) => r.cells.length)) >= 2,
  );
  return tables.slice(0, 30).map((t, index) => {
    const grid = [];
    const isHead = [];
    [...t.rows].forEach((tr, r) => {
      grid[r] ??= [];
      let c = 0;
      for (const cell of tr.cells) {
        while (grid[r][c] !== undefined) c++;
        const rs = Math.max(1, cell.rowSpan || 1);
        const cs = Math.max(1, cell.colSpan || 1);
        const v = text(cell);
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) (grid[r + i] ??= [])[c + j] = v;
        c += cs;
      }
      isHead[r] = [...tr.cells].every((cell) => cell.tagName === "TH");
    });
    const width = Math.max(...grid.map((row) => row.length));
    const rows = grid.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
    // Leading all-header rows form the header; several of them are joined per column ("Lighthouse / Name").
    let headerRows = 0;
    while (headerRows < rows.length - 1 && isHead[headerRows]) headerRows++;
    const headers = Array.from({ length: width }, (_, col) => {
      const parts = [];
      for (let r = 0; r < headerRows; r++) if (!parts.includes(rows[r][col])) parts.push(rows[r][col]);
      return parts.filter(Boolean).join(" / ") || `Column ${col + 1}`;
    });
    const data = rows.slice(headerRows).filter((row) => row.some((v) => v !== ""));
    return { index: index + 1, caption: t.caption ? text(t.caption) : "", headers, rows: data, headerRows, domDataRows: data.length };
  });
})()
