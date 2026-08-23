// Fetch every row from a table, paging past PostgREST's 1000-row response cap.
export async function fetchAll(supabase: any, table: string): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}
