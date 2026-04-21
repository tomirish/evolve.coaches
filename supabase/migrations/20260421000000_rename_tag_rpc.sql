CREATE OR REPLACE FUNCTION rename_tag(p_tag_id uuid, p_old_name text, p_new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE tags SET name = p_new_name WHERE id = p_tag_id;
  UPDATE movements SET tags = array_replace(tags, p_old_name, p_new_name) WHERE p_old_name = ANY(tags);
END;
$$;
