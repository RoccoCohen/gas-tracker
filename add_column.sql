IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('rv_gas') AND name = 'added_by'
)
ALTER TABLE rv_gas ADD added_by NVARCHAR(100) NULL;
