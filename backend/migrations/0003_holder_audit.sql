-- UniVault – record which staff member created each holder record (audit trail)
ALTER TABLE holders
  ADD COLUMN created_by_staff_id uuid REFERENCES issuer_staff (id) ON DELETE SET NULL;
