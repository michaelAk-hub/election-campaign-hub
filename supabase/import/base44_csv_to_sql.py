#!/usr/bin/env python3
"""
Convert a Base44 CSV export into ready-to-run Postgres INSERT SQL for Supabase.

Usage:
    python3 base44_csv_to_sql.py <TableName> <export.csv> [> out.sql]

- Column TYPES are read from ../schema.sql (single source of truth), so casting
  (jsonb / boolean / integer / numeric / timestamptz / text) is always correct.
- Only columns that exist in BOTH the schema and the CSV are inserted. Base44's
  extra columns (created_by_id, is_sample) are ignored automatically.
- Empty CSV values ("") become NULL (so empty jsonb cells don't error).
- Base44 "id" is preserved. Re-running is safe via ON CONFLICT (id) DO NOTHING.
"""
import csv, json, re, sys, os

BATCH = 500

def load_schema_types(schema_path):
    """Parse schema.sql -> { TableName: { colName: pgtype } }."""
    text = open(schema_path, encoding="utf-8").read()
    tables = {}
    # Match:  create table if not exists public."Name" ( ... );
    for m in re.finditer(r'create table if not exists public\."([^"]+)"\s*\((.*?)\n\);',
                          text, re.IGNORECASE | re.DOTALL):
        name, body = m.group(1), m.group(2)
        cols = {}
        for line in body.splitlines():
            lm = re.match(r'\s*"([^"]+)"\s+([a-zA-Z]+)', line)
            if lm:
                cols[lm.group(1)] = lm.group(2).lower()
        tables[name] = cols
    return tables

def sql_str(v):
    return "'" + v.replace("'", "''") + "'"

def cast(value, pgtype):
    if value is None:
        return "NULL"
    v = value.strip()
    if v == "":
        return "NULL"
    if pgtype == "jsonb":
        try:
            json.loads(v)              # validate
            return sql_str(v) + "::jsonb"
        except Exception:
            return "NULL"
    if pgtype == "boolean":
        low = v.lower()
        if low in ("true", "t", "1"):  return "true"
        if low in ("false", "f", "0"): return "false"
        return "NULL"
    if pgtype in ("integer", "numeric"):
        try:
            float(v)
            return v
        except Exception:
            return "NULL"
    if pgtype == "timestamptz":
        return sql_str(v)              # Postgres parses ISO 8601 (UTC assumed)
    return sql_str(v)                  # text and anything else

def main():
    if len(sys.argv) < 3:
        sys.exit("usage: base44_csv_to_sql.py <TableName> <export.csv>")
    table, csv_path = sys.argv[1], sys.argv[2]
    schema_path = os.path.join(os.path.dirname(__file__), "..", "schema.sql")
    types = load_schema_types(schema_path)
    if table not in types:
        sys.exit(f"Unknown table '{table}'. Known: {', '.join(sorted(types))}")
    coltypes = types[table]

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        # columns present in both schema and CSV, schema order
        use_cols = [c for c in coltypes if c in headers]
        rows = list(reader)

    out = sys.stdout
    out.write(f"-- {table}: {len(rows)} rows from {os.path.basename(csv_path)}\n")
    out.write("begin;\n")
    collist = ", ".join(f'"{c}"' for c in use_cols)
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        out.write(f'insert into public."{table}" ({collist}) values\n')
        vals = []
        for r in chunk:
            cells = [cast(r.get(c), coltypes[c]) for c in use_cols]
            vals.append("  (" + ", ".join(cells) + ")")
        out.write(",\n".join(vals))
        out.write("\non conflict (\"id\") do nothing;\n")
    out.write("commit;\n")

if __name__ == "__main__":
    main()
