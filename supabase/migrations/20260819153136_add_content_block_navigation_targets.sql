/* Source-authored internal navigation for structured content blocks. */

ALTER TABLE content_blocks
  ADD COLUMN IF NOT EXISTS navigation_target jsonb;

ALTER TABLE content_blocks
  ADD CONSTRAINT content_blocks_navigation_target_shape
  CHECK (
    navigation_target IS NULL OR (
      jsonb_typeof(navigation_target) = 'object'
      AND jsonb_typeof(navigation_target->'bookPartId') = 'string'
      AND (navigation_target->>'bookPartId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof(navigation_target->'printedPageNumber') = 'number'
      AND (navigation_target->>'printedPageNumber')::numeric > 0
      AND mod((navigation_target->>'printedPageNumber')::numeric, 1) = 0
      AND (
        NOT navigation_target ? 'pageId'
        OR navigation_target->'pageId' = 'null'::jsonb
        OR (
          jsonb_typeof(navigation_target->'pageId') = 'string'
          AND (navigation_target->>'pageId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    )
  );

COMMENT ON COLUMN content_blocks.navigation_target IS
  'Optional source-authored internal reader target. Public text remains text_content only.';
