-- Apply before deploying the matching client. No PDF blobs are uploaded.
ALTER TABLE public.blank_pages ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.replace_study_collection(
  p_collection text, p_document_id text, p_page_key text, p_rows jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_columns text;
  v_doc_column text := 'document_id';
  v_scope jsonb;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected an array'; END IF;
  CASE p_collection
    WHEN 'text_notes' THEN
      IF p_page_key IS NULL THEN RAISE EXCEPTION 'Page required'; END IF;
      v_columns := 'id,user_id,document_id,page_key,x,y,width,height,content,font_size,color,category';
    WHEN 'bookmarks' THEN v_columns := 'id,user_id,document_id,virtual_index,label,created_at';
    WHEN 'key_terms' THEN v_columns := 'id,user_id,document_id,term,definition,created_at';
    WHEN 'blank_pages' THEN v_columns := 'id,user_id,document_id,insert_after_page,canvas_data,images,bg_theme,created_at';
    WHEN 'flashcards' THEN
      IF p_page_key IS NULL THEN RAISE EXCEPTION 'Page required'; END IF;
      v_doc_column := 'doc_id';
      v_columns := 'user_id,doc_id,page_num,question,answer';
    ELSE RAISE EXCEPTION 'Unsupported collection';
  END CASE;
  -- Same scope serializes across tabs/devices; transaction rollback retains old rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_collection || ':' || p_document_id || ':' || coalesce(p_page_key,''), 0));
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id::text = p_document_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Document does not exist or is not owned by caller';
  END IF;
  v_scope := jsonb_build_object('user_id', v_uid, v_doc_column, p_document_id);
  IF p_collection = 'text_notes' THEN v_scope := v_scope || jsonb_build_object('page_key', p_page_key); END IF;
  IF p_collection = 'flashcards' THEN v_scope := v_scope || jsonb_build_object('page_num', p_page_key::integer); END IF;
  SELECT coalesce(jsonb_agg(value || v_scope), '[]'::jsonb) INTO v_rows FROM jsonb_array_elements(p_rows);
  -- Names and columns come only from the allowlist above. Scope fields cannot be supplied by clients.
  EXECUTE format('DELETE FROM public.%I AS r WHERE to_jsonb(r) @> $1', p_collection) USING v_scope;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)',
    p_collection, v_columns, v_columns, p_collection) USING v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_study_collection(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_study_collection(text,text,text,jsonb) TO authenticated;
