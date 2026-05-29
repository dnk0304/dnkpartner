import { db, execute } from '@/lib/db';

type TableColumn = {
  name: string;
};

const ALERT_COLUMNS: Array<{ name: string; definition: string }> = [
  { name: 'name', definition: 'TEXT' },
  { name: 'municipality', definition: 'TEXT' },
  { name: 'source', definition: 'TEXT' },
  { name: 'auctionType', definition: 'TEXT' },
  { name: 'statuses', definition: 'TEXT' },
  { name: 'keywords', definition: 'TEXT' },
  { name: 'emailEnabled', definition: 'INTEGER DEFAULT 1' },
  { name: 'smsEnabled', definition: 'INTEGER DEFAULT 0' },
  { name: 'notificationType', definition: "TEXT DEFAULT 'grouped'" },
];

export function ensureAlertSchema() {
  const columns = db.prepare('PRAGMA table_info(Alert)').all() as TableColumn[];
  const existing = new Set(columns.map((column) => column.name));

  ALERT_COLUMNS.forEach((column) => {
    if (!existing.has(column.name)) {
      execute(`ALTER TABLE Alert ADD COLUMN ${column.name} ${column.definition}`);
    }
  });
}
